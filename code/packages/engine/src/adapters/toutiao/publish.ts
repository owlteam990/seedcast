/**
 * 今日头条号：Markdown → 图文草稿（Web API）
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
  detectToutiaoLoginFromLanding,
  getToutiaoMediaInfo,
  saveToutiaoArticleDraft,
  TOUTIAO_MP_HOME,
  toutiaoDraftUrl,
} from './client.js';

/**
 * 发布到头条号草稿
 *
 * @param input 发布输入
 * @returns 回执
 * @author Seedcast
 * @date 2026-11-22
 */
export async function publishToutiaoDraft(input: {
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
      cookieUrl: TOUTIAO_MP_HOME,
      run: async ({ fetch: fetchFn, landingUrl, landingHtml }) => {
        // 1. 登录态（API 优先，落地页兜底）
        log('检测头条号登录态');
        let info = await getToutiaoMediaInfo(fetchFn);
        if (!info) {
          info = detectToutiaoLoginFromLanding(landingUrl, landingHtml);
        }
        if (!info) {
          throw new Error(
            `头条号未登录或 Cookie 失效（落地：${landingUrl}），请到账号页重新登录`,
          );
        }
        log(`已登录：${info.name}`);

        // 2. 保存草稿
        const html = markdownToSimpleHtml(content.markdown ?? '');
        log('写入头条号草稿');
        return saveToutiaoArticleDraft(fetchFn, {
          title: content.title,
          html,
        });
      },
    });

    return {
      taskId,
      target,
      ok: true,
      url: toutiaoDraftUrl(result.pgcId),
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
