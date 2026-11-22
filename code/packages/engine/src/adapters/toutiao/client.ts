/**
 * 今日头条号（mp.toutiao.com）Web API 客户端（Cookie + 页内 fetch）
 * 协议形态参考公开社区实现，洁净室重写；非 GPL 源码拷贝。
 *
 * 实测（2026-11-22）：
 * - save=0 常返回 code=7050 / pgc_id=0（保存失败）
 * - save=1 可返回真实 pgc_id；须校验 code 且拒绝 pgc_id=0，避免假成功
 * - 页内 fetch 会附带 msToken/a_bogus，比纯 context.request 更稳
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { Page } from 'playwright';

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

/** 图片上传 */
export const TOUTIAO_UPLOAD_PICTURE =
  `${TOUTIAO_MP_ORIGIN}/mp/agw/article_material/photo/upload_picture?type=ueditor&pgc_watermark=0&action=uploadimage&encode=utf-8`;

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
 * 判断 pgc_id 是否有效（拒绝 0 / 空）
 *
 * @param raw 原始值
 * @returns 规范化 ID 或 null
 */
export function normalizeToutiaoPgcId(raw: unknown): string | null {
  if (raw == null) {
    return null;
  }
  const id = String(raw).trim();
  if (!id || id === '0') {
    return null;
  }
  return id;
}

/**
 * 解析 publish 接口 JSON
 *
 * @param text 响应体
 * @returns 结果
 */
function parsePublishResponse(text: string): {
  code: number | string | undefined;
  message: string;
  pgcId: string | null;
  raw: Record<string, unknown>;
} {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`头条发布接口非 JSON: ${text.slice(0, 200)}`);
  }
  const data = (body.data || {}) as Record<string, unknown>;
  const code = (body.code ?? body.err_no) as number | string | undefined;
  const message = String(
    body.message || body.msg || body.reason || `code=${String(code)}`,
  );
  const pgcId = normalizeToutiaoPgcId(data.pgc_id ?? data.id);
  return { code, message, pgcId, raw: body };
}

/**
 * 业务码是否成功
 *
 * @param code 业务码
 * @returns 是否成功
 */
function isOkCode(code: number | string | undefined): boolean {
  return code === 0 || code === '0' || code === 200 || code === '200';
}

/**
 * 上传封面图（页内 FormData）
 *
 * @param page 已打开创作台的页面
 * @param bytes 图片字节
 * @param filename 文件名
 * @returns 封面结构（供 pgc_feed_covers）
 */
export async function uploadToutiaoCover(
  page: Page,
  bytes: Uint8Array,
  filename = 'cover.jpg',
): Promise<{
  id: number;
  url: string;
  uri: string;
  origin_uri: string;
  thumb_width: number;
  thumb_height: number;
}> {
  const uploaded = await page.evaluate(
    async ({ uploadUrl, byteArr, name }) => {
      const form = new FormData();
      form.append(
        'upfile',
        new Blob([new Uint8Array(byteArr)], { type: 'image/jpeg' }),
        name,
      );
      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const text = await res.text();
      return { status: res.status, text };
    },
    {
      uploadUrl: TOUTIAO_UPLOAD_PICTURE,
      byteArr: Array.from(bytes),
      name: filename,
    },
  );

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(uploaded.text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `头条上传封面非 JSON (HTTP ${uploaded.status}): ${uploaded.text.slice(0, 160)}`,
    );
  }
  const code = body.code ?? body.err_no;
  if (code !== undefined && code !== 0 && code !== '0') {
    throw new Error(
      `头条上传封面失败: ${String(body.message || body.msg || code)}`,
    );
  }
  const url = String(body.url || body.web_url || '');
  const uri = String(body.web_uri || body.origin_web_uri || '');
  if (!url || !uri) {
    throw new Error(`头条上传封面缺 url/uri: ${uploaded.text.slice(0, 200)}`);
  }
  return {
    id: 0,
    url,
    uri,
    origin_uri: String(body.origin_web_uri || uri),
    thumb_width: Number(body.width || 300),
    thumb_height: Number(body.height || 300),
  };
}

/**
 * 页内调用 publish 接口
 *
 * @param page 页面
 * @param fields 表单字段
 * @returns 解析结果
 */
async function publishViaPage(
  page: Page,
  fields: Record<string, string>,
): Promise<ReturnType<typeof parsePublishResponse>> {
  const text = await page.evaluate(
    async ({ origin, fields: f }) => {
      const form = new URLSearchParams(f);
      const res = await fetch(
        `${origin}/mp/agw/article/publish?source=mp&type=article`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json, text/plain, */*',
            'x-requested-with': 'XMLHttpRequest',
          },
          body: form.toString(),
          credentials: 'include',
        },
      );
      return res.text();
    },
    { origin: TOUTIAO_MP_ORIGIN, fields },
  );
  return parsePublishResponse(text);
}

/**
 * 写入头条图文（优先草稿 save=0；失败则 save=1 提交）
 *
 * @param page Playwright 页面（须已登录）
 * @param input 标题 HTML 与可选封面
 * @returns pgcId 与模式说明
 */
export async function saveToutiaoArticleDraft(
  page: Page,
  input: {
    title: string;
    html: string;
    coverBytes?: Uint8Array | null;
  },
): Promise<{ pgcId: string; mode: 'draft' | 'submit'; note: string }> {
  // 1. 打开编辑页，让页内签名环境就绪
  await page.goto(TOUTIAO_ARTICLE_EDITOR, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2000);

  let coversJson = '[]';
  if (input.coverBytes && input.coverBytes.length > 0) {
    try {
      const cover = await uploadToutiaoCover(page, input.coverBytes);
      coversJson = JSON.stringify([cover]);
    } catch {
      // 封面失败不阻断提交
      coversJson = '[]';
    }
  }

  const baseFields: Record<string, string> = {
    title: input.title,
    content: input.html,
    article_ad_type: '2',
    article_type: '0',
    from_diagnosis: '0',
    origin_debut_check_pgc_normal: '0',
    tree_plan_article: '0',
    pgc_id: '0',
    pgc_feed_covers: coversJson,
  };

  // 2. 优先草稿
  const draft = await publishViaPage(page, {
    ...baseFields,
    save: '0',
  });
  if (isOkCode(draft.code) && draft.pgcId) {
    return {
      pgcId: draft.pgcId,
      mode: 'draft',
      note: '已写入头条草稿箱',
    };
  }

  // 3. 草稿失败（常见 7050）→ 提交（save=1），仍须真实 pgc_id
  const submitted = await publishViaPage(page, {
    ...baseFields,
    save: '1',
  });
  if (isOkCode(submitted.code) && submitted.pgcId) {
    return {
      pgcId: submitted.pgcId,
      mode: 'submit',
      note: `草稿模式失败（${draft.message}），已改为平台提交`,
    };
  }

  throw new Error(
    `头条写入失败：草稿=${draft.message}；提交=${submitted.message}`,
  );
}

/**
 * 草稿/文章编辑链接
 *
 * @param pgcId 文章 ID
 * @returns URL
 */
export function toutiaoDraftUrl(pgcId: string): string {
  return `${TOUTIAO_ARTICLE_EDITOR}?pgc_id=${encodeURIComponent(pgcId)}`;
}
