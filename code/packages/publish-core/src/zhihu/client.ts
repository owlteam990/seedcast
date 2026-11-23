/**
 * 知乎专栏草稿 Web API（Cookie）
 * 协议形态参考公开社区实现，洁净室重写；非 GPL 源码拷贝。
 *
 * 选型：
 * - 官方开放 API：无个人专栏写草稿能力
 * - 现成方案：Wechatsync 等走 zhuanlan drafts API（GPL，仅协议参考）
 * - 本实现：Cookie（Playwright profile）+ 草稿创建/更新
 *
 * @author Seedcast
 * @date 2026-11-23
 */

/** 主站 */
export const ZHIHU_ORIGIN = 'https://www.zhihu.com';

/** 专栏站 */
export const ZHIHU_ZHUANLAN_ORIGIN = 'https://zhuanlan.zhihu.com';

/**
 * 会话内 fetch
 */
export type CookieFetch = (
  url: string,
  init?: RequestInit,
  extraHeaders?: Record<string, string>,
) => Promise<Response>;

/**
 * 从 Cookie 头解析 _xsrf
 *
 * @param cookieHeader Cookie 头
 * @returns xsrf 或空
 */
export function extractZhihuXsrf(cookieHeader: string): string {
  const m = /(?:^|;\s*)_xsrf=([^;]+)/.exec(cookieHeader);
  return m?.[1] ? decodeURIComponent(m[1]) : '';
}

/**
 * 知乎 API 通用头
 *
 * @param xsrf 可选 xsrf
 * @returns 头
 */
function zhihuApiHeaders(xsrf?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json, text/plain, */*',
    'x-requested-with': 'fetch',
    Origin: ZHIHU_ZHUANLAN_ORIGIN,
    Referer: `${ZHIHU_ZHUANLAN_ORIGIN}/write`,
  };
  if (xsrf) {
    headers['X-Xsrftoken'] = xsrf;
  }
  return headers;
}

/**
 * 当前登录用户（v4/me）
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @param xsrf 可选
 * @returns 用户；未登录返回 null
 */
export async function getZhihuMe(
  fetchFn: CookieFetch,
  xsrf?: string,
): Promise<{ userId: string; name: string; avatar: string } | null> {
  const res = await fetchFn(
    `${ZHIHU_ORIGIN}/api/v4/me`,
    { method: 'GET' },
    {
      ...zhihuApiHeaders(xsrf),
      Origin: ZHIHU_ORIGIN,
      Referer: `${ZHIHU_ORIGIN}/`,
    },
  );
  if (res.status === 401 || res.status === 403) {
    return null;
  }
  if (!res.ok) {
    return null;
  }
  let body: {
    id?: string;
    name?: string;
    avatar_url?: string;
    url_token?: string;
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return null;
  }
  if (!body.id && !body.url_token) {
    return null;
  }
  return {
    userId: String(body.id || body.url_token),
    name: body.name || String(body.url_token || body.id),
    avatar: body.avatar_url || '',
  };
}

/**
 * 创建空草稿
 *
 * @param fetchFn fetch
 * @param title 标题
 * @param xsrf xsrf
 * @returns 草稿 id
 */
export async function createZhihuArticleDraft(
  fetchFn: CookieFetch,
  title: string,
  xsrf?: string,
): Promise<string> {
  const res = await fetchFn(
    `${ZHIHU_ZHUANLAN_ORIGIN}/api/articles/drafts`,
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        content: '',
        delta_time: 0,
      }),
    },
    {
      ...zhihuApiHeaders(xsrf),
      'content-type': 'application/json',
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`知乎创建草稿失败 HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  let body: { id?: string | number };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new Error(`知乎创建草稿非 JSON: ${text.slice(0, 120)}`);
  }
  if (body.id == null || String(body.id).trim() === '') {
    throw new Error(`知乎创建草稿无 id: ${text.slice(0, 200)}`);
  }
  return String(body.id);
}

/**
 * 更新草稿标题与 HTML 正文
 *
 * @param fetchFn fetch
 * @param draftId 草稿 id
 * @param input 标题与 HTML
 * @param xsrf xsrf
 */
export async function updateZhihuArticleDraft(
  fetchFn: CookieFetch,
  draftId: string,
  input: { title: string; html: string },
  xsrf?: string,
): Promise<void> {
  const res = await fetchFn(
    `${ZHIHU_ZHUANLAN_ORIGIN}/api/articles/${encodeURIComponent(draftId)}/draft`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        title: input.title,
        content: input.html,
      }),
    },
    {
      ...zhihuApiHeaders(xsrf),
      'content-type': 'application/json',
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`知乎更新草稿失败 HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * 草稿编辑页 URL
 *
 * @param draftId 草稿 id
 * @returns URL
 */
export function zhihuDraftUrl(draftId: string): string {
  return `${ZHIHU_ZHUANLAN_ORIGIN}/p/${encodeURIComponent(draftId)}/edit`;
}
