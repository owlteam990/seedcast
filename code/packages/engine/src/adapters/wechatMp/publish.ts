/**
 * 微信公众号：Markdown → 草稿箱（引擎包装 Receipt）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { join } from 'node:path';
import type {
  Account,
  Content,
  PluginRecord,
  PublishTarget,
  Receipt,
} from '@seedcast/shared';
import { SeedcastErrorCode } from '@seedcast/shared';
import { publishWechatMpDraft as publishCore } from '@seedcast/publish-core';

/**
 * 发布到公众号草稿箱
 *
 * @param input 发布输入
 * @returns 回执
 */
export async function publishWechatMpDraft(input: {
  plugin: PluginRecord;
  content: Content;
  target: PublishTarget;
  account: Account;
  taskId: string;
  onInfo?: (message: string) => void;
}): Promise<Receipt> {
  const { plugin, content, target, account, taskId, onInfo } = input;
  const settings = target.settings ?? {};

  const result = await publishCore({
    profileDir: account.profileDir,
    title: content.title,
    markdown: content.markdown,
    accountName: account.name,
    coverFile:
      typeof settings.coverFile === 'string' ? settings.coverFile : undefined,
    defaultCoverPath: join(plugin.dir, 'fixtures', 'cover.png'),
    author: typeof settings.author === 'string' ? settings.author : undefined,
    digest: typeof settings.digest === 'string' ? settings.digest : undefined,
    showCoverPic: settings.showCoverPic as number | string | undefined,
    contentSourceUrl:
      typeof settings.contentSourceUrl === 'string'
        ? settings.contentSourceUrl
        : undefined,
    onInfo,
  });

  if (!result.ok) {
    const code = result.error?.code;
    return {
      taskId,
      target,
      ok: false,
      error: {
        code:
          code === 'VALIDATION'
            ? SeedcastErrorCode.VALIDATION
            : code === 'PLATFORM_REJECTED'
              ? SeedcastErrorCode.PLATFORM_REJECTED
              : SeedcastErrorCode.UNKNOWN,
        message: result.error?.message ?? '公众号发布失败',
      },
      at: new Date().toISOString(),
    };
  }

  return {
    taskId,
    target,
    ok: true,
    url: result.url,
    at: new Date().toISOString(),
  };
}
