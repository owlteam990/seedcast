/**
 * YouTube 上传 — 委托 @seedcast/publish-core
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type {
  Account,
  Content,
  PluginRecord,
  PublishTarget,
  Receipt,
} from '@seedcast/shared';
import { SeedcastErrorCode } from '@seedcast/shared';
import { publishYouTubeDraft as publishCore } from '@seedcast/publish-core';

/**
 * 解析内容中的本地视频
 *
 * @param content 内容
 * @returns 路径
 */
function firstVideoAsset(content: Content): string {
  const dataAssets = join(homedir(), '.seedcast', 'assets');
  for (const asset of content.assets ?? []) {
    if (!/\.(mp4|mov|webm|mkv|avi)$/i.test(asset)) {
      continue;
    }
    const candidates = [
      asset,
      isAbsolute(asset) ? asset : join(dataAssets, asset),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        return c;
      }
    }
  }
  throw new Error('未找到本地视频文件（请在内容库视频素材中上传）');
}

/**
 * 上传到 YouTube（默认私密）
 *
 * @param input 发布输入
 * @returns 回执
 */
export async function publishYouTubeDraft(input: {
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

  try {
    if (content.contentType !== 'video') {
      throw new Error('YouTube 插件仅支持视频内容类型');
    }
    const privacyRaw =
      typeof settings.privacyStatus === 'string'
        ? settings.privacyStatus.trim()
        : 'private';
    const privacyStatus =
      privacyRaw === 'public' || privacyRaw === 'unlisted'
        ? privacyRaw
        : 'private';

    const result = await publishCore({
      profileDir: account.profileDir,
      title: content.title,
      description: content.markdown ?? '',
      videoFile: firstVideoAsset(content),
      privacyStatus,
      categoryId:
        settings.categoryId != null ? String(settings.categoryId) : undefined,
      onInfo,
    });

    if (!result.ok) {
      return {
        taskId,
        target,
        ok: false,
        error: {
          code: SeedcastErrorCode.PLATFORM_REJECTED,
          message: result.error?.message ?? 'YouTube 发布失败',
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
