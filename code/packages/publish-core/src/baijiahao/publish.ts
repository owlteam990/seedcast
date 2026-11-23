/**
 * 百家号：Markdown → 文章草稿
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { markdownToSimpleHtml } from '../markdown/simpleHtml.js';
import {
  BAIJIAHAO_ORIGIN,
  baijiahaoDraftUrl,
  fetchBaijiahaoAuthToken,
  getBaijiahaoAppInfo,
  saveBaijiahaoArticleDraft,
} from './client.js';

export interface BaijiahaoPublishInput {
  profileDir: string;
  title: string;
  markdown: string;
  onInfo?: (message: string) => void;
}

export interface BaijiahaoPublishResult {
  ok: boolean;
  url?: string;
  articleId?: string;
  error?: { code: string; message: string };
}

/**
 * 发布到百家号草稿
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishBaijiahaoDraft(
  input: BaijiahaoPublishInput,
): Promise<BaijiahaoPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  try {
    const result = await withProfileCookieSession({
      profileDir: input.profileDir,
      cookieUrl: BAIJIAHAO_ORIGIN,
      headless: true,
      run: async ({ fetch: fetchFn }) => {
        log('检测百家号登录态');
        const info = await getBaijiahaoAppInfo(fetchFn);
        if (!info) {
          throw new Error(
            '百家号未登录或 Cookie 失效，请 accounts open-login 后扫码',
          );
        }
        log(`已登录：${info.name}`);

        log('获取编辑 token');
        const authToken = await fetchBaijiahaoAuthToken(fetchFn);

        const html = markdownToSimpleHtml(input.markdown ?? '');
        log('写入百家号草稿');
        return saveBaijiahaoArticleDraft(fetchFn, {
          title: input.title,
          html,
          authToken,
        });
      },
    });

    return {
      ok: true,
      articleId: result.articleId,
      url: baijiahaoDraftUrl(result.articleId),
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
