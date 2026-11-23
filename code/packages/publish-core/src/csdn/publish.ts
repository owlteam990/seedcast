/**
 * CSDN：Markdown → 博客草稿箱
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { markdownToSimpleHtml } from '../markdown/simpleHtml.js';
import {
  CSDN_EDITOR_ORIGIN,
  csdnDraftUrl,
  getCsdnBaseInfo,
  saveCsdnArticleDraft,
} from './client.js';

export interface CsdnPublishInput {
  profileDir: string;
  title: string;
  markdown: string;
  tags?: string;
  categories?: string;
  onInfo?: (message: string) => void;
}

export interface CsdnPublishResult {
  ok: boolean;
  url?: string;
  articleId?: string;
  error?: { code: string; message: string };
}

/**
 * 发布到 CSDN Markdown 草稿
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishCsdnDraft(
  input: CsdnPublishInput,
): Promise<CsdnPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  try {
    const result = await withProfileCookieSession({
      profileDir: input.profileDir,
      cookieUrl: CSDN_EDITOR_ORIGIN,
      headless: true,
      run: async ({ fetch: fetchFn }) => {
        log('检测 CSDN 登录态');
        const info = await getCsdnBaseInfo(fetchFn);
        if (!info) {
          throw new Error(
            'CSDN 未登录或 Cookie 失效，请在桌面端重新登录或 accounts 打开登录页',
          );
        }
        log(`已登录：${info.nickname}`);
        const markdown = input.markdown ?? '';
        const html = markdownToSimpleHtml(markdown);
        log('写入 CSDN 草稿箱');
        return saveCsdnArticleDraft(fetchFn, {
          title: input.title,
          markdown,
          html,
          tags: input.tags,
          categories: input.categories,
        });
      },
    });

    return {
      ok: true,
      articleId: result.articleId,
      url: csdnDraftUrl(result.articleId),
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
