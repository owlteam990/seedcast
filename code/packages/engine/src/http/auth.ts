/**
 * 本地 API Token 认证
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * 从请求头提取 Token（支持 Authorization: <token> 或 Bearer <token>）
 *
 * @param req 请求
 * @returns Token 或 null
 * @author Seedcast
 * @date 2026-11-21
 */
export function extractToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (header && typeof header === 'string') {
    const trimmed = header.trim();
    if (trimmed.toLowerCase().startsWith('bearer ')) {
      return trimmed.slice(7).trim();
    }
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  // 素材预览等：允许 ?token=（img 无法带 Authorization）
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const q = url.searchParams.get('token');
    if (q && q.trim()) {
      return q.trim();
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * 校验 Token；失败时写入 401 并返回 false
 *
 * @param req 请求
 * @param res 响应
 * @param expected 期望 Token
 * @returns 是否通过
 * @author Seedcast
 * @date 2026-11-21
 */
export function assertAuthorized(
  req: IncomingMessage,
  res: ServerResponse,
  expected: string,
): boolean {
  const token = extractToken(req);
  if (!token || token !== expected) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
    return false;
  }
  return true;
}
