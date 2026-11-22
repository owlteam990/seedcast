/**
 * YouTube：视频 → 私密上传（官方 API）
 *
 * @author Seedcast
 * @date 2026-11-22
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
import {
  getYouTubeAccessToken,
  getYouTubeMyChannel,
  uploadYouTubeVideo,
  youtubeVideoUrl,
} from './client.js';
import { readYouTubeCredentials } from './credentials.js';

/**
 * 解析本地视频路径
 *
 * @param content 内容
 * @returns 绝对路径
 */
function resolveVideoPath(content: Content): string {
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
  const log = (msg: string): void => {
    onInfo?.(msg);
  };

  try {
    if (content.contentType !== 'video') {
      throw new Error('YouTube 插件仅支持视频内容类型');
    }
    const credentials = readYouTubeCredentials(account.profileDir);
    if (!credentials) {
      return {
        taskId,
        target,
        ok: false,
        error: {
          code: SeedcastErrorCode.VALIDATION,
          message:
            'YouTube 账号未绑定 OAuth 凭证，请到账号页填写 Client ID / Secret / Refresh Token',
        },
        at,
      };
    }

    log('刷新 YouTube access token');
    const token = await getYouTubeAccessToken(
      account.profileDir,
      credentials,
      false,
    );
    const channel = await getYouTubeMyChannel(token);
    log(`已授权频道：${channel.title}`);

    const privacyRaw =
      typeof settings.privacyStatus === 'string'
        ? settings.privacyStatus.trim()
        : 'private';
    const privacyStatus =
      privacyRaw === 'public' || privacyRaw === 'unlisted'
        ? privacyRaw
        : 'private';
    const categoryId =
      settings.categoryId != null ? String(settings.categoryId) : undefined;

    const filePath = resolveVideoPath(content);
    const { videoId } = await uploadYouTubeVideo({
      accessToken: token,
      filePath,
      title: content.title,
      description: content.markdown ?? '',
      privacyStatus,
      categoryId,
      onInfo: log,
    });

    return {
      taskId,
      target,
      ok: true,
      url: youtubeVideoUrl(videoId),
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
