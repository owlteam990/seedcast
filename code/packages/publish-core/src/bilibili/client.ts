/**
 * B站专栏 Web API 客户端（Cookie + CSRF）
 * 协议形态参考公开社区实现，洁净室重写；非 GPL 源码拷贝。
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { Cookie } from 'playwright';

/** 创作中心 */
export const BILIBILI_MEMBER_ORIGIN = 'https://member.bilibili.com';

/** API 根 */
export const BILIBILI_API_ORIGIN = 'https://api.bilibili.com';

/** 默认分区（动画杂谈等常见默认；可在设置覆盖） */
export const BILIBILI_DEFAULT_TID = 4;

/**
 * 会话内 fetch
 */
export type CookieFetch = (
  url: string,
  init?: RequestInit,
  extraHeaders?: Record<string, string>,
) => Promise<Response>;

/**
 * 从 Cookie 列表提取 bili_jct
 *
 * @param cookies Cookie 列表
 * @returns csrf；缺失返回空串
 */
export function extractBilibiliCsrf(cookies: Cookie[]): string {
  const hit = cookies.find((c) => {
    return c.name === 'bili_jct';
  });
  return hit?.value?.trim() || '';
}

/**
 * 导航信息（登录态）
 */
export interface BilibiliNavInfo {
  mid: number;
  uname: string;
  face: string;
}

/**
 * 查询当前登录用户
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @returns 用户信息；未登录返回 null
 * @author Seedcast
 * @date 2026-11-22
 */
export async function getBilibiliNav(
  fetchFn: CookieFetch,
): Promise<BilibiliNavInfo | null> {
  const res = await fetchFn(
    `${BILIBILI_API_ORIGIN}/x/web-interface/nav?build=0&mobi_app=web`,
    { method: 'GET' },
    {
      accept: 'application/json, text/plain, */*',
      Origin: BILIBILI_MEMBER_ORIGIN,
      Referer: `${BILIBILI_MEMBER_ORIGIN}/`,
    },
  );
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as {
    code?: number;
    data?: {
      isLogin?: boolean;
      mid?: number;
      uname?: string;
      face?: string;
    };
  };
  if (body.code !== 0 || !body.data?.isLogin || body.data.mid == null) {
    return null;
  }
  return {
    mid: body.data.mid,
    uname: body.data.uname || String(body.data.mid),
    face: body.data.face || '',
  };
}

/**
 * 保存专栏草稿
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @param input 草稿内容
 * @returns 文章 aid
 * @author Seedcast
 * @date 2026-11-22
 */
export async function saveBilibiliArticleDraft(
  fetchFn: CookieFetch,
  input: {
    title: string;
    contentHtml: string;
    csrf: string;
    tid?: number;
  },
): Promise<{ aid: string }> {
  if (!input.csrf.trim()) {
    throw new Error('缺少 bili_jct（CSRF），请重新登录 B站');
  }
  const tid = input.tid ?? BILIBILI_DEFAULT_TID;
  const res = await fetchFn(
    `${BILIBILI_API_ORIGIN}/x/article/creative/draft/addupdate`,
    {
      method: 'POST',
      body: new URLSearchParams({
        tid: String(tid),
        title: input.title,
        content: input.contentHtml,
        csrf: input.csrf,
        save: '0',
        pgc_id: '0',
      }),
    },
    {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/x-www-form-urlencoded',
      Origin: BILIBILI_MEMBER_ORIGIN,
      Referer: `${BILIBILI_MEMBER_ORIGIN}/`,
    },
  );
  const body = (await res.json()) as {
    code?: number;
    message?: string;
    data?: { aid?: number | string };
  };
  if (body.code !== 0 || body.data?.aid == null) {
    const detail = body.message || JSON.stringify(body).slice(0, 200);
    throw new Error(`保存 B站专栏草稿失败 (code=${body.code}): ${detail}`);
  }
  return { aid: String(body.data.aid) };
}

/**
 * 专栏草稿编辑链接
 *
 * @param aid 文章 aid
 * @returns URL
 */
export function bilibiliDraftUrl(aid: string): string {
  return `${BILIBILI_MEMBER_ORIGIN}/platform/upload/text/edit?aid=${encodeURIComponent(aid)}`;
}
