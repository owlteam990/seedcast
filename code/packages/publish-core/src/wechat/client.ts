/**
 * 微信公众号草稿 API 客户端（对齐 docs/微信公众号发布）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { WechatCredentials } from './credentials.js';
import { tokenCachePath } from './credentials.js';

const BASE_URL = 'https://api.weixin.qq.com/cgi-bin';

/** 常见错误码中文 */
const ERROR_HINTS: Record<number, string> = {
  40001: 'AppSecret 错误或 token 与 appid 不匹配（多号切换请清缓存）',
  40013: '不合法的 AppID',
  40125: '无效的 AppSecret',
  40164: '调用 IP 不在白名单（公众平台 → 基本配置 → IP白名单）',
  42001: 'access_token 超时',
  45009: '接口调用超过每日限制',
  47003: '参数错误（检查必填字段与字节长度）',
  48001: 'api 功能未授权（确认公众号类型与权限）',
  40007: 'media_id 无效',
};

/**
 * 微信 API 业务错误
 */
export class WechatApiError extends Error {
  /**
   * @param errcode 错误码
   * @param errmsg 原文
   * @param context 上下文
   */
  constructor(
    readonly errcode: number,
    readonly errmsg: string,
    context: string,
  ) {
    const hint = ERROR_HINTS[errcode] ?? errmsg;
    super(`${context}失败 (errcode=${errcode}): ${hint}`);
    this.name = 'WechatApiError';
  }
}

interface TokenCache {
  access_token: string;
  expires_at: number;
  appid: string;
}

/**
 * 解析微信 JSON；有 errcode 非 0 则抛错
 *
 * @param data 响应
 * @param context 上下文
 */
function assertOk(
  data: Record<string, unknown>,
  context: string,
): void {
  const errcode = data.errcode;
  if (typeof errcode === 'number' && errcode !== 0) {
    throw new WechatApiError(
      errcode,
      typeof data.errmsg === 'string' ? data.errmsg : 'unknown',
      context,
    );
  }
}

/**
 * 获取 access_token（带按 appid 的本地缓存，提前 300s 刷新）
 *
 * @param profileDir 账号目录
 * @param credentials 凭证
 * @param forceRefresh 强制刷新
 * @returns token
 * @author Seedcast
 * @date 2026-11-21
 */
export async function getAccessToken(
  profileDir: string,
  credentials: WechatCredentials,
  forceRefresh = false,
): Promise<string> {
  const cacheFile = tokenCachePath(profileDir, credentials.appid);
  if (!forceRefresh && existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(readFileSync(cacheFile, 'utf8')) as TokenCache;
      if (
        cache.appid === credentials.appid &&
        typeof cache.access_token === 'string' &&
        typeof cache.expires_at === 'number' &&
        Date.now() / 1000 < cache.expires_at - 300
      ) {
        return cache.access_token;
      }
    } catch {
      // 忽略坏缓存
    }
  }

  const url = new URL(`${BASE_URL}/token`);
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', credentials.appid);
  url.searchParams.set('secret', credentials.appsecret);

  const res = await fetch(url);
  const data = (await res.json()) as Record<string, unknown>;
  assertOk(data, '获取 access_token');

  const accessToken = String(data.access_token ?? '');
  const expiresIn =
    typeof data.expires_in === 'number' ? data.expires_in : 7200;
  if (!accessToken) {
    throw new Error('获取 access_token 成功但响应无 token');
  }

  mkdirSync(dirname(cacheFile), { recursive: true });
  const cache: TokenCache = {
    access_token: accessToken,
    expires_at: Date.now() / 1000 + expiresIn,
    appid: credentials.appid,
  };
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf8');
  return accessToken;
}

/**
 * 上传永久图片素材
 *
 * @param profileDir 账号目录
 * @param credentials 凭证
 * @param imagePath 本地路径
 * @returns media_id 与 url
 * @author Seedcast
 * @date 2026-11-21
 */
export async function uploadImage(
  profileDir: string,
  credentials: WechatCredentials,
  imagePath: string,
): Promise<{ mediaId: string; url: string }> {
  if (!existsSync(imagePath)) {
    throw new Error(`图片不存在: ${imagePath}`);
  }

  const run = async (token: string): Promise<{ mediaId: string; url: string }> => {
    const url = `${BASE_URL}/material/add_material?access_token=${encodeURIComponent(token)}&type=image`;
    const buf = readFileSync(imagePath);
    const form = new FormData();
    const name = basename(imagePath);
    const type = name.toLowerCase().endsWith('.png')
      ? 'image/png'
      : 'image/jpeg';
    form.append(
      'media',
      new Blob([new Uint8Array(buf)], { type }),
      name,
    );

    const res = await fetch(url, { method: 'POST', body: form });
    const data = (await res.json()) as Record<string, unknown>;
    assertOk(data, '上传图片');
    const mediaId = String(data.media_id ?? '');
    if (!mediaId) {
      throw new Error('上传图片成功但无 media_id');
    }
    return { mediaId, url: String(data.url ?? '') };
  };

  let token = await getAccessToken(profileDir, credentials);
  try {
    return await run(token);
  } catch (err) {
    if (err instanceof WechatApiError && (err.errcode === 42001 || err.errcode === 40001)) {
      token = await getAccessToken(profileDir, credentials, true);
      return run(token);
    }
    throw err;
  }
}

/**
 * 创建草稿
 *
 * @param profileDir 账号目录
 * @param credentials 凭证
 * @param article 文章字段
 * @returns 草稿 media_id
 * @author Seedcast
 * @date 2026-11-21
 */
export async function createDraft(
  profileDir: string,
  credentials: WechatCredentials,
  article: {
    title: string;
    author: string;
    digest: string;
    content: string;
    thumbMediaId: string;
    showCoverPic?: number;
    contentSourceUrl?: string;
  },
): Promise<string> {
  const payload = {
    articles: [
      {
        title: article.title,
        author: article.author,
        digest: article.digest,
        content: article.content,
        content_source_url: article.contentSourceUrl ?? '',
        thumb_media_id: article.thumbMediaId,
        show_cover_pic: article.showCoverPic ?? 1,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      },
    ],
  };

  const run = async (token: string): Promise<string> => {
    const url = `${BASE_URL}/draft/add?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as Record<string, unknown>;
    assertOk(data, '创建草稿');
    const mediaId = String(data.media_id ?? '');
    if (!mediaId) {
      throw new Error('创建草稿成功但无 media_id');
    }
    return mediaId;
  };

  let token = await getAccessToken(profileDir, credentials);
  try {
    return await run(token);
  } catch (err) {
    if (err instanceof WechatApiError && (err.errcode === 42001 || err.errcode === 40001)) {
      token = await getAccessToken(profileDir, credentials, true);
      return run(token);
    }
    throw err;
  }
}

/**
 * 回查草稿
 *
 * @param profileDir 账号目录
 * @param credentials 凭证
 * @param mediaId 草稿 id
 * @returns 首篇 news_item
 * @author Seedcast
 * @date 2026-11-21
 */
export async function getDraft(
  profileDir: string,
  credentials: WechatCredentials,
  mediaId: string,
): Promise<Record<string, unknown>> {
  const token = await getAccessToken(profileDir, credentials);
  const url = `${BASE_URL}/draft/get?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ media_id: mediaId }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  assertOk(data, '回查草稿');
  const items = data.news_item;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('回查草稿无 news_item');
  }
  return items[0] as Record<string, unknown>;
}
