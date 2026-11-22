/**
 * B站：Markdown → 专栏草稿（Web API）
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
  BILIBILI_DEFAULT_TID,
  BILIBILI_MEMBER_ORIGIN,
  bilibiliDraftUrl,
  extractBilibiliCsrf,
  getBilibiliNav,
  saveBilibiliArticleDraft,
} from './client.js';

/**
 * 发布到 B站专栏草稿
 *
 * @param input 发布输入
 * @returns 回执
 * @author Seedcast
 * @date 2026-11-22
 */
export async function publishBilibiliDraft(input: {
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
    const tidSetting =
      typeof settings.tid === 'number'
        ? settings.tid
        : typeof settings.tid === 'string' && settings.tid.trim()
          ? Number.parseInt(settings.tid.trim(), 10)
          : undefined;
    const tid =
      tidSetting !== undefined && Number.isFinite(tidSetting)
        ? tidSetting
        : BILIBILI_DEFAULT_TID;

    const result = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: BILIBILI_MEMBER_ORIGIN,
      run: async ({ fetch: fetchFn, cookies }) => {
        // 1. 登录态
        log('检测 B站登录态');
        const info = await getBilibiliNav(fetchFn);
        if (!info) {
          throw new Error('B站未登录或 Cookie 失效，请到账号页重新登录');
        }
        log(`已登录：${info.uname}`);

        // 2. CSRF
        const csrf = extractBilibiliCsrf(cookies);
        if (!csrf) {
          throw new Error('缺少 bili_jct，请重新扫码登录 B站');
        }

        // 3. 保存草稿
        const html = markdownToSimpleHtml(content.markdown ?? '');
        log('写入专栏草稿');
        return saveBilibiliArticleDraft(fetchFn, {
          title: content.title,
          contentHtml: html,
          csrf,
          tid,
        });
      },
    });

    return {
      taskId,
      target,
      ok: true,
      url: bilibiliDraftUrl(result.aid),
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
