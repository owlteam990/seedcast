/**
 * SSE 响应辅助
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import type { ServerResponse } from 'node:http';
import type { ProgressEvent } from '@seedcast/shared';

/**
 * 将响应升级为 SSE 流（保留已设置的 CORS 头）
 *
 * @param res 响应
 * @author Seedcast
 * @date 2026-11-21
 */
export function initSse(res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

/**
 * 发送一条进度事件
 *
 * @param res 响应
 * @param event 进度事件
 * @author Seedcast
 * @date 2026-11-21
 */
export function sendSseEvent(res: ServerResponse, event: ProgressEvent): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * 结束 SSE
 *
 * @param res 响应
 * @author Seedcast
 * @date 2026-11-21
 */
export function endSse(res: ServerResponse): void {
  res.end();
}
