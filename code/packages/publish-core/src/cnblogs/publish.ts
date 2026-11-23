/**
 * 博客园草稿：Cookie Web API 优先，MetaWeblog 备选
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import {
  cnblogsDraftEditUrl,
  cnblogsPostUrl,
  createCnblogsPost,
  getCnblogsUsersBlogs,
} from './client.js';
import { readCnblogsCredentials } from './credentials.js';
import {
  CNBLOGS_I_ORIGIN,
  createCnblogsWebDraft,
  extractCnblogsXsrfToken,
  getCnblogsUserInfo,
} from './webClient.js';

export interface CnblogsPublishInput {
  profileDir: string;
  title: string;
  markdown: string;
  /** 逗号分隔分类，可含「[随笔分类]xxx」；MetaWeblog 用 */
  categories?: string;
  /** 标签，逗号分隔 → mt_keywords（MetaWeblog） */
  tags?: string;
  /** 默认 false=草稿；Cookie 路径仅草稿 */
  publish?: boolean;
  onInfo?: (message: string) => void;
}

export interface CnblogsPublishResult {
  ok: boolean;
  url?: string;
  postId?: string;
  error?: { code: string; message: string };
}

/**
 * 解析分类列表
 *
 * @param raw 逗号分隔
 * @returns 分类数组
 */
function parseCategories(raw?: string): string[] {
  if (!raw || !String(raw).trim()) {
    return [];
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Cookie 写草稿
 *
 * @param input 发布输入
 * @returns 结果
 */
async function publishViaCookie(
  input: CnblogsPublishInput,
): Promise<CnblogsPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };
  const title = String(input.title || '').trim();
  const markdown = String(input.markdown || '').trim();
  if (!title) {
    throw new Error('标题为空');
  }
  if (!markdown) {
    throw new Error('正文为空');
  }
  if (input.publish) {
    log('Cookie 路径仅支持草稿；忽略 publish=true，写入草稿箱');
  }

  const result = await withProfileCookieSession({
    profileDir: input.profileDir,
    cookieUrl: `${CNBLOGS_I_ORIGIN}/`,
    headless: true,
    run: async ({ fetch: fetchFn, cookies }) => {
      log('检测博客园 Cookie 登录态');
      const info = await getCnblogsUserInfo(fetchFn);
      if (!info?.displayName && !info?.spaceUserId) {
        throw new Error(
          '博客园未登录或 Cookie 失效，请 accounts open-login 后登录',
        );
      }
      log(`已登录：${info.displayName || info.spaceUserId}`);
      if (!info.blogApp) {
        throw new Error(
          '账号尚未开通博客。请先打开 https://account.cnblogs.com/blog-apply 申请博客后再发草稿。',
        );
      }

      const xsrf = extractCnblogsXsrfToken(cookies);
      if (!xsrf) {
        throw new Error(
          '缺少 XSRF-TOKEN，请重新 open-login 打开博客园后台后再试',
        );
      }

      log('写入博客园草稿（Web API）');
      return createCnblogsWebDraft(fetchFn, {
        title,
        markdown,
        xsrfToken: xsrf,
        postType: 1,
      });
    },
  });

  return {
    ok: true,
    postId: String(result.id),
    url: cnblogsDraftEditUrl(String(result.id)),
  };
}

/**
 * MetaWeblog 写草稿/文章
 *
 * @param input 发布输入
 * @returns 结果
 */
async function publishViaMetaWeblog(
  input: CnblogsPublishInput,
): Promise<CnblogsPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };
  const credentials = readCnblogsCredentials(input.profileDir);
  if (!credentials) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        message:
          '博客园未登录且未绑定 MetaWeblog。请 accounts open-login，或 add --username --token --blog-name',
      },
    };
  }

  const title = String(input.title || '').trim();
  const markdown = String(input.markdown || '').trim();
  if (!title) {
    throw new Error('标题为空');
  }
  if (!markdown) {
    throw new Error('正文为空');
  }

  log('校验博客园 MetaWeblog 令牌');
  const blogs = await getCnblogsUsersBlogs(credentials);
  const blogid = blogs[0]?.blogid || 'blog';
  log(`博客：${blogs[0]?.blogName || credentials.blogName}`);

  const publishPublic = Boolean(input.publish);
  log(publishPublic ? '发布公开文章' : '写入草稿（publish=false）');
  const postId = await createCnblogsPost(credentials, {
    title,
    description: markdown,
    categories: parseCategories(input.categories),
    keywords: input.tags?.trim() || undefined,
    publish: publishPublic,
    blogid,
  });

  const url = publishPublic
    ? cnblogsPostUrl(credentials.blogName, postId)
    : cnblogsDraftEditUrl(postId);

  return { ok: true, postId, url };
}

/**
 * 写入博客园草稿/文章（Cookie 优先，失败且有令牌则 MetaWeblog）
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishCnblogsDraft(
  input: CnblogsPublishInput,
): Promise<CnblogsPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  try {
    // 1) Cookie 路径
    try {
      return await publishViaCookie(input);
    } catch (cookieErr) {
      const cookieMsg =
        cookieErr instanceof Error ? cookieErr.message : String(cookieErr);
      const credentials = readCnblogsCredentials(input.profileDir);
      // 未开通博客：勿静默切 MetaWeblog（同一账号大概率同样失败）
      if (/尚未开通博客|没有开通博客/.test(cookieMsg)) {
        throw cookieErr;
      }
      if (!credentials) {
        throw cookieErr;
      }
      log(`Cookie 发布未成功（${cookieMsg.slice(0, 80)}），改用 MetaWeblog`);
      return await publishViaMetaWeblog(input);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let code = 'PLATFORM_REJECTED';
    if (/尚未开通博客|没有开通博客/.test(message)) {
      code = 'BLOG_NOT_OPENED';
    } else if (/禁用 MetaWeblog|403/i.test(message)) {
      code = 'METAWEBLOG_DISABLED';
    } else if (
      /401|认证|用户名|密码|令牌|token|fault|未登录|Cookie 失效/i.test(message)
    ) {
      code = 'AUTH';
    }
    return {
      ok: false,
      error: { code, message },
    };
  }
}
