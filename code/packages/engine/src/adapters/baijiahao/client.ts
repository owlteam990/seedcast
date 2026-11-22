/**
 * 百家号 Web API 客户端（Cookie + 页面 token）
 * 协议形态参考公开社区实现，洁净室重写；非 GPL 源码拷贝。
 *
 * @author Seedcast
 * @date 2026-11-22
 */

/** 站点根 */
export const BAIJIAHAO_ORIGIN = 'https://baijiahao.baidu.com';

/**
 * 会话内 fetch
 */
export type CookieFetch = (
  url: string,
  init?: RequestInit,
  extraHeaders?: Record<string, string>,
) => Promise<Response>;

/**
 * 查询当前登录用户
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @returns 用户信息；未登录返回 null
 * @author Seedcast
 * @date 2026-11-22
 */
export async function getBaijiahaoAppInfo(fetchFn: CookieFetch): Promise<{
  userId: string;
  name: string;
  avatar: string;
} | null> {
  const res = await fetchFn(
    `${BAIJIAHAO_ORIGIN}/builder/app/appinfo?_=${Date.now()}`,
    { method: 'GET' },
    {
      accept: 'application/json, text/plain, */*',
      Origin: BAIJIAHAO_ORIGIN,
      Referer: `${BAIJIAHAO_ORIGIN}/`,
    },
  );
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as {
    errmsg?: string;
    data?: { user?: { userid?: string; name?: string; avatar?: string } };
  };
  if (body.errmsg !== 'success' || !body.data?.user?.userid) {
    return null;
  }
  return {
    userId: String(body.data.user.userid),
    name: body.data.user.name || body.data.user.userid,
    avatar: body.data.user.avatar ?? '',
  };
}

/**
 * 从编辑页 HTML 提取百家号 auth token
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @returns token
 * @author Seedcast
 * @date 2026-11-22
 */
export async function fetchBaijiahaoAuthToken(
  fetchFn: CookieFetch,
): Promise<string> {
  const res = await fetchFn(
    `${BAIJIAHAO_ORIGIN}/builder/rc/edit`,
    { method: 'GET' },
    {
      accept: 'text/html,application/xhtml+xml',
      Origin: BAIJIAHAO_ORIGIN,
      Referer: `${BAIJIAHAO_ORIGIN}/`,
    },
  );
  const html = await res.text();
  const match = html.match(
    /window\.__BJH__INIT__AUTH__\s*=\s*["']([^"']+)["']/,
  );
  if (!match?.[1]) {
    throw new Error('无法获取百家号编辑 token，请重新登录');
  }
  return match[1];
}

/**
 * 解析 JSONP 或 JSON 响应
 *
 * @param text 响应文本
 * @returns 对象
 */
function parseBaijiahaoPayload(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as Record<string, unknown>;
  }
  const jsonp = trimmed.replace(/^[^(]+\(/, '').replace(/\);?\s*$/, '');
  return JSON.parse(jsonp) as Record<string, unknown>;
}

/**
 * 保存文章草稿
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @param input 标题、HTML、token
 * @returns 文章 ID
 * @author Seedcast
 * @date 2026-11-22
 */
export async function saveBaijiahaoArticleDraft(
  fetchFn: CookieFetch,
  input: { title: string; html: string; authToken: string },
): Promise<{ articleId: string }> {
  const body = new URLSearchParams({
    title: input.title,
    content: input.html,
    feed_cat: '1',
    len: String(input.html.length),
    activity_list: JSON.stringify([{ id: 408, is_checked: 0 }]),
    source_reprinted_allow: '0',
    original_status: '0',
    original_handler_status: '1',
    isBeautify: 'false',
    subtitle: '',
    bjhtopic_id: '',
    bjhtopic_info: '',
    type: 'news',
  });

  const res = await fetchFn(
    `${BAIJIAHAO_ORIGIN}/pcui/article/save?callback=bjhdraft`,
    {
      method: 'POST',
      body: body.toString(),
    },
    {
      accept: 'application/json, text/javascript, */*',
      'content-type': 'application/x-www-form-urlencoded',
      token: input.authToken,
      Origin: BAIJIAHAO_ORIGIN,
      Referer: `${BAIJIAHAO_ORIGIN}/builder/rc/edit`,
    },
  );

  const text = await res.text();
  let payload: {
    errno?: number;
    errmsg?: string;
    ret?: { article_id?: string | number };
  };
  try {
    payload = parseBaijiahaoPayload(text) as typeof payload;
  } catch {
    throw new Error(`百家号保存草稿响应无法解析 (HTTP ${res.status})`);
  }

  if (payload.errmsg !== 'success' || payload.ret?.article_id == null) {
    throw new Error(payload.errmsg || `百家号保存草稿失败 (HTTP ${res.status})`);
  }

  return { articleId: String(payload.ret.article_id) };
}

/**
 * 草稿编辑链接
 *
 * @param articleId 文章 ID
 * @returns URL
 */
export function baijiahaoDraftUrl(articleId: string): string {
  return `${BAIJIAHAO_ORIGIN}/builder/rc/edit?type=news&article_id=${encodeURIComponent(articleId)}`;
}
