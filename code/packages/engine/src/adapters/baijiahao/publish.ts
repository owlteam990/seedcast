/**
 * 百家号：Markdown → 文章草稿（Web API）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type {
  Account,
  Content,
  PluginRecord,
  PublishTarget,
  Receipt,
} from '@seedcast/shared';
import { SeedcastErrorCode } from '@seedcast/shared';
import { withProfileCookieSession } from '../cookieHttp.js';
import { markdownToSimpleHtml } from '../simpleMarkdownHtml.js';
import {
  BAIJIAHAO_ORIGIN,
  baijiahaoDraftUrl,
  fetchBaijiahaoAuthToken,
  getBaijiahaoAppInfo,
  saveBaijiahaoArticleDraft,
} from './client.js';

/**
 * 发布到百家号草稿
 *
 * @param input 发布输入
 * @returns 回执
 * @author Seedcast
 * @date 2026-11-22
 */
export async function publishBaijiahaoDraft(input: {
  plugin: PluginRecord;
  content: Content;
  target: PublishTarget;
  account: Account;
  taskId: string;
  onInfo?: (message: string) => void;
}): Promise<Receipt> {
  const { content, target, account, taskId, onInfo } = input;
  const at = new Date().toISOString();
  const log = (msg: string): void => {
    onInfo?.(msg);
  };

  try {
    const result = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: BAIJIAHAO_ORIGIN,
      run: async ({ fetch: fetchFn }) => {
        // 1. 登录态
        log('检测百家号登录态');
        const info = await getBaijiahaoAppInfo(fetchFn);
        if (!info) {
          throw new Error('百家号未登录或 Cookie 失效，请到账号页重新登录');
        }
        log(`已登录：${info.name}`);

        // 2. 编辑 token
        log('获取编辑 token');
        const authToken = await fetchBaijiahaoAuthToken(fetchFn);

        // 3. 保存草稿
        const html = markdownToSimpleHtml(content.markdown ?? '');
        log('写入百家号草稿');
        return saveBaijiahaoArticleDraft(fetchFn, {
          title: content.title,
          html,
          authToken,
        });
      },
    });

    return {
      taskId,
      target,
      ok: true,
      url: baijiahaoDraftUrl(result.articleId),
      at,
    };
  } catch (err) {
    return {
      taskId,
      target,
      ok: false,
      error: {
        code: SeedcastErrorCode.PLATFORM_REJECTED,
        message: err instanceof Error ? err.message : String(err),
      },
      at,
    };
  }
}
