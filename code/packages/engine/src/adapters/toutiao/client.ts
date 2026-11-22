/**
 * 今日头条号（mp.toutiao.com）Web API 客户端（Cookie）
 * 协议形态参考公开社区实现，洁净室重写；非 GPL 源码拷贝。
 *
 * 会话检测：多路径 media_info + 创作台落地页兜底（避免误报 expired）。
 *
 * @author Seedcast
 * @date 2026-11-22
 */

/** 头条号后台根 */
export const TOUTIAO_MP_ORIGIN = 'https://mp.toutiao.com';

/** 创作台首页 */
export const TOUTIAO_MP_HOME = `${TOUTIAO_MP_ORIGIN}/profile_v4/index`;

/** 图文编辑页（新版） */
export const TOUTIAO_ARTICLE_EDITOR =
  `${TOUTIAO_MP_ORIGIN}/profile_v4/graph/articles/publish`;

/** 图文编辑页（旧版兼容） */
export const TOUTIAO_GRAPHIC_PUBLISH =
  `${TOUTIAO_MP_ORIGIN}/profile_v4/graphic/publish`;

/**
 * 会话内 fetch
 */
export type CookieFetch = (
  url: string,
  init?: RequestInit,
  extraHeaders?: Record<string, string>,
) => Promise<Response>;

/** media_info 候选 */
const MEDIA_INFO_PATHS = [
  '/mp/agw/media/get_media_info',
  '/get_media_info/',
  '/mp/agw/creator_center/get_media_info',
  '/mp/agw/media/get_media_info?source=mp',
] as const;

/**
 * 通用请求头
 *
 * @returns 头
 */
function toutiaoHeaders(): Record<string, string> {
  return {
    accept: 'application/json, text/plain, */*',
    Origin: TOUTIAO_MP_ORIGIN,
    Referer: TOUTIAO_ARTICLE_EDITOR,
    'X-Requested-With': 'XMLHttpRequest',
  };
}

/**
 * 从 media_info JSON 解析用户
 *
 * @param data 响应
 * @returns 用户或 null
 */
function parseMediaUser(data: unknown): {
  userId: string;
  name: string;
  avatar: string;
} | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const root = data as Record<string, unknown>;
  const code = root.code ?? root.err_no ?? root.errno ?? root.status;
  if (
    code !== undefined &&
    code !== 0 &&
    code !== '0' &&
    code !== 200 &&
    code !== '200'
  ) {
    return null;
  }
  const dataNode = (root.data ?? root) as Record<string, unknown>;
  const userCandidates = [
    dataNode.user,
    dataNode.media,
    dataNode.media_info,
    dataNode,
  ];
  for (const cand of userCandidates) {
    if (!cand || typeof cand !== 'object') {
      continue;
    }
    const u = cand as Record<string, unknown>;
    const id = u.id ?? u.user_id ?? u.media_id ?? u.uid;
    const name =
      u.screen_name ??
      u.name ??
      u.media_name ??
      u.user_name ??
      u.display_name;
    if (id == null && (typeof name !== 'string' || !name.trim())) {
      continue;
    }
    return {
      userId: id != null ? String(id) : 'unknown',
      name: typeof name === 'string' && name.trim() ? name.trim() : String(id),
      avatar: String(
        u.https_avatar_url ?? u.avatar_url ?? u.avatar ?? '',
      ),
    };
  }
  return null;
}

/**
 * 根据创作台落地 URL / HTML 判定是否已登录
 *
 * @param landingUrl 打开后的 URL
 * @param landingHtml 页面 HTML
 * @returns 伪用户信息或 null
 * @author Seedcast
 * @date 2026-11-22
 */
export function detectToutiaoLoginFromLanding(
  landingUrl: string,
  landingHtml: string,
): { userId: string; name: string; avatar: string } | null {
  const u = landingUrl.toLowerCase();
  const onLoginHost =
    (u.includes('sso.toutiao.com') ||
      u.includes('passport') ||
      (u.includes('login') && !u.includes('profile_v4'))) &&
    !u.includes('profile_v4');
  if (onLoginHost) {
    return null;
  }

  const onStudio =
    u.includes('mp.toutiao.com') && u.includes('profile_v4');
  const htmlOk =
    /作品管理|创作灵感|粉丝数|累计收益|创作中心/.test(landingHtml) &&
    !/请登录|扫码登录|立即登录/.test(landingHtml.slice(0, 8000));

  if (!onStudio && !htmlOk) {
    return null;
  }

  let name = '头条号已登录';
  const m =
    landingHtml.match(/"screen_name"\s*:\s*"([^"]{1,40})"/) ||
    landingHtml.match(/"media_name"\s*:\s*"([^"]{1,40})"/) ||
    landingHtml.match(/"name"\s*:\s*"([^"]{1,40})"/);
  if (m?.[1] && !/登录|头条号|创作|首页/.test(m[1])) {
    name = m[1];
  }

  return {
    userId: 'landing',
    name,
    avatar: '',
  };
}

/**
 * 读取媒体账号信息（登录态）
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @returns 用户信息；未登录返回 null
 * @author Seedcast
 * @date 2026-11-22
 */
export async function getToutiaoMediaInfo(fetchFn: CookieFetch): Promise<{
  userId: string;
  name: string;
  avatar: string;
} | null> {
  for (const path of MEDIA_INFO_PATHS) {
    try {
      const res = await fetchFn(
        `${TOUTIAO_MP_ORIGIN}${path}`,
        { method: 'GET' },
        {
          ...toutiaoHeaders(),
          Referer: TOUTIAO_MP_HOME,
        },
      );
      const text = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        continue;
      }
      const user = parseMediaUser(body);
      if (user) {
        return user;
      }
    } catch {
      // 试下一路径
    }
  }
  return null;
}

/**
 * 保存图文草稿（save=0）
 *
 * @param fetchFn 带 Cookie 的 fetch
 * @param input 标题与 HTML
 * @returns pgc_id
 * @author Seedcast
 * @date 2026-11-22
 */
export async function saveToutiaoArticleDraft(
  fetchFn: CookieFetch,
  input: { title: string; html: string },
): Promise<{ pgcId: string }> {
  // 1. 热一下新/旧发布页，部分会话依赖 Referer 链路
  for (const editor of [TOUTIAO_ARTICLE_EDITOR, TOUTIAO_GRAPHIC_PUBLISH]) {
    try {
      await fetchFn(
        editor,
        { method: 'GET' },
        {
          accept: 'text/html',
          Referer: TOUTIAO_MP_HOME,
        },
      );
    } catch {
      // 可忽略
    }
  }

  const form = new URLSearchParams({
    title: input.title,
    content: input.html,
    article_ad_type: '2',
    article_type: '0',
    from_diagnosis: '0',
    origin_debut_check_pgc_normal: '0',
    tree_plan_article: '0',
    save: '0',
    pgc_id: '0',
    pgc_feed_covers: '[]',
  });

  const res = await fetchFn(
    `${TOUTIAO_MP_ORIGIN}/mp/agw/article/publish?source=mp&type=article`,
    {
      method: 'POST',
      body: form.toString(),
    },
    {
      ...toutiaoHeaders(),
      'content-type': 'application/x-www-form-urlencoded',
      Referer: TOUTIAO_ARTICLE_EDITOR,
    },
  );

  const text = await res.text();
  let body: {
    code?: number | string;
    message?: string;
    msg?: string;
    data?: { pgc_id?: string | number; id?: string | number };
  };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new Error(
      `头条保存草稿非 JSON (HTTP ${res.status}): ${text.slice(0, 200)}`,
    );
  }

  const pgcId = body.data?.pgc_id ?? body.data?.id;
  if (pgcId == null) {
    throw new Error(
      body.message ||
        body.msg ||
        `头条保存草稿失败 (HTTP ${res.status})`,
    );
  }

  return { pgcId: String(pgcId) };
}

/**
 * 草稿编辑链接
 *
 * @param pgcId 文章 ID
 * @returns URL
 */
export function toutiaoDraftUrl(pgcId: string): string {
  return `${TOUTIAO_ARTICLE_EDITOR}?pgc_id=${encodeURIComponent(pgcId)}`;
}
