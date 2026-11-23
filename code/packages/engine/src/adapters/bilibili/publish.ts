/**
 * B站专栏草稿发布 — 委托 @seedcast/publish-core
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
import { publishBilibiliDraft as publishCore } from '@seedcast/publish-core';

/**
 * 发布到 B站专栏草稿
 *
 * @param input 发布输入
 * @returns 回执
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

  const result = await publishCore({
    profileDir: account.profileDir,
    title: content.title,
    markdown: content.markdown ?? '',
    tid: settings.tid as number | string | undefined,
    onInfo,
  });

  if (!result.ok) {
    return {
      taskId,
      target,
      ok: false,
      error: {
        code: SeedcastErrorCode.PLATFORM_REJECTED,
        message: result.error?.message ?? 'B站发布失败',
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
