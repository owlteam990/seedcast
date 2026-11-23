/**
 * 抖音创作者中心会话探测（Cookie Web API）
 * 发布走页面自动化，见 publish.ts。
 *
 * @author Seedcast
 * @date 2026-11-22
 */

/** 创作者中心 */
export const DOUYIN_CREATOR_ORIGIN = 'https://creator.douyin.com';

/** 发布文章编辑器 */
export const DOUYIN_ARTICLE_EDITOR =
  `${DOUYIN_CREATOR_ORIGIN}/creator-micro/content/post/article?default-tab=5&enter_from=publish_page&media_type=article&type=new`;

/** 图文 / 作品上传页 */
export const DOUYIN_UPLOAD_PAGE =
  `${DOUYIN_CREATOR_ORIGIN}/creator-micro/content/upload?enter_from=dou_web`;

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
export interface DouyinUserInfo {
  uid: string;
  nickname: string;
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
export async function getDouyinUserInfo(
  fetchFn: CookieFetch,
): Promise<DouyinUserInfo | null> {
  const res = await fetchFn(
    `${DOUYIN_CREATOR_ORIGIN}/web/api/media/user/info/?aid=1128`,
    { method: 'GET' },
    {
      accept: 'application/json, text/plain, */*',
      Origin: DOUYIN_CREATOR_ORIGIN,
      Referer: `${DOUYIN_CREATOR_ORIGIN}/`,
    },
  );
  if (!res.ok) {
    return null;
  }
  let body: {
    status_code?: number;
    user_info?: {
      uid?: string | number;
      nickname?: string;
      avatar_url?: string;
      avatarThumb?: { url_list?: string[] };
    };
    user?: {
      uid?: string | number;
      nickname?: string;
      avatar_url?: string;
    };
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return null;
  }
  const user = body.user_info ?? body.user;
  if (!user?.uid) {
    return null;
  }
  const avatar =
    user.avatar_url ||
    body.user_info?.avatarThumb?.url_list?.[0] ||
    '';
  return {
    uid: String(user.uid),
    nickname: user.nickname || String(user.uid),
    avatar,
  };
}
