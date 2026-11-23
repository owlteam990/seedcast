/**
 * Markdown → 简易 HTML（供 CSDN / 简书等 Web API 草稿）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

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
 * 行内格式
 *
 * @param line 行
 * @returns HTML
 */
function inlineFormat(line: string): string {
  let s = escapeHtml(line);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2">$1</a>',
  );
  s = s.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
    '<img src="$2" alt="$1" />',
  );
  return s;
}

/**
 * Markdown 转简易 HTML
 *
 * @param markdown 正文
 * @returns HTML
 * @author Seedcast
 * @date 2026-11-22
 */
export function markdownToSimpleHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // 1. 代码块
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i += 1;
      }
      i += 1;
      const code = escapeHtml(codeLines.join('\n'));
      blocks.push(
        `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${code}</code></pre>`,
      );
      continue;
    }

    // 2. 空行
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // 3. 标题
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineFormat(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // 4. 无序列表
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i] ?? '')) {
        items.push(`<li>${inlineFormat((lines[i] ?? '').replace(/^[-*]\s+/, ''))}</li>`);
        i += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // 5. 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? '')) {
        items.push(
          `<li>${inlineFormat((lines[i] ?? '').replace(/^\d+\.\s+/, ''))}</li>`,
        );
        i += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // 6. 引用
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('>')) {
        quoteLines.push((lines[i] ?? '').replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(`<blockquote><p>${inlineFormat(quoteLines.join(' '))}</p></blockquote>`);
      continue;
    }

    // 7. 普通段落（合并连续非空行）
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !/^(#{1,6}\s+|```|[-*]\s+|\d+\.\s+|>)/.test(lines[i] ?? '')
    ) {
      para.push(lines[i] ?? '');
      i += 1;
    }
    blocks.push(`<p>${inlineFormat(para.join(' '))}</p>`);
  }

  return blocks.join('\n');
}
