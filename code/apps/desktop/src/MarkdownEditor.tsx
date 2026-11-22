/**
 * Markdown 精致编辑器：工具栏 / 分栏 / 目录 / 主题 / 快捷键
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import type { EngineClient } from './api';
import {
  headingAnchorId,
  markdownToPreviewHtml,
  type PreviewTheme,
} from './markdownPreview';
import {
  calcMdStats,
  extractToc,
  insertAtCursor,
  toggleLinePrefix,
  wrapSelection,
} from './mdUtils';

/** 编辑区视图模式 */
type ViewMode = 'edit' | 'split' | 'preview';

/** 编辑区字号 */
type EditorFontSize = '13' | '14' | '16' | '18';

/**
 * Markdown 精致编辑器
 *
 * @param props 受控正文与引擎（粘贴/拖拽/插入图）
 * @returns JSX
 */
export function MarkdownEditor(props: {
  value: string;
  onChange: (next: string) => void;
  client: EngineClient | null;
  /**
   * 是否启用公网图床：开启后新粘贴/插入图片走第三方并写入公网 URL
   */
  useRemoteImageHost?: boolean;
  onAssetSaved?: (path: string) => void;
  onError?: (message: string) => void;
}): ReactNode {
  const {
    value,
    onChange,
    client,
    useRemoteImageHost = false,
    onAssetSaved,
    onError,
  } = props;
  const [view, setView] = useState<ViewMode>('split');
  const [theme, setTheme] = useState<PreviewTheme>('classic');
  const [fontSize, setFontSize] = useState<EditorFontSize>('14');
  const [showToc, setShowToc] = useState(true);
  const [pasting, setPasting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const gutterRef = useRef<HTMLPreElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const toc = useMemo(() => {
    return extractToc(value);
  }, [value]);

  const stats = useMemo(() => {
    return calcMdStats(value);
  }, [value]);

  const lineCount = useMemo(() => {
    return Math.max(1, value.split('\n').length);
  }, [value]);

  const lineGutter = useMemo(() => {
    return Array.from({ length: lineCount }, (_, i) => {
      return String(i + 1);
    }).join('\n');
  }, [lineCount]);

  /** 预览区滚动位置：正文更新时避免被拽回顶部（看起来像「自动滚动」） */
  const previewScrollTop = useRef(0);

  const previewHtml = useMemo(() => {
    return markdownToPreviewHtml(value, (src) => {
      if (!client) {
        return src;
      }
      const m = /[/\\]assets[/\\]([^/\\]+)$/.exec(src);
      if (m) {
        return client.assetUrl(m[1]);
      }
      if (
        !src.includes('/') &&
        !src.includes('\\') &&
        /\.(png|jpe?g|gif|webp)$/i.test(src)
      ) {
        return client.assetUrl(src);
      }
      return src;
    });
  }, [value, client]);

  // 预览 HTML 重绘后恢复滚动，避免输入时预览被重置
  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) {
      return;
    }
    el.scrollTop = previewScrollTop.current;
  }, [previewHtml]);

  /**
   * 应用选区变换并恢复焦点
   *
   * @param result 变换结果
   */
  const applyEdit = useCallback(
    (result: { next: string; selStart: number; selEnd: number }) => {
      onChange(result.next);
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (!ta) {
          return;
        }
        ta.focus();
        ta.selectionStart = result.selStart;
        ta.selectionEnd = result.selEnd;
      });
    },
    [onChange],
  );

  /**
   * 读取当前选区
   *
   * @returns 起止
   */
  const selection = useCallback((): { start: number; end: number } => {
    const ta = taRef.current;
    if (!ta) {
      return { start: value.length, end: value.length };
    }
    return { start: ta.selectionStart, end: ta.selectionEnd };
  }, [value.length]);

  /**
   * 工具：包裹标记
   *
   * @param before 前
   * @param after 后
   * @param placeholder 占位
   */
  const doWrap = useCallback(
    (before: string, after: string, placeholder?: string) => {
      const { start, end } = selection();
      applyEdit(
        wrapSelection(value, start, end, before, after, placeholder),
      );
    },
    [applyEdit, selection, value],
  );

  /**
   * 工具：行前缀
   *
   * @param prefix 前缀
   */
  const doPrefix = useCallback(
    (prefix: string) => {
      const { start, end } = selection();
      applyEdit(toggleLinePrefix(value, start, end, prefix));
    },
    [applyEdit, selection, value],
  );

  /**
   * 插入链接
   */
  const insertLink = useCallback(() => {
    const { start, end } = selection();
    const selected = value.slice(start, end) || '链接文字';
    const url = window.prompt('链接地址', 'https://');
    if (!url) {
      return;
    }
    applyEdit(
      insertAtCursor(value, start, end, `[${selected}](${url})`),
    );
  }, [applyEdit, selection, value]);

  /**
   * 插入代码块
   */
  const insertCodeBlock = useCallback(() => {
    const { start, end } = selection();
    const selected = value.slice(start, end);
    if (selected.includes('\n') || selected.length === 0) {
      const body = selected || 'code';
      const text = `\n\`\`\`\n${body}\n\`\`\`\n`;
      applyEdit(insertAtCursor(value, start, end, text));
      return;
    }
    doWrap('`', '`', 'code');
  }, [applyEdit, doWrap, selection, value]);

  /**
   * 图片文件入库并插入 Markdown
   * 公网图床开启时：本机入库 + 上传图床，正文写入公网 URL；关闭时仅写本机路径
   *
   * @param file 图片
   */
  const insertImageFile = async (file: File): Promise<void> => {
    if (!client) {
      onError?.('请先连接引擎后再插入图片');
      return;
    }
    setPasting(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const mime = file.type || 'image/png';
      const filename = file.name || 'image.png';
      if (useRemoteImageHost) {
        const saved = await client.uploadAssetRemote({
          mime,
          dataBase64: dataUrl,
          filename,
        });
        const snippet = `\n![](${saved.remoteUrl})\n`;
        const { start, end } = selection();
        applyEdit(insertAtCursor(value, start, end, snippet));
        onAssetSaved?.(saved.path);
      } else {
        const saved = await client.uploadAsset({
          mime,
          dataBase64: dataUrl,
          filename,
        });
        const snippet = `\n![](${saved.path})\n`;
        const { start, end } = selection();
        applyEdit(insertAtCursor(value, start, end, snippet));
        onAssetSaved?.(saved.path);
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setPasting(false);
    }
  };

  /**
   * 粘贴剪贴板图片
   *
   * @param e 粘贴事件
   */
  const onPaste = async (
    e: ClipboardEvent<HTMLTextAreaElement>,
  ): Promise<void> => {
    if (!client) {
      return;
    }
    const items = e.clipboardData?.items;
    if (!items) {
      return;
    }
    let file: File | null = null;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        file = item.getAsFile();
        break;
      }
    }
    if (!file) {
      return;
    }
    e.preventDefault();
    await insertImageFile(file);
  };

  /**
   * 拖拽图片
   *
   * @param e 拖放
   */
  const onDrop = async (e: DragEvent<HTMLTextAreaElement>): Promise<void> => {
    setDragging(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) {
      return;
    }
    let image: File | null = null;
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        image = f;
        break;
      }
    }
    if (!image) {
      return;
    }
    e.preventDefault();
    await insertImageFile(image);
  };

  /**
   * 快捷键
   *
   * @param e 键盘
   */
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) {
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 'b') {
      e.preventDefault();
      doWrap('**', '**', '粗体');
      return;
    }
    if (key === 'i') {
      e.preventDefault();
      doWrap('*', '*', '斜体');
      return;
    }
    if (key === 'k') {
      e.preventDefault();
      insertLink();
      return;
    }
    if (key === 'e') {
      e.preventDefault();
      doWrap('`', '`', 'code');
    }
  };

  /**
   * 同步行号 gutter（编辑区与预览互不同步滚动）
   *
   * @param e 滚动
   */
  const onEditorScroll = (e: SyntheticEvent<HTMLTextAreaElement>): void => {
    const top = e.currentTarget.scrollTop;
    if (gutterRef.current) {
      gutterRef.current.scrollTop = top;
    }
  };

  /**
   * 点击目录跳到对应行 / 预览锚点
   *
   * @param line 行号
   */
  const jumpToHeading = (line: number): void => {
    const ta = taRef.current;
    if (ta && (view === 'edit' || view === 'split')) {
      const lines = value.split('\n');
      let pos = 0;
      for (let i = 0; i < line && i < lines.length; i += 1) {
        pos += lines[i].length + 1;
      }
      ta.focus();
      ta.selectionStart = pos;
      ta.selectionEnd = pos + (lines[line]?.length ?? 0);
      const lineHeight = Number.parseFloat(getComputedStyle(ta).lineHeight) || 22;
      ta.scrollTop = Math.max(0, line * lineHeight - 40);
      if (gutterRef.current) {
        gutterRef.current.scrollTop = ta.scrollTop;
      }
    }
    const el = previewRef.current?.querySelector(
      `#${headingAnchorId(line)}`,
    );
    if (el && previewRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const showEditor = view === 'edit' || view === 'split';
  const showPreview = view === 'preview' || view === 'split';

  return (
    <div
      className={
        dragging ? 'md-studio dragging' : 'md-studio'
      }
    >
      <div className="md-toolbar" role="toolbar" aria-label="Markdown 工具栏">
        <div className="md-tool-group">
          <ToolBtn title="一级标题" onClick={() => doPrefix('# ')}>
            H1
          </ToolBtn>
          <ToolBtn title="二级标题" onClick={() => doPrefix('## ')}>
            H2
          </ToolBtn>
          <ToolBtn title="三级标题" onClick={() => doPrefix('### ')}>
            H3
          </ToolBtn>
        </div>
        <div className="md-tool-group">
          <ToolBtn title="粗体 ⌘B" onClick={() => doWrap('**', '**', '粗体')}>
            <strong>B</strong>
          </ToolBtn>
          <ToolBtn title="斜体 ⌘I" onClick={() => doWrap('*', '*', '斜体')}>
            <em>I</em>
          </ToolBtn>
          <ToolBtn title="删除线" onClick={() => doWrap('~~', '~~', '删除')}>
            <span className="md-strike">S</span>
          </ToolBtn>
        </div>
        <div className="md-tool-group">
          <ToolBtn title="无序列表" onClick={() => doPrefix('- ')}>
            •≡
          </ToolBtn>
          <ToolBtn title="有序列表" onClick={() => doPrefix('1. ')}>
            1.
          </ToolBtn>
          <ToolBtn title="引用" onClick={() => doPrefix('> ')}>
            “
          </ToolBtn>
          <ToolBtn title="链接 ⌘K" onClick={insertLink}>
            Link
          </ToolBtn>
          <ToolBtn title="行内代码 / 代码块" onClick={insertCodeBlock}>
            {'</>'}
          </ToolBtn>
          <ToolBtn
            title="插入图片"
            disabled={!client || pasting}
            onClick={() => {
              fileRef.current?.click();
            }}
          >
            图
          </ToolBtn>
        </div>
        <div className="md-tool-group md-tool-selects">
          <label className="md-select-label">
            预览
            <select
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value as PreviewTheme);
              }}
            >
              <option value="classic">经典</option>
              <option value="github">GitHub</option>
              <option value="github-dark">github-dark</option>
            </select>
          </label>
          <label className="md-select-label">
            字号
            <select
              value={fontSize}
              onChange={(e) => {
                setFontSize(e.target.value as EditorFontSize);
              }}
            >
              <option value="13">13px</option>
              <option value="14">14px</option>
              <option value="16">16px</option>
              <option value="18">18px</option>
            </select>
          </label>
        </div>
        <div className="md-tool-group md-tool-views">
          <ToolBtn
            title="目录"
            active={showToc}
            onClick={() => {
              setShowToc((v) => {
                return !v;
              });
            }}
          >
            目录
          </ToolBtn>
          <ToolBtn
            title="仅编辑"
            active={view === 'edit'}
            onClick={() => {
              setView('edit');
            }}
          >
            编辑
          </ToolBtn>
          <ToolBtn
            title="分栏"
            active={view === 'split'}
            onClick={() => {
              setView('split');
            }}
          >
            分栏
          </ToolBtn>
          <ToolBtn
            title="仅预览"
            active={view === 'preview'}
            onClick={() => {
              setView('preview');
            }}
          >
            预览
          </ToolBtn>
        </div>
        <div className="md-stats" title={`${stats.chars} 字符 · ${stats.lines} 行`}>
          字数 {stats.words} · 约 {stats.minutes} 分钟
          {pasting
            ? useRemoteImageHost
              ? ' · 上传公网图床…'
              : ' · 保存图片…'
            : ''}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) {
            void insertImageFile(f);
          }
        }}
      />

      <div
        className={
          showToc ? 'md-body md-body-with-toc' : 'md-body'
        }
      >
        {showToc ? (
          <aside className="md-toc" aria-label="文档目录">
            <div className="md-toc-head">目录 ({toc.length})</div>
            {toc.length === 0 ? (
              <p className="muted md-toc-empty">用 # 标题生成目录</p>
            ) : (
              <ul>
                {toc.map((item) => {
                  return (
                    <li key={item.id} data-level={item.level}>
                      <button
                        type="button"
                        onClick={() => {
                          jumpToHeading(item.line);
                        }}
                      >
                        {item.text}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        ) : null}

        <div
          className={
            view === 'split' ? 'md-panes split' : 'md-panes'
          }
        >
          {showEditor ? (
            <div className="md-edit-pane">
              <div className="md-code-wrap">
                <pre
                  ref={gutterRef}
                  className="md-gutter"
                  aria-hidden
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {lineGutter}
                </pre>
                <textarea
                  ref={taRef}
                  className="md-textarea"
                  style={{ fontSize: `${fontSize}px` }}
                  value={value}
                  spellCheck={false}
                  onChange={(e) => {
                    onChange(e.target.value);
                  }}
                  onKeyDown={onKeyDown}
                  onScroll={onEditorScroll}
                  onPaste={(e) => {
                    void onPaste(e);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDragLeave={() => {
                    setDragging(false);
                  }}
                  onDrop={(e) => {
                    void onDrop(e);
                  }}
                  placeholder="开始写作… 支持粘贴/拖拽图片，⌘B / ⌘I / ⌘K"
                />
              </div>
            </div>
          ) : null}

          {showPreview ? (
            <div
              ref={previewRef}
              className={`md-preview theme-${theme}`}
              onScroll={(e) => {
                previewScrollTop.current = e.currentTarget.scrollTop;
              }}
              dangerouslySetInnerHTML={{
                __html:
                  previewHtml ||
                  '<p class="muted">（预览为空，开始在左侧编写 Markdown）</p>',
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * 工具栏按钮
 *
 * @param props 文案与点击
 * @returns JSX
 */
function ToolBtn(props: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}): ReactNode {
  const { title, onClick, children, active, disabled } = props;
  return (
    <button
      type="button"
      className={active ? 'md-tool active' : 'md-tool'}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * File → data URL
 *
 * @param file 文件
 * @returns data URL
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result ?? ''));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('读取文件失败'));
    };
    reader.readAsDataURL(file);
  });
}
