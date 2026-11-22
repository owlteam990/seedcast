/**
 * 微信字段按字节/字符截断
 *
 * @author Seedcast
 * @date 2026-11-21
 */

/** 标题最大字符数 */
export const WECHAT_MAX_TITLE_CHARS = 64;

/** 作者最大字节数 */
export const WECHAT_MAX_AUTHOR_BYTES = 20;

/** 摘要最大字节数 */
export const WECHAT_MAX_DIGEST_BYTES = 120;

/**
 * 按 UTF-8 字节数截断
 *
 * @param text 原文
 * @param maxBytes 最大字节
 * @returns 截断结果
 * @author Seedcast
 * @date 2026-11-21
 */
export function truncateByBytes(text: string, maxBytes: number): string {
  const encoded = Buffer.from(text, 'utf8');
  if (encoded.length <= maxBytes) {
    return text;
  }
  for (let i = text.length; i > 0; i -= 1) {
    const truncated = text.slice(0, i);
    if (Buffer.byteLength(truncated, 'utf8') <= maxBytes) {
      return truncated;
    }
  }
  return '';
}

/**
 * 截断标题（优先按字符）
 *
 * @param title 标题
 * @returns 截断后标题
 * @author Seedcast
 * @date 2026-11-21
 */
export function truncateTitle(title: string): string {
  if (title.length > WECHAT_MAX_TITLE_CHARS) {
    return title.slice(0, WECHAT_MAX_TITLE_CHARS);
  }
  return truncateByBytes(title, WECHAT_MAX_TITLE_CHARS * 3);
}
