/**
 * CSDN 博客控制台 Web API 客户端（Cookie + x-ca 签名）
 * 协议形态参考公开社区实现，洁净室重写；非 GPL 源码拷贝。
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { createHmac, randomUUID } from 'node:crypto';

/** CSDN 编辑器前端网关公钥（浏览器端可见，非用户密钥） */
const CSDN_API_KEY = '203803574';

/** CSDN 编辑器前端网关签名密钥（浏览器端可见） */
const CSDN_API_SECRET = '9znpamsyl2c7cdrr9sas0le9vbc3r6ba';

/** API 根 */
export const CSDN_BIZ_API = 'https://bizapi.csdn.net';

/** Cookie / Origin 基准 */
export const CSDN_EDITOR_ORIGIN = 'https://editor.csdn.net';

/** 登录态检测用首页 */
export const CSDN_HOME = 'https://www.csdn.net';

/**
 * 会话内 fetch 函数类型（由 cookieHttp.withProfileCookieSession 注入）
 */
export type CookieFetch = (
  url: string,
  init?: RequestInit,
  extraHeaders?: Record<string, string>,
) => Promise<Response>;

/**
 * 生成 CSDN x-ca 签名请求头
 *
 * @param apiPath 以 / 开头的 API 路径
 * @param method GET 或 POST
 * @returns 签名头
 * @author Seedcast
 * @date 2026-11-22
 */
export function signCsdnRequest(
  apiPath: string,
  method: 'GET' | 'POST' = 'POST',
): Record<string, string> {
  const nonce = randomUUID();
  // 签名串格式与编辑器前端一致：METHOD / Accept / MD5 / Content-Type / 空行 / Headers / Path
  const signStr =
    method === 'GET'
      ? `GET\n*/*\n\n\n\nx-ca-key:${CSDN_API_KEY}\nx-ca-nonce:${nonce}\n${apiPath}`
      : `POST\n*/*\n\napplication/json\n\nx-ca-key:${CSDN_API_KEY}\nx-ca-nonce:${nonce}\n${apiPath}`;

  const signature = createHmac('sha256', CSDN_API_SECRET)
    .update(signStr, 'utf8')
    .digest('base64');

  const headers: Record<string, string> = {
    accept: '*/*',
    'x-ca-key': CSDN_API_KEY,
    'x-ca-nonce': nonce,
    'x-ca-signature': signature,
    'x-ca-signature-headers': 'x-ca-key,x-ca-nonce',
    Origin: CSDN_EDITOR_ORIGIN,
    Referer: `${CSDN_EDITOR_ORIGIN}/`,
  };
  if (method === 'POST') {
    headers['content-type'] = 'application/json';
  }
  return headers;
}

/**
 * 查询当前登录用户基础信息
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @returns 用户信息；未登录返回 null
 * @author Seedcast
 * @date 2026-11-22
 */
export async function getCsdnBaseInfo(fetchFn: CookieFetch): Promise<{
  name: string;
  nickname: string;
  avatar: string;
  blogUrl: string;
} | null> {
  const apiPath = '/blog-console-api/v3/editor/getBaseInfo';
  const headers = signCsdnRequest(apiPath, 'GET');
  const res = await fetchFn(`${CSDN_BIZ_API}${apiPath}`, { method: 'GET' }, headers);
  const body = (await res.json()) as {
    code?: number;
    data?: {
      name?: string;
      nickname?: string;
      avatar?: string;
      blog_url?: string;
    };
  };
  if (body.code !== 200 || !body.data?.name) {
    return null;
  }
  return {
    name: body.data.name,
    nickname: body.data.nickname || body.data.name,
    avatar: body.data.avatar ?? '',
    blogUrl: body.data.blog_url ?? '',
  };
}

/**
 * 保存 Markdown 文章草稿
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @param input 标题与正文
 * @returns 文章 ID
 * @author Seedcast
 * @date 2026-11-22
 */
export async function saveCsdnArticleDraft(
  fetchFn: CookieFetch,
  input: {
    title: string;
    markdown: string;
    html: string;
    tags?: string;
    categories?: string;
  },
): Promise<{ articleId: string }> {
  const apiPath = '/blog-console-api/v3/mdeditor/saveArticle';
  const headers = signCsdnRequest(apiPath, 'POST');
  const res = await fetchFn(
    `${CSDN_BIZ_API}${apiPath}`,
    {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        markdowncontent: input.markdown,
        content: input.html,
        readType: 'public',
        level: 0,
        tags: input.tags ?? '',
        status: 2,
        categories: input.categories ?? '',
        type: 'original',
        original_link: '',
        authorized_status: false,
        not_auto_saved: '1',
        source: 'pc_mdeditor',
        cover_images: [],
        cover_type: 1,
        is_new: 1,
        vote_id: 0,
        resource_id: '',
        pubStatus: 'draft',
        creator_activity_id: '',
      }),
    },
    headers,
  );

  const body = (await res.json()) as {
    code?: number;
    message?: string;
    msg?: string;
    data?: { id?: string | number };
  };

  if (body.code !== 200 || body.data?.id === undefined || body.data?.id === null) {
    throw new Error(body.msg || body.message || `CSDN 保存草稿失败 (HTTP ${res.status})`);
  }

  return { articleId: String(body.data.id) };
}

/**
 * 组装 CSDN 草稿编辑链接
 *
 * @param articleId 文章 ID
 * @returns 编辑器 URL
 */
export function csdnDraftUrl(articleId: string): string {
  return `${CSDN_EDITOR_ORIGIN}/md?articleId=${encodeURIComponent(articleId)}`;
}
