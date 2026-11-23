/**
 * 微博：Markdown → 头条文章草稿（Web API）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { markdownToSimpleHtml } from '../markdown/simpleHtml.js';
import {
  createWeiboArticleDraft,
  getWeiboUserConfig,
  saveWeiboArticleDraft,
  WEIBO_ARTICLE_EDITOR,
  weiboDraftUrl,
} from './client.js';

export interface WeiboPublishInput {
  profileDir: string;
  title: string;
  markdown: string;
  onInfo?: (message: string) => void;
}

export interface WeiboPublishResult {
  ok: boolean;
  url?: string;
  draftId?: string;
  error?: { code: string; message: string };
}

/**
 * 发布到微博头条文章草稿
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishWeiboDraft(
  input: WeiboPublishInput,
): Promise<WeiboPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  try {
    const result = await withProfileCookieSession({
      profileDir: input.profileDir,
      cookieUrl: WEIBO_ARTICLE_EDITOR,
      headless: true,
      run: async ({ fetch: fetchFn, landingHtml }) => {
        log('检测微博登录态');
        const info = await getWeiboUserConfig(fetchFn, landingHtml);
        if (!info) {
          throw new Error(
            '微博未登录或 Cookie 失效，请 accounts open-login 后扫码',
          );
        }
        log(`已登录：${info.nick}`);

        log('创建头条文章草稿');
        const { draftId } = await createWeiboArticleDraft(fetchFn, info.uid);

        const html = markdownToSimpleHtml(input.markdown ?? '').replace(
          />\s+</g,
          '><',
        );
        log('写入草稿正文');
        await saveWeiboArticleDraft(fetchFn, {
          uid: info.uid,
          draftId,
          title: input.title,
          contentHtml: html,
        });

        return { draftId };
      },
    });

    return {
      ok: true,
      draftId: result.draftId,
      url: weiboDraftUrl(result.draftId),
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
