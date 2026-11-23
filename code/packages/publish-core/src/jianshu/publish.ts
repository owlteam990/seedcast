/**
 * 简书：Markdown → 写作台草稿
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { markdownToSimpleHtml } from '../markdown/simpleHtml.js';
import {
  createJianshuNote,
  getJianshuBasicSettings,
  JIANSHU_ORIGIN,
  jianshuDraftUrl,
  listJianshuNotebooks,
  updateJianshuNote,
} from './client.js';

export interface JianshuPublishInput {
  profileDir: string;
  title: string;
  markdown: string;
  notebookId?: number | string;
  onInfo?: (message: string) => void;
}

export interface JianshuPublishResult {
  ok: boolean;
  url?: string;
  notebookId?: number;
  noteId?: number;
  error?: { code: string; message: string };
}

/**
 * 发布到简书写作台草稿
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishJianshuDraft(
  input: JianshuPublishInput,
): Promise<JianshuPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  const notebookIdSetting =
    typeof input.notebookId === 'number'
      ? input.notebookId
      : typeof input.notebookId === 'string' && input.notebookId.trim()
        ? Number.parseInt(input.notebookId.trim(), 10)
        : undefined;

  try {
    const result = await withProfileCookieSession({
      profileDir: input.profileDir,
      cookieUrl: JIANSHU_ORIGIN,
      headless: true,
      run: async ({ fetch: fetchFn }) => {
        log('检测简书登录态');
        const info = await getJianshuBasicSettings(fetchFn);
        if (!info) {
          throw new Error(
            '简书未登录或 Cookie 失效，请 accounts open-login 后扫码',
          );
        }
        log(`已登录：${info.nickname}`);

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
          const hit = notebooks.find((n) => n.id === notebookIdSetting);
          if (!hit) {
            throw new Error(`找不到文集 notebookId=${notebookIdSetting}`);
          }
          notebookId = hit.id;
        }

        log('新建笔记');
        const { noteId } = await createJianshuNote(fetchFn, {
          notebookId,
          title: input.title,
        });

        const html = markdownToSimpleHtml(input.markdown ?? '');
        log('写入正文草稿');
        await updateJianshuNote(fetchFn, {
          noteId,
          title: input.title,
          contentHtml: html,
          autosaveControl: 1,
        });

        return { notebookId, noteId };
      },
    });

    return {
      ok: true,
      notebookId: result.notebookId,
      noteId: result.noteId,
      url: jianshuDraftUrl(result.notebookId, result.noteId),
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
