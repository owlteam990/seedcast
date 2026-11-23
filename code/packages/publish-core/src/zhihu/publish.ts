/**
 * 知乎：Markdown → 专栏文章草稿（Web API）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { markdownToSimpleHtml } from '../markdown/simpleHtml.js';
import {
  createZhihuArticleDraft,
  extractZhihuXsrf,
  getZhihuMe,
  updateZhihuArticleDraft,
  ZHIHU_ZHUANLAN_ORIGIN,
  zhihuDraftUrl,
} from './client.js';

export interface ZhihuPublishInput {
  profileDir: string;
  title: string;
  markdown: string;
  onInfo?: (message: string) => void;
}

export interface ZhihuPublishResult {
  ok: boolean;
  url?: string;
  draftId?: string;
  error?: { code: string; message: string };
}

/**
 * 发布到知乎专栏草稿（不自动公开发表）
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishZhihuDraft(
  input: ZhihuPublishInput,
): Promise<ZhihuPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  try {
    const result = await withProfileCookieSession({
      profileDir: input.profileDir,
      cookieUrl: `${ZHIHU_ZHUANLAN_ORIGIN}/write`,
      headless: true,
      run: async ({ fetch: fetchFn, cookieHeader }) => {
        const xsrf = extractZhihuXsrf(cookieHeader);

        log('检测知乎登录态');
        const me = await getZhihuMe(fetchFn, xsrf);
        if (!me) {
          throw new Error(
            '知乎未登录或 Cookie 失效，请 accounts open-login 后扫码',
          );
        }
        log(`已登录：${me.name}`);

        const title = [...(input.title || '')].slice(0, 100).join('');
        log('创建知乎草稿');
        const draftId = await createZhihuArticleDraft(fetchFn, title, xsrf);

        const html = markdownToSimpleHtml(input.markdown ?? '');
        log('写入草稿正文');
        await updateZhihuArticleDraft(
          fetchFn,
          draftId,
          { title, html },
          xsrf,
        );

        return { draftId };
      },
    });

    return {
      ok: true,
      draftId: result.draftId,
      url: zhihuDraftUrl(result.draftId),
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'PLATFORM_REJECTED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
