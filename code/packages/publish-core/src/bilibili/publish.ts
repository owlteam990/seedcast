/**
 * B站：Markdown → 专栏草稿（Web API）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { markdownToSimpleHtml } from '../markdown/simpleHtml.js';
import {
  BILIBILI_DEFAULT_TID,
  BILIBILI_MEMBER_ORIGIN,
  bilibiliDraftUrl,
  extractBilibiliCsrf,
  getBilibiliNav,
  saveBilibiliArticleDraft,
} from './client.js';

export interface BilibiliPublishInput {
  profileDir: string;
  title: string;
  markdown: string;
  /** 分区 ID，缺省 4 */
  tid?: number | string;
  onInfo?: (message: string) => void;
}

export interface BilibiliPublishResult {
  ok: boolean;
  url?: string;
  aid?: string;
  error?: { code: string; message: string };
}

/**
 * 发布到 B站专栏草稿
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishBilibiliDraft(
  input: BilibiliPublishInput,
): Promise<BilibiliPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  const tidSetting =
    typeof input.tid === 'number'
      ? input.tid
      : typeof input.tid === 'string' && input.tid.trim()
        ? Number.parseInt(input.tid.trim(), 10)
        : undefined;
  const tid =
    tidSetting !== undefined && Number.isFinite(tidSetting)
      ? tidSetting
      : BILIBILI_DEFAULT_TID;

  try {
    const result = await withProfileCookieSession({
      profileDir: input.profileDir,
      cookieUrl: BILIBILI_MEMBER_ORIGIN,
      headless: true,
      run: async ({ fetch: fetchFn, cookies }) => {
        log('检测 B站登录态');
        const info = await getBilibiliNav(fetchFn);
        if (!info) {
          throw new Error(
            'B站未登录或 Cookie 失效，请 accounts open-login 后扫码',
          );
        }
        log(`已登录：${info.uname}`);

        const csrf = extractBilibiliCsrf(cookies);
        if (!csrf) {
          throw new Error('缺少 bili_jct，请重新扫码登录 B站');
        }

        const html = markdownToSimpleHtml(input.markdown ?? '');
        log('写入专栏草稿');
        return saveBilibiliArticleDraft(fetchFn, {
          title: input.title,
          contentHtml: html,
          csrf,
          tid,
        });
      },
    });

    return {
      ok: true,
      aid: result.aid,
      url: bilibiliDraftUrl(result.aid),
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
