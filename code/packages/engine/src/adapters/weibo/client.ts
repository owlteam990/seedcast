/**
 * 微博头条文章 Web API 客户端（Cookie）
 * 协议形态参考公开社区实现，洁净室重写；非 GPL 源码拷贝。
 *
 * @author Seedcast
 * @date 2026-11-22
 */

/** 头条文章编辑器根 */
export const WEIBO_ARTICLE_ORIGIN = 'https://card.weibo.com';

/** 编辑器页 */
export const WEIBO_ARTICLE_EDITOR = `${WEIBO_ARTICLE_ORIGIN}/article/v5/editor`;

/**
 * 会话内 fetch
 */
export type CookieFetch = (
  url: string,
  init?: RequestInit,
  extraHeaders?: Record<string, string>,
) => Promise<Response>;

/**
 * 微博用户配置（编辑器页注入）
 */
export interface WeiboUserConfig {
  uid: string;
  nick: string;
  avatar: string;
}

/**
 * 生成请求追踪 ID（编辑器接口常用）
 *
 * @param uid 用户 uid
 * @returns rid
 */
function generateWeiboReqId(uid: string): string {
  const input = `${uid}&${Date.now()}`;
  const base64 = Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = base64;
  while (result.length < 43) {
    result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return result.slice(0, 43);
}

/**
 * 从编辑器 HTML 解析用户 config
 *
 * @param html 页面 HTML
 * @returns 用户信息；失败返回 null
 */
export function parseWeiboEditorConfig(
  html: string,
): WeiboUserConfig | null {
  const match = html.match(/config:\s*JSON\.parse\('((?:\\'|[^'])*)'\)/);
  if (!match?.[1]) {
    return null;
  }
  try {
    const raw = match[1]
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
    const config = JSON.parse(raw) as {
      uid?: string | number;
      nick?: string;
      avatar_large?: string;
    };
    if (config.uid == null || String(config.uid).trim() === '') {
      return null;
    }
    return {
      uid: String(config.uid),
      nick: config.nick || String(config.uid),
      avatar: config.avatar_large || '',
    };
  } catch {
    return null;
  }
}

/**
 * 读取微博头条文章编辑器用户信息（登录态探测）
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @param landingHtml 可选：已打开编辑器页的 HTML
 * @returns 用户信息；未登录返回 null
 * @author Seedcast
 * @date 2026-11-22
 */
export async function getWeiboUserConfig(
  fetchFn: CookieFetch,
  landingHtml?: string,
): Promise<WeiboUserConfig | null> {
  if (landingHtml) {
    const fromLanding = parseWeiboEditorConfig(landingHtml);
    if (fromLanding) {
      return fromLanding;
    }
  }
  const res = await fetchFn(
    WEIBO_ARTICLE_EDITOR,
    { method: 'GET' },
    {
      accept: 'text/html,application/xhtml+xml',
      Referer: 'https://weibo.com/',
    },
  );
  if (!res.ok) {
    return null;
  }
  const html = await res.text();
  return parseWeiboEditorConfig(html);
}

/**
 * 创建空草稿
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @param uid 用户 uid
 * @returns 草稿 ID
 * @author Seedcast
 * @date 2026-11-22
 */
export async function createWeiboArticleDraft(
  fetchFn: CookieFetch,
  uid: string,
): Promise<{ draftId: string }> {
  const rid = generateWeiboReqId(uid);
  const res = await fetchFn(
    `${WEIBO_ARTICLE_ORIGIN}/article/v5/aj/editor/draft/create?uid=${encodeURIComponent(uid)}&_rid=${encodeURIComponent(rid)}`,
    {
      method: 'POST',
      body: new URLSearchParams({}),
    },
    {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/x-www-form-urlencoded',
      'SN-REQID': rid,
      Origin: WEIBO_ARTICLE_ORIGIN,
      Referer: WEIBO_ARTICLE_EDITOR,
    },
  );
  const body = (await res.json()) as {
    code?: number | string;
    msg?: string;
    data?: { id?: string | number };
  };
  if (String(body.code) !== '100000' || body.data?.id == null) {
    throw new Error(body.msg || `创建微博草稿失败 (HTTP ${res.status})`);
  }
  return { draftId: String(body.data.id) };
}

/**
 * 保存头条文章草稿正文
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @param input 草稿内容
 * @author Seedcast
 * @date 2026-11-22
 */
export async function saveWeiboArticleDraft(
  fetchFn: CookieFetch,
  input: {
    uid: string;
    draftId: string;
    title: string;
    contentHtml: string;
    cover?: string;
    summary?: string;
  },
): Promise<void> {
  const rid = generateWeiboReqId(input.uid);
  const res = await fetchFn(
    `${WEIBO_ARTICLE_ORIGIN}/article/v5/aj/editor/draft/save?uid=${encodeURIComponent(input.uid)}&id=${encodeURIComponent(input.draftId)}&_rid=${encodeURIComponent(rid)}`,
    {
      method: 'POST',
      body: new URLSearchParams({
        id: input.draftId,
        title: input.title,
        subtitle: '',
        type: '',
        status: '0',
        publish_at: '',
        error_msg: '',
        error_code: '0',
        collection: '[]',
        free_content: '',
        content: input.contentHtml,
        cover: input.cover ?? '',
        summary: input.summary ?? '',
        writer: '',
        extra: 'null',
        is_word: '0',
        article_recommend: '[]',
        follow_to_read: '1',
        isreward: '1',
        pay_setting: '{"ispay":0,"isvclub":0}',
        source: '0',
        action: '1',
        content_type: '0',
        save: '1',
      }),
    },
    {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/x-www-form-urlencoded',
      'SN-REQID': rid,
      Origin: WEIBO_ARTICLE_ORIGIN,
      Referer: WEIBO_ARTICLE_EDITOR,
    },
  );
  const body = (await res.json()) as {
    code?: number | string;
    msg?: string;
  };
  if (String(body.code) !== '100000') {
    throw new Error(body.msg || `保存微博草稿失败 (code=${body.code})`);
  }
}

/**
 * 组装草稿编辑链接
 *
 * @param draftId 草稿 ID
 * @returns URL
 */
export function weiboDraftUrl(draftId: string): string {
  return `${WEIBO_ARTICLE_EDITOR}#/draft/${draftId}`;
}
