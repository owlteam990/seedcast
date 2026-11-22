/**
 * Markdown 编辑辅助：选区包裹、目录、字数
 *
 * @author Seedcast
 * @date 2026-11-21
 */

/**
 * 目录项
 */
export interface TocItem {
  /** 唯一键 */
  id: string;
  /** 标题层级 1–6 */
  level: number;
  /** 标题文本 */
  text: string;
  /** 所在行（0-based） */
  line: number;
}

/**
 * 统计信息
 */
export interface MdStats {
  /** 字符数（含空白） */
  chars: number;
  /** 字数：中文按字、英文按词粗估 */
  words: number;
  /** 阅读分钟（约 300 字/分） */
  minutes: number;
  /** 行数 */
  lines: number;
}

/**
 * 从 Markdown 提取标题目录
 *
 * @param md 正文
 * @returns 目录
 */
export function extractToc(md: string): TocItem[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const items: TocItem[] = [];
  let inCode = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trimStart().startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      continue;
    }
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!m) {
      continue;
    }
    const level = m[1].length;
    const text = m[2].replace(/#+\s*$/, '').trim();
    items.push({
      id: `toc-${i}-${level}`,
      level,
      text,
      line: i,
    });
  }
  return items;
}

/**
 * 统计 Markdown 字数与阅读时间
 *
 * @param md 正文
 * @returns 统计
 */
export function calcMdStats(md: string): MdStats {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const chars = md.length;
  // 粗估：连续 CJK 计字；拉丁词计词
  const cjk = (md.match(/[\u4e00-\u9fff]/g) ?? []).join('').length;
  const latin = (md.match(/[A-Za-z0-9]+/g) ?? []).length;
  const words = cjk + latin;
  const minutes = Math.max(1, Math.ceil(words / 300));
  return { chars, words, minutes, lines: lines.length };
}

/**
 * 在 textarea 选区两侧插入标记；无选区时插入占位并选中
 *
 * @param value 当前正文
 * @param start 选区起
 * @param end 选区止
 * @param before 前缀
 * @param after 后缀
 * @param placeholder 无选区时的占位
 * @returns 新正文与新选区
 */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder = '文本',
): { next: string; selStart: number; selEnd: number } {
  const selected = value.slice(start, end);
  if (selected.length === 0) {
    const insert = `${before}${placeholder}${after}`;
    const next = value.slice(0, start) + insert + value.slice(end);
    const selStart = start + before.length;
    const selEnd = selStart + placeholder.length;
    return { next, selStart, selEnd };
  }
  const next =
    value.slice(0, start) + before + selected + after + value.slice(end);
  return {
    next,
    selStart: start,
    selEnd: start + before.length + selected.length + after.length,
  };
}

/**
 * 对选中的每一行加/切换行首前缀（列表、引用、标题）
 *
 * @param value 正文
 * @param start 选区起
 * @param end 选区止
 * @param prefix 行前缀，如 `- ` / `> ` / `## `
 * @returns 新正文与选区
 */
export function toggleLinePrefix(
  value: string,
  start: number,
  end: number,
  prefix: string,
): { next: string; selStart: number; selEnd: number } {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let lineEnd = value.indexOf('\n', end);
  if (lineEnd < 0) {
    lineEnd = value.length;
  }
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const allPrefixed = lines.every((l) => {
    return l.startsWith(prefix) || l.trim() === '';
  });
  const mapped = lines.map((l) => {
    if (l.trim() === '') {
      return l;
    }
    if (allPrefixed) {
      return l.startsWith(prefix) ? l.slice(prefix.length) : l;
    }
    // 去掉已有标题/列表前缀再加
    const stripped = l.replace(/^(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)/, '');
    return prefix + stripped;
  });
  const replaced = mapped.join('\n');
  const next = value.slice(0, lineStart) + replaced + value.slice(lineEnd);
  return {
    next,
    selStart: lineStart,
    selEnd: lineStart + replaced.length,
  };
}

/**
 * 在光标处插入文本
 *
 * @param value 正文
 * @param start 光标
 * @param end 选区止
 * @param text 插入内容
 * @returns 新正文与光标
 */
export function insertAtCursor(
  value: string,
  start: number,
  end: number,
  text: string,
): { next: string; selStart: number; selEnd: number } {
  const next = value.slice(0, start) + text + value.slice(end);
  const pos = start + text.length;
  return { next, selStart: pos, selEnd: pos };
}
