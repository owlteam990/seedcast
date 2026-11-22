/**
 * CSDN：Markdown → 博客草稿箱（Web API）
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
  CSDN_EDITOR_ORIGIN,
  csdnDraftUrl,
  getCsdnBaseInfo,
  saveCsdnArticleDraft,
} from './client.js';

/**
 * 发布到 CSDN Markdown 草稿
 *
 * @param input 发布输入
 * @returns 回执
 * @author Seedcast
 * @date 2026-11-22
 */
export async function publishCsdnDraft(input: {
  plugin: PluginRecord;
  content: Content;
  target: PublishTarget;
  account: Account;
  taskId: string;
  onInfo?: (message: string) => void;
}): Promise<Receipt> {
  const { content, target, account, taskId, onInfo } = input;
  const at = new Date().toISOString();
  const settings = target.settings ?? {};
  const log = (msg: string): void => {
    onInfo?.(msg);
  };

  try {
    const tags =
      typeof settings.tags === 'string' ? settings.tags.trim() : '';
    const categories =
      typeof settings.categories === 'string'
        ? settings.categories.trim()
        : '';

    const result = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: CSDN_EDITOR_ORIGIN,
      run: async ({ fetch: fetchFn }) => {
        // 1. 校验登录
        log('检测 CSDN 登录态');
        const info = await getCsdnBaseInfo(fetchFn);
        if (!info) {
          throw new Error('CSDN 未登录或 Cookie 失效，请到账号页重新登录');
        }
        log(`已登录：${info.nickname}`);

        // 2. Markdown + HTML
        const markdown = content.markdown ?? '';
        const html = markdownToSimpleHtml(markdown);

        // 3. 保存草稿
        log('写入 CSDN 草稿箱');
        return saveCsdnArticleDraft(fetchFn, {
          title: content.title,
          markdown,
          html,
          tags,
          categories,
        });
      },
    });

    const url = csdnDraftUrl(result.articleId);
    return {
      taskId,
      target,
      ok: true,
      url,
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
