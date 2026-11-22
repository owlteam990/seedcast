/**
 * 新建图文：标题 / 描述 / 多图（经第三方图床）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import {
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import type { EngineClient } from './api';

/**
 * 图文草稿中的一张图
 */
interface DraftImage {
  /** 本地预览 data URL */
  preview: string;
  /** 图床公网 URL（上传成功后） */
  remoteUrl: string;
  /** 本地绝对路径 */
  localPath: string;
  /** 上传中 */
  uploading?: boolean;
}

/**
 * 新建图文表单（分步）
 *
 * @param props 引擎与回调
 * @returns JSX
 */
export function ImageTextComposer(props: {
  client: EngineClient | null;
  onCreated: (contentId: string) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
}): ReactNode {
  const { client, onCreated, onCancel, onError } = props;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<DraftImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /**
   * 选中/拖入文件 → 图床上传
   *
   * @param files 文件列表
   */
  const addFiles = async (files: FileList | File[]): Promise<void> => {
    if (!client) {
      onError?.('请先连接引擎');
      return;
    }
    const list = Array.from(files).filter((f) => {
      return f.type.startsWith('image/');
    });
    if (list.length === 0) {
      return;
    }
    for (const file of list) {
      const preview = await readFileAsDataUrl(file);
      const placeholder: DraftImage = {
        preview,
        remoteUrl: '',
        localPath: '',
        uploading: true,
      };
      setImages((prev) => {
        return [...prev, placeholder];
      });
      const indexAtAdd = images.length;
      try {
        const saved = await client.uploadAssetRemote({
          mime: file.type || 'image/png',
          dataBase64: preview,
          filename: file.name || 'image.png',
        });
        setImages((prev) => {
          const next = [...prev];
          // 找到仍 uploading 且 preview 匹配的项
          const i = next.findIndex((x) => {
            return x.uploading && x.preview === preview;
          });
          const slot = i >= 0 ? i : Math.min(indexAtAdd, next.length - 1);
          if (slot >= 0 && next[slot]) {
            next[slot] = {
              preview,
              remoteUrl: saved.remoteUrl,
              localPath: saved.path,
              uploading: false,
            };
          }
          return next;
        });
      } catch (err) {
        setImages((prev) => {
          return prev.filter((x) => {
            return !(x.uploading && x.preview === preview);
          });
        });
        onError?.(err instanceof Error ? err.message : String(err));
      }
    }
  };

  /**
   * 创建图文内容
   */
  const onSubmit = async (): Promise<void> => {
    if (!client) {
      onError?.('请先连接引擎');
      return;
    }
    const t = title.trim();
    if (!t) {
      onError?.('请填写图文标题');
      return;
    }
    const ready = images.filter((x) => {
      return x.remoteUrl && !x.uploading;
    });
    if (ready.length === 0) {
      onError?.('请至少上传一张图片（将走第三方图床）');
      return;
    }
    setSaving(true);
    try {
      const res = await client.createContent({
        title: t,
        markdown: description,
        assets: ready.map((x) => {
          return x.remoteUrl;
        }),
        contentType: 'imageText',
      });
      onCreated(res.content.id);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  /**
   * 拖放
   *
   * @param e 事件
   */
  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) {
      void addFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="image-text-composer">
      <header className="itc-head">
        <span className="itc-badge" aria-hidden>
          ▦
        </span>
        <h2>新建图文</h2>
      </header>

      <section className="itc-step">
        <div className="itc-step-label">
          <span className="itc-num">1</span>
          标题
        </div>
        <input
          className="itc-input"
          placeholder="输入图文标题"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </section>

      <section className="itc-step">
        <div className="itc-step-label">
          <span className="itc-num">2</span>
          描述
        </div>
        <textarea
          className="itc-textarea"
          placeholder="添加描述… 支持 #话题# 和 @用户"
          value={description}
          rows={5}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
      </section>

      <section className="itc-step">
        <div className="itc-step-label">
          <span className="itc-num">3</span>
          图片
          <span className="muted itc-hint">上传后自动走设置中的免费图床</span>
        </div>
        <div
          className={
            dragging ? 'itc-dropzone dragging' : 'itc-dropzone'
          }
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
          onDrop={onDrop}
        >
          <div className="itc-thumbs">
            {images.map((img, idx) => {
              return (
                <div key={`${img.preview.slice(0, 32)}-${idx}`} className="itc-thumb">
                  <img src={img.preview} alt="" />
                  {img.uploading ? (
                    <span className="itc-thumb-mask">上传中…</span>
                  ) : (
                    <button
                      type="button"
                      className="itc-thumb-remove"
                      title="移除"
                      onClick={() => {
                        setImages((prev) => {
                          return prev.filter((_, i) => {
                            return i !== idx;
                          });
                        });
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="itc-add"
              disabled={!client}
              onClick={() => {
                fileRef.current?.click();
              }}
            >
              <span className="itc-add-icon">＋</span>
              <span>添加图片</span>
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) {
              void addFiles(e.target.files);
            }
            e.target.value = '';
          }}
        />
      </section>

      <footer className="itc-foot">
        <button type="button" className="btn secondary" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="btn"
          disabled={!client || saving}
          onClick={() => {
            void onSubmit();
          }}
        >
          {saving ? '创建中…' : '创建图文'}
        </button>
      </footer>
    </div>
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
