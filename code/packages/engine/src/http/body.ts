/**
 * 读取请求 JSON Body
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import type { IncomingMessage } from 'node:http';

/**
 * 读取并解析 JSON body
 *
 * @param req 请求
 * @param limitBytes 最大字节数
 * @returns 解析结果
 * @author Seedcast
 * @date 2026-11-21
 */
export async function readJsonBody(
  req: IncomingMessage,
  limitBytes = 2 * 1024 * 1024,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > limitBytes) {
      throw new Error('请求体过大');
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return {};
  }
  return JSON.parse(text) as unknown;
}
