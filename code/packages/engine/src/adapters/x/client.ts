/**
 * X API v2 客户端（OAuth 1.0a 用户上下文）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { createHmac, randomBytes } from 'node:crypto';
import type { XCredentials } from './credentials.js';

/** API 根 */
export const X_API_ORIGIN = 'https://api.x.com';

/**
 * percent-encode（RFC 3986）
 *
 * @param value 原文
 * @returns 编码后
 */
function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => {
      return `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
    },
  );
}

/**
 * 构建 OAuth 1.0a Authorization 头
 *
 * @param input 方法、URL、凭证与额外参数
 * @returns Authorization 头值
 */
export function buildOAuth1Header(input: {
  method: string;
  url: string;
  credentials: XCredentials;
  extraParams?: Record<string, string>;
}): string {
  const { method, url, credentials } = input;
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: credentials.accessToken,
    oauth_version: '1.0',
  };

  const allParams: Record<string, string> = {
    ...oauthParams,
    ...(input.extraParams ?? {}),
  };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => {
      return `${percentEncode(k)}=${percentEncode(allParams[k] ?? '')}`;
    })
    .join('&');

  const baseUrl = url.split('?')[0] ?? url;
  const baseString = [
    method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(paramString),
  ].join('&');

  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(credentials.accessTokenSecret)}`;
  const signature = createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');
  oauthParams.oauth_signature = signature;

  const header =
    'OAuth ' +
    Object.keys(oauthParams)
      .sort()
      .map((k) => {
        return `${percentEncode(k)}="${percentEncode(oauthParams[k] ?? '')}"`;
      })
      .join(', ');
  return header;
}

/**
 * 当前用户信息
 */
export interface XUserMe {
  id: string;
  username: string;
  name: string;
}

/**
 * 校验凭证：GET /2/users/me
 *
 * @param credentials 凭证
 * @returns 用户信息
 */
export async function getXUserMe(
  credentials: XCredentials,
): Promise<XUserMe> {
  const url = `${X_API_ORIGIN}/2/users/me`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: buildOAuth1Header({
        method: 'GET',
        url,
        credentials,
      }),
      accept: 'application/json',
    },
  });
  const body = (await res.json()) as {
    data?: { id?: string; username?: string; name?: string };
    title?: string;
    detail?: string;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || !body.data?.id) {
    const msg =
      body.detail ||
      body.title ||
      body.errors?.[0]?.message ||
      `HTTP ${res.status}`;
    throw new Error(`X 凭证无效：${msg}`);
  }
  return {
    id: body.data.id,
    username: body.data.username || body.data.id,
    name: body.data.name || body.data.username || body.data.id,
  };
}

/**
 * 发帖
 *
 * @param credentials 凭证
 * @param text 正文
 * @returns 帖子 ID
 */
export async function createXPost(
  credentials: XCredentials,
  text: string,
): Promise<{ id: string }> {
  const url = `${X_API_ORIGIN}/2/tweets`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: buildOAuth1Header({
        method: 'POST',
        url,
        credentials,
      }),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  const body = (await res.json()) as {
    data?: { id?: string };
    title?: string;
    detail?: string;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || !body.data?.id) {
    const msg =
      body.detail ||
      body.title ||
      body.errors?.[0]?.message ||
      `HTTP ${res.status}`;
    throw new Error(`X 发帖失败：${msg}`);
  }
  return { id: body.data.id };
}

/**
 * 帖子链接
 *
 * @param username 用户名
 * @param postId 帖子 ID
 * @returns URL
 */
export function xPostUrl(username: string, postId: string): string {
  return `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(postId)}`;
}

/**
 * 将标题与 Markdown 压成发帖文案
 *
 * @param title 标题
 * @param markdown 正文
 * @param maxLen 最大长度
 * @returns 文案
 */
export function buildXPostText(
  title: string,
  markdown: string,
  maxLen = 280,
): string {
  const plain = markdown
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~>#-]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  let text = title.trim();
  if (plain) {
    text = `${text}\n\n${plain}`;
  }
  if ([...text].length <= maxLen) {
    return text;
  }
  const chars = [...text];
  return `${chars.slice(0, Math.max(0, maxLen - 1)).join('')}…`;
}
