/**
 * 简书写作台 Web API 客户端（Cookie）
 * 协议形态参考公开社区实现，洁净室重写；非 GPL 源码拷贝。
 *
 * @author Seedcast
 * @date 2026-11-22
 */

/** 简书站点根 */
export const JIANSHU_ORIGIN = 'https://www.jianshu.com';

/**
 * 会话内 fetch
 */
export type CookieFetch = (
  url: string,
  init?: RequestInit,
  extraHeaders?: Record<string, string>,
) => Promise<Response>;

/**
 * 简书 JSON API 常用头
 *
 * @returns 请求头
 */
function jianshuJsonHeaders(): Record<string, string> {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    Origin: JIANSHU_ORIGIN,
    Referer: `${JIANSHU_ORIGIN}/writer`,
  };
}

/**
 * 从简书错误响应提取可读文案
 *
 * @param body 响应体
 * @param fallback 回退文案
 * @returns 可读错误
 */
function formatJianshuError(
  body: {
    message?: string;
    error?: Array<{ code?: number; message?: string }> | unknown;
  },
  fallback: string,
): string {
  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message.trim();
  }
  if (Array.isArray(body.error) && body.error.length > 0) {
    const first = body.error[0];
    if (first && typeof first.message === 'string' && first.message.trim()) {
      const code =
        typeof first.code === 'number' ? `（code ${first.code}）` : '';
      return `${first.message.trim()}${code}`;
    }
  }
  return fallback;
}

/**
 * 读取当前用户基础信息（登录态探测）
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @returns 用户信息；未登录返回 null
 * @author Seedcast
 * @date 2026-11-22
 */
export async function getJianshuBasicSettings(fetchFn: CookieFetch): Promise<{
  nickname: string;
  avatar: string;
} | null> {
  const res = await fetchFn(
    `${JIANSHU_ORIGIN}/settings/basic.json`,
    { method: 'GET' },
    {
      accept: 'application/json',
      Origin: JIANSHU_ORIGIN,
      Referer: `${JIANSHU_ORIGIN}/settings/basic`,
    },
  );
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as {
    data?: { nickname?: string; avatar?: string };
  };
  if (!body.data?.nickname) {
    return null;
  }
  return {
    nickname: body.data.nickname,
    avatar: body.data.avatar ?? '',
  };
}

/**
 * 文集信息
 */
export interface JianshuNotebook {
  id: number;
  name?: string;
}

/**
 * 列出作者文集
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @returns 文集列表
 * @author Seedcast
 * @date 2026-11-22
 */
export async function listJianshuNotebooks(
  fetchFn: CookieFetch,
): Promise<JianshuNotebook[]> {
  const res = await fetchFn(
    `${JIANSHU_ORIGIN}/author/notebooks`,
    { method: 'GET' },
    jianshuJsonHeaders(),
  );
  if (!res.ok) {
    throw new Error(`获取简书文集失败 (HTTP ${res.status})`);
  }
  const body = (await res.json()) as JianshuNotebook[] | { data?: JianshuNotebook[] };
  if (Array.isArray(body)) {
    return body;
  }
  if (Array.isArray(body.data)) {
    return body.data;
  }
  return [];
}

/**
 * 在指定文集新建空白笔记
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @param input 文集与标题
 * @returns 笔记 ID
 * @author Seedcast
 * @date 2026-11-22
 */
export async function createJianshuNote(
  fetchFn: CookieFetch,
  input: { notebookId: number; title: string },
): Promise<{ noteId: number }> {
  const res = await fetchFn(
    `${JIANSHU_ORIGIN}/author/notes`,
    {
      method: 'POST',
      body: JSON.stringify({
        at_bottom: false,
        notebook_id: input.notebookId,
        title: input.title,
      }),
    },
    jianshuJsonHeaders(),
  );
  const body = (await res.json()) as {
    id?: number;
    error?: Array<{ code?: number; message?: string }> | unknown;
    message?: string;
  };
  if (!res.ok || body.id === undefined) {
    throw new Error(
      formatJianshuError(
        body,
        `新建简书笔记失败 (HTTP ${res.status})`,
      ),
    );
  }
  return { noteId: body.id };
}

/**
 * 更新笔记标题/正文（草稿）
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @param input 笔记内容
 * @author Seedcast
 * @date 2026-11-22
 */
export async function updateJianshuNote(
  fetchFn: CookieFetch,
  input: {
    noteId: number;
    title: string;
    contentHtml: string;
    autosaveControl: number;
  },
): Promise<void> {
  const res = await fetchFn(
    `${JIANSHU_ORIGIN}/author/notes/${input.noteId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        id: input.noteId,
        title: input.title,
        content: input.contentHtml,
        autosave_control: input.autosaveControl,
      }),
    },
    jianshuJsonHeaders(),
  );
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as {
        message?: string;
        error?: Array<{ code?: number; message?: string }> | unknown;
      };
      detail = formatJianshuError(body, detail);
    } catch {
      // ignore
    }
    throw new Error(`更新简书笔记失败: ${detail}`);
  }
}

/**
 * 组装写作台草稿链接
 *
 * @param notebookId 文集 ID
 * @param noteId 笔记 ID
 * @returns writer URL
 */
export function jianshuDraftUrl(notebookId: number, noteId: number): string {
  return `${JIANSHU_ORIGIN}/writer#/notebooks/${notebookId}/notes/${noteId}`;
}
