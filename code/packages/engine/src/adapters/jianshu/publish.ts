/**
 * 简书号：Markdown → 写作台草稿（Web API）
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
  createJianshuNote,
  getJianshuBasicSettings,
  JIANSHU_ORIGIN,
  jianshuDraftUrl,
  listJianshuNotebooks,
  updateJianshuNote,
} from './client.js';

/**
 * 发布到简书写作台草稿
 *
 * @param input 发布输入
 * @returns 回执
 * @author Seedcast
 * @date 2026-11-22
 */
export async function publishJianshuDraft(input: {
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
    const notebookIdSetting =
      typeof settings.notebookId === 'number'
        ? settings.notebookId
        : typeof settings.notebookId === 'string' && settings.notebookId.trim()
          ? Number.parseInt(settings.notebookId.trim(), 10)
          : undefined;

    const result = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: JIANSHU_ORIGIN,
      run: async ({ fetch: fetchFn }) => {
        // 1. 校验登录
        log('检测简书登录态');
        const info = await getJianshuBasicSettings(fetchFn);
        if (!info) {
          throw new Error('简书未登录或 Cookie 失效，请到账号页重新登录');
        }
        log(`已登录：${info.nickname}`);

        // 2. 选择文集
        log('读取文集列表');
        const notebooks = await listJianshuNotebooks(fetchFn);
        if (notebooks.length === 0) {
          throw new Error('简书账号下没有文集，请先在写作台新建文集');
        }
        let notebookId = notebooks[0].id;
        if (
          notebookIdSetting !== undefined &&
          Number.isFinite(notebookIdSetting)
        ) {
          const hit = notebooks.find((n) => {
            return n.id === notebookIdSetting;
          });
          if (!hit) {
            throw new Error(`找不到文集 notebookId=${notebookIdSetting}`);
          }
          notebookId = hit.id;
        }

        // 3. 建笔记 + 写正文
        log('新建笔记');
        const { noteId } = await createJianshuNote(fetchFn, {
          notebookId,
          title: content.title,
        });

        const html = markdownToSimpleHtml(content.markdown ?? '');
        log('写入正文草稿');
        // autosave_control：新建后首更常用 1
        await updateJianshuNote(fetchFn, {
          noteId,
          title: content.title,
          contentHtml: html,
          autosaveControl: 1,
        });

        return { notebookId, noteId };
      },
    });

    const url = jianshuDraftUrl(result.notebookId, result.noteId);
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
