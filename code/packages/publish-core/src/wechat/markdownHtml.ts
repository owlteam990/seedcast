/**
 * Markdown → 微信公众号可用的内联样式 HTML（最小集）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

/**
 * 转义 HTML 特殊字符
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
 * 行内 Markdown（粗体/斜体/代码/链接）
 *
 * @param line 行
 * @returns HTML 片段
 */
function inlineFormat(line: string): string {
  let s = escapeHtml(line);
  s = s.replace(
    /`([^`]+)`/g,
    '<code style="font-family:Menlo,monospace;font-size:14px!important;background:#f6f8fa;padding:2px 4px;border-radius:3px;">$1</code>',
  );
  s = s.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong style="font-weight:600!important;">$1</strong>',
  );
  s = s.replace(
    /\*([^*]+)\*/g,
    '<em style="font-style:italic!important;">$1</em>',
  );
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" style="color:#576b95!important;text-decoration:none;">$1</a>',
  );
  return s;
}

/**
 * Markdown 转微信 HTML
 *
 * @param markdown 正文
 * @returns 内联样式 HTML
 * @author Seedcast
 * @date 2026-11-21
 */
export function markdownToWechatHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let i = 0;
  let inCode = false;
  let codeBuf: string[] = [];

  const flushPara = (buf: string[]): void => {
    const text = buf.join('\n').trim();
    if (!text) {
      return;
    }
    blocks.push(
      `<p style="margin:0 0 1em 0!important;line-height:1.75!important;font-size:16px!important;color:#333!important;text-indent:0!important;">${inlineFormat(text)}</p>`,
    );
  };

  let para: string[] = [];

  while (i < lines.length) {
    const line = lines[i];

    // 1. 代码块
    if (line.trim().startsWith('```')) {
      if (inCode) {
        const code = escapeHtml(codeBuf.join('\n'));
        blocks.push(
          `<pre style="margin:0 0 1em 0!important;padding:12px!important;background:#f6f8fa!important;border-radius:6px!important;overflow-x:auto!important;font-size:13px!important;line-height:1.5!important;text-indent:0!important;"><code style="font-family:Menlo,monospace;">${code}</code></pre>`,
        );
        codeBuf = [];
        inCode = false;
      } else {
        flushPara(para);
        para = [];
        inCode = true;
      }
      i += 1;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i += 1;
      continue;
    }

    // 2. 空行 → 结束段落
    if (line.trim() === '') {
      flushPara(para);
      para = [];
      i += 1;
      continue;
    }

    // 3. 标题
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushPara(para);
      para = [];
      const level = heading[1].length;
      const size = level === 1 ? 22 : level === 2 ? 20 : 18;
      blocks.push(
        `<h${level} style="margin:1.2em 0 0.6em 0!important;font-size:${size}px!important;font-weight:600!important;line-height:1.4!important;color:#1a1a1a!important;text-indent:0!important;">${inlineFormat(heading[2])}</h${level}>`,
      );
      i += 1;
      continue;
    }

    // 4. 引用
    if (line.trim().startsWith('>')) {
      flushPara(para);
      para = [];
      const quote = line.replace(/^\s*>\s?/, '');
      blocks.push(
        `<blockquote style="margin:0 0 1em 0!important;padding:8px 12px!important;border-left:4px solid:#ddd!important;color:#666!important;background:#fafafa!important;text-indent:0!important;">${inlineFormat(quote)}</blockquote>`,
      );
      i += 1;
      continue;
    }

    // 5. 无序列表
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara(para);
      para = [];
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(
          `<li style="margin:0 0 0.35em 0!important;line-height:1.7!important;text-indent:0!important;">${inlineFormat(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`,
        );
        i += 1;
      }
      blocks.push(
        `<ul style="margin:0 0 1em 0!important;padding-left:1.4em!important;text-indent:0!important;">${items.join('')}</ul>`,
      );
      continue;
    }

    // 6. 图片
    const img = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line.trim());
    if (img) {
      flushPara(para);
      para = [];
      blocks.push(
        `<p style="margin:0 0 1em 0!important;text-align:center!important;text-indent:0!important;"><img src="${escapeHtml(img[2])}" alt="${escapeHtml(img[1])}" style="max-width:100%!important;border-radius:8px!important;"></p>`,
      );
      i += 1;
      continue;
    }

    para.push(line);
    i += 1;
  }

  flushPara(para);
  if (inCode && codeBuf.length > 0) {
    blocks.push(
      `<pre style="margin:0 0 1em 0!important;padding:12px!important;background:#f6f8fa!important;"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`,
    );
  }

  const inner = blocks.join('');
  // 压缩标签间空白，减少微信编辑器空行
  const compact = inner.replace(/>\s+</g, '><');
  return `<div style="max-width:100%;margin:0 auto;padding:0;font-size:16px!important;line-height:1.75!important;color:#333!important;text-indent:0!important;">${compact}</div>`;
}

/**
 * 轻度清洗：去掉 style 块与危险属性（已是内联输出时主要压缩空白）
 *
 * @param html HTML
 * @returns 清洗后
 * @author Seedcast
 * @date 2026-11-21
 */
export function sanitizeWechatHtml(html: string): string {
  let s = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/\s(box-shadow|text-shadow)\s*:[^;"]*;?/gi, '');
  s = s.replace(/section/gi, 'div');
  s = s.replace(/>\s+</g, '><');
  return s;
}
