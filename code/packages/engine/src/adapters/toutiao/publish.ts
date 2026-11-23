/**
 * 今日头条草稿发布 — 委托 @seedcast/publish-core
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
import { publishToutiaoDraft as publishCore } from '@seedcast/publish-core';

/**
 * 发布到头条号
 *
 * @param input 发布输入
 * @returns 回执
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

  // 桌面端 assets 首张本地图作为封面
  let coverFile: string | undefined;
  for (const asset of content.assets ?? []) {
    if (/\.(png|jpe?g|webp)$/i.test(asset)) {
      if (asset.startsWith('/') || /^[A-Za-z]:\\/.test(asset)) {
        coverFile = asset;
        break;
      }
    }
  }

  const result = await publishCore({
    profileDir: account.profileDir,
    title: content.title,
    markdown: content.markdown ?? '',
    coverFile,
    onInfo,
  });

  if (!result.ok) {
    return {
      taskId,
      target,
      ok: false,
      error: {
        code: SeedcastErrorCode.PLATFORM_REJECTED,
        message: result.error?.message ?? '头条发布失败',
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
