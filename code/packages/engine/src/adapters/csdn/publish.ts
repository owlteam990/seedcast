/**
 * CSDN 草稿发布 — 委托 @seedcast/publish-core
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import type {
  Account,
  Content,
  PluginRecord,
  PublishTarget,
  Receipt,
} from '@seedcast/shared';
import { SeedcastErrorCode } from '@seedcast/shared';
import { publishCsdnDraft as publishCore } from '@seedcast/publish-core';

/**
 * 发布到 CSDN Markdown 草稿
 *
 * @param input 发布输入
 * @returns 回执
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
  const settings = target.settings ?? {};
  const at = new Date().toISOString();

  const result = await publishCore({
    profileDir: account.profileDir,
    title: content.title,
    markdown: content.markdown ?? '',
    tags: typeof settings.tags === 'string' ? settings.tags.trim() : '',
    categories:
      typeof settings.categories === 'string'
        ? settings.categories.trim()
        : '',
    onInfo,
  });

  if (!result.ok) {
    return {
      taskId,
      target,
      ok: false,
      error: {
        code: SeedcastErrorCode.PLATFORM_REJECTED,
        message: result.error?.message ?? 'CSDN 发布失败',
      },
      at,
    };
  }

  return {
    taskId,
    target,
    ok: true,
    url: result.url,
    at,
  };
}
