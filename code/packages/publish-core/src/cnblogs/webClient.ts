/**
 * 博客园 Web API（Cookie + XSRF，参考社区适配器协议，自研实现）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import type { Cookie } from 'playwright';

export const CNBLOGS_ACCOUNT_ORIGIN = 'https://account.cnblogs.com';
export const CNBLOGS_I_ORIGIN = 'https://i.cnblogs.com';

export interface CnblogsUserInfo {
  spaceUserId?: number;
  displayName?: string;
  blogApp?: string | null;
  homeLink?: string;
  blogLink?: string;
}

export type CookieFetch = (
  url: string,
  init?: RequestInit,
  extraHeaders?: Record<string, string>,
) => Promise<Response>;

/**
 * 从 Cookie 列表取 XSRF-TOKEN（需 URL decode）
 *
 * @param cookies Playwright cookies
 * @returns token 或 null
 */
export function extractCnblogsXsrfToken(cookies: Cookie[]): string | null {
  const hit = cookies.find((c) => c.name === 'XSRF-TOKEN');
  if (!hit?.value) {
    return null;
  }
  try {
    return decodeURIComponent(hit.value);
  } catch {
    return hit.value;
  }
}

/**
 * 账号中心 userinfo（登录探测）
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @returns 用户信息或 null
 */
export async function getCnblogsUserInfo(
  fetchFn: CookieFetch,
): Promise<CnblogsUserInfo | null> {
  const res = await fetchFn(`${CNBLOGS_ACCOUNT_ORIGIN}/user/userinfo`, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Origin: 'https://www.cnblogs.com',
      Referer: 'https://www.cnblogs.com/',
    },
  });
  if (!res.ok) {
    return null;
  }
  const text = await res.text();
  try {
    const data = JSON.parse(text) as CnblogsUserInfo;
    if (!data || (!data.displayName && !data.spaceUserId)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Cookie 写草稿：POST https://i.cnblogs.com/api/posts
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @param input 标题正文与 xsrf
 * @returns postId
 */
export async function createCnblogsWebDraft(
  fetchFn: CookieFetch,
  input: {
    title: string;
    markdown: string;
    xsrfToken: string;
    /** 1=随笔 2=文章 */
    postType?: 1 | 2;
  },
): Promise<{ id: number }> {
  const postType = input.postType ?? 1;
  const res = await fetchFn(
    `${CNBLOGS_I_ORIGIN}/api/posts`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: CNBLOGS_I_ORIGIN,
        Referer: `${CNBLOGS_I_ORIGIN}/posts/edit`,
        'x-xsrf-token': input.xsrfToken,
      },
      body: JSON.stringify({
        id: null,
        postType,
        accessPermission: 0,
        title: input.title,
        url: null,
        postBody: input.markdown,
        categoryIds: null,
        categories: null,
        collectionIds: [],
        inSiteCandidate: false,
        inSiteHome: false,
        siteCategoryId: null,
        blogTeamIds: null,
        isPublished: false,
        displayOnHomePage: false,
        isAllowComments: true,
        includeInMainSyndication: false,
        isPinned: false,
        showBodyWhenPinned: false,
        isOnlyForRegisterUser: false,
        isUpdateDateAdded: false,
        entryName: null,
        description: null,
        featuredImage: null,
        tags: null,
        password: null,
        publishAt: null,
        datePublished: new Date().toISOString(),
        dateUpdated: null,
        isMarkdown: true,
        isDraft: true,
        autoDesc: null,
        changePostType: false,
        blogId: 0,
        author: null,
        removeScript: false,
        clientInfo: null,
        changeCreatedTime: false,
        canChangeCreatedTime: false,
        isContributeToImpressiveBugActivity: false,
        usingEditorId: 5,
        sourceUrl: null,
      }),
    },
  );
  const text = await res.text();
  let data: { id?: number; error?: string; errors?: string[] } = {};
  try {
    data = JSON.parse(text) as {
      id?: number;
      error?: string;
      errors?: string[];
    };
  } catch {
    data = {};
  }
  const apiMsg = [data.error, ...(data.errors || [])]
    .filter(Boolean)
    .join('；');

  if (!res.ok) {
    if (/没有开通博客/.test(text) || /没有开通博客/.test(apiMsg)) {
      throw new Error(
        '账号尚未开通博客。请先打开 https://account.cnblogs.com/blog-apply 申请博客后再发草稿。',
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `未登录或无权限写草稿：HTTP ${res.status} ${apiMsg || text.slice(0, 160)}`,
      );
    }
    throw new Error(
      `创建草稿失败：HTTP ${res.status} ${apiMsg || text.slice(0, 200)}`,
    );
  }
  if (!data.id) {
    throw new Error(apiMsg || '创建草稿失败：响应无 id');
  }
  return { id: data.id };
}
