/**
 * 微博：Markdown → 头条文章草稿（Web API）
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
  createWeiboArticleDraft,
  getWeiboUserConfig,
  saveWeiboArticleDraft,
  WEIBO_ARTICLE_EDITOR,
  weiboDraftUrl,
} from './client.js';

/**
 * 发布到微博头条文章草稿
 *
 * @param input 发布输入
 * @returns 回执
 * @author Seedcast
 * @date 2026-11-22
 */
export async function publishWeiboDraft(input: {
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
      cookieUrl: WEIBO_ARTICLE_EDITOR,
      run: async ({ fetch: fetchFn, landingHtml }) => {
        // 1. 登录态
        log('检测微博登录态');
        const info = await getWeiboUserConfig(fetchFn, landingHtml);
        if (!info) {
          throw new Error('微博未登录或 Cookie 失效，请到账号页重新登录');
        }
        log(`已登录：${info.nick}`);

        // 2. 建草稿
        log('创建头条文章草稿');
        const { draftId } = await createWeiboArticleDraft(fetchFn, info.uid);

        // 3. 写正文
        const html = markdownToSimpleHtml(content.markdown ?? '').replace(
          />\s+</g,
          '><',
        );
        log('写入草稿正文');
        await saveWeiboArticleDraft(fetchFn, {
          uid: info.uid,
          draftId,
          title: content.title,
          contentHtml: html,
        });

        return { draftId };
      },
    });

    return {
      taskId,
      target,
      ok: true,
      url: weiboDraftUrl(result.draftId),
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
