/**
 * YouTube：本地视频 → 私密/未列出/公开上传（官方 API）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import {
  getYouTubeAccessToken,
  getYouTubeMyChannel,
  uploadYouTubeVideo,
  youtubeVideoUrl,
} from './client.js';
import { readYouTubeCredentials } from './credentials.js';

export interface YouTubePublishInput {
  profileDir: string;
  title: string;
  /** 描述（可用 markdown 原文） */
  description?: string;
  /** 本地视频路径 */
  videoFile: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
  categoryId?: string;
  onInfo?: (message: string) => void;
}

export interface YouTubePublishResult {
  ok: boolean;
  url?: string;
  videoId?: string;
  error?: { code: string; message: string };
}

/**
 * 解析本地视频路径
 *
 * @param videoFile 用户传入路径
 * @returns 绝对路径
 */
function resolveVideoPath(videoFile: string): string {
  const dataAssets = join(homedir(), '.seedcast', 'assets');
  const candidates = [
    videoFile,
    isAbsolute(videoFile) ? videoFile : join(dataAssets, videoFile),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      return c;
    }
  }
  throw new Error(`未找到本地视频文件: ${videoFile}`);
}

/**
 * 上传到 YouTube（默认私密）
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishYouTubeDraft(
  input: YouTubePublishInput,
): Promise<YouTubePublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  try {
    const credentials = readYouTubeCredentials(input.profileDir);
    if (!credentials) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message:
            'YouTube 未绑定 OAuth 凭证，请 accounts add --platform youtube --client-id ...',
        },
      };
    }

    log('刷新 YouTube access token');
    const token = await getYouTubeAccessToken(
      input.profileDir,
      credentials,
      false,
    );
    const channel = await getYouTubeMyChannel(token);
    log(`已授权频道：${channel.title}`);

    const privacyRaw = input.privacyStatus ?? 'private';
    const privacyStatus =
      privacyRaw === 'public' || privacyRaw === 'unlisted'
        ? privacyRaw
        : 'private';

    const filePath = resolveVideoPath(input.videoFile);
    const { videoId } = await uploadYouTubeVideo({
      accessToken: token,
      filePath,
      title: input.title,
      description: input.description ?? '',
      privacyStatus,
      categoryId: input.categoryId,
      onInfo: log,
    });

    return {
      ok: true,
      videoId,
      url: youtubeVideoUrl(videoId),
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
