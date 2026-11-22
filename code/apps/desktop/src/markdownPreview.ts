/**
 * Markdown → HTML 预览（轻量，覆盖常用语法）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

/**
 * 预览主题
 */
export type PreviewTheme = 'classic' | 'github' | 'github-dark';

/**
 * 转义 HTML
 *
 * @param s 原文
 * @returns 转义后
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 行内样式：图 / 链 / 代码 / 粗斜删
 *
 * @param line 一行
 * @param rewriteImg 图片 src 改写
 * @returns HTML 片段
 */
function inlineFormat(
  line: string,
  rewriteImg: (src: string) => string,
): string {
  let s = escapeHtml(line);
  s = s.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_m, alt: string, src: string) => {
      const href = rewriteImg(src);
      return `<img src="${escapeHtml(href)}" alt="${alt}" />`;
    },
  );
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
  return s;
}

/**
 * 标题锚点 id（与目录跳转一致）
 *
 * @param lineIndex 行号
 * @returns id
 */
export function headingAnchorId(lineIndex: number): string {
  return `md-h-${lineIndex}`;
}

/**
 * Markdown 转预览 HTML
 *
 * @param md Markdown
 * @param rewriteImg 可选图片地址改写
 * @returns HTML
 * @author Seedcast
 * @date 2026-11-21
 */
export function markdownToPreviewHtml(
  md: string,
  rewriteImg: (src: string) => string = (s) => {
    return s;
  },
): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeLang = '';
  let codeBuf: string[] = [];
  let inBq = false;

  const closeLists = (): void => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  const closeBq = (): void => {
    if (inBq) {
      out.push('</blockquote>');
      inBq = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      if (inCode) {
        out.push(
          `<pre class="md-code" data-lang="${escapeHtml(codeLang)}"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`,
        );
        codeBuf = [];
        codeLang = '';
        inCode = false;
      } else {
        closeLists();
        closeBq();
        inCode = true;
        codeLang = line.trimStart().slice(3).trim();
      }
      i += 1;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      closeLists();
      closeBq();
      out.push('<hr />');
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      closeLists();
      closeBq();
      const level = heading[1].length;
      const text = heading[2].replace(/#+\s*$/, '').trim();
      const id = headingAnchorId(i);
      out.push(
        `<h${level} id="${id}">${inlineFormat(text, rewriteImg)}</h${level}>`,
      );
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeLists();
      if (!inBq) {
        out.push('<blockquote>');
        inBq = true;
      }
      const body = line.replace(/^>\s?/, '');
      if (body.trim() === '') {
        out.push('<br />');
      } else {
        out.push(`<p>${inlineFormat(body, rewriteImg)}</p>`);
      }
      i += 1;
      continue;
    }
    if (inBq) {
      closeBq();
    }

    const task = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (task) {
      if (!inUl) {
        closeLists();
        out.push('<ul class="md-task-list">');
        inUl = true;
      }
      const checked = task[1].toLowerCase() === 'x';
      out.push(
        `<li class="md-task"><input type="checkbox" disabled ${checked ? 'checked' : ''} /> ${inlineFormat(task[2], rewriteImg)}</li>`,
      );
      i += 1;
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      if (!inUl) {
        closeLists();
        out.push('<ul>');
        inUl = true;
      }
      out.push(
        `<li>${inlineFormat(line.replace(/^[-*+]\s+/, ''), rewriteImg)}</li>`,
      );
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (!inOl) {
        closeLists();
        out.push('<ol>');
        inOl = true;
      }
      out.push(
        `<li>${inlineFormat(line.replace(/^\d+\.\s+/, ''), rewriteImg)}</li>`,
      );
      i += 1;
      continue;
    }

    if (line.trim() === '') {
      closeLists();
      i += 1;
      continue;
    }

    closeLists();
    out.push(`<p>${inlineFormat(line, rewriteImg)}</p>`);
    i += 1;
  }

  if (inCode) {
    out.push(
      `<pre class="md-code"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`,
    );
  }
  closeLists();
  closeBq();
  return out.join('\n');
}
