/**
 * 小红书创作者中心会话探测（Cookie Web API）
 * 发布走页面自动化，见 publish.ts。
 *
 * @author Seedcast
 * @date 2026-11-22
 */

/** 创作者中心 */
export const XHS_CREATOR_ORIGIN = 'https://creator.xiaohongshu.com';

/** 图文发布页 */
export const XHS_PUBLISH_IMAGE_URL =
  `${XHS_CREATOR_ORIGIN}/publish/publish?from=menu_left&target=image`;

/** 写长文入口页（需再点「新的创作」） */
export const XHS_PUBLISH_ARTICLE_URL =
  `${XHS_CREATOR_ORIGIN}/publish/publish?from=menu&target=article`;

/** 创作者首页 */
export const XHS_CREATOR_HOME = `${XHS_CREATOR_ORIGIN}/new/home`;

/**
 * 会话内 fetch
 */
export type CookieFetch = (
  url: string,
  init?: RequestInit,
  extraHeaders?: Record<string, string>,
) => Promise<Response>;

/**
 * 创作者用户信息
 */
export interface XhsUserInfo {
  userId: string;
  name: string;
  avatar: string;
}

/**
 * 查询创作者登录态
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @returns 用户信息；未登录返回 null
 * @author Seedcast
 * @date 2026-11-22
 */
export async function getXhsPersonalInfo(
  fetchFn: CookieFetch,
): Promise<XhsUserInfo | null> {
  const res = await fetchFn(
    `${XHS_CREATOR_ORIGIN}/api/galaxy/creator/home/personal_info`,
    { method: 'GET' },
    {
      accept: 'application/json, text/plain, */*',
      Origin: XHS_CREATOR_ORIGIN,
      Referer: XHS_CREATOR_HOME,
    },
  );
  if (res.status === 401 || res.status === 403) {
    return null;
  }
  if (!res.ok) {
    return null;
  }
  let body: {
    success?: boolean;
    code?: number;
    data?: {
      name?: string;
      user_id?: string | number;
      red_id?: string;
      avatar?: string;
      fans_count?: number;
    };
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return null;
  }
  if (!body.data?.name && body.data?.user_id == null) {
    return null;
  }
  const id =
    body.data.user_id != null
      ? String(body.data.user_id)
      : body.data.red_id || body.data.name || '';
  if (!id) {
    return null;
  }
  return {
    userId: id,
    name: body.data.name || id,
    avatar: body.data.avatar || '',
  };
}
