/**
 * YouTube Data API v3 客户端（OAuth 2.0 refresh_token）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import type { YouTubeCredentials } from './credentials.js';
import { youtubeTokenCachePath } from './credentials.js';

/** OAuth token 端点 */
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** YouTube Data API */
export const YOUTUBE_API_ORIGIN = 'https://www.googleapis.com';

/**
 * 刷新并缓存 access_token
 *
 * @param profileDir 账号目录
 * @param credentials 凭证
 * @param forceRefresh 强制刷新
 * @returns access_token
 */
export async function getYouTubeAccessToken(
  profileDir: string,
  credentials: YouTubeCredentials,
  forceRefresh = false,
): Promise<string> {
  const cacheFile = youtubeTokenCachePath(profileDir);
  if (!forceRefresh && existsSync(cacheFile)) {
    try {
      const cache = JSON.parse(readFileSync(cacheFile, 'utf8')) as {
        accessToken?: string;
        expiresAt?: number;
      };
      if (
        cache.accessToken &&
        typeof cache.expiresAt === 'number' &&
        cache.expiresAt > Date.now() + 60_000
      ) {
        return cache.accessToken;
      }
    } catch {
      // 继续刷新
    }
  }

  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `刷新 YouTube token 失败 (HTTP ${res.status})`,
    );
  }
  const expiresIn = json.expires_in ?? 3600;
  writeFileSync(
    cacheFile,
    JSON.stringify(
      {
        accessToken: json.access_token,
        expiresAt: Date.now() + expiresIn * 1000,
      },
      null,
      2,
    ),
    { encoding: 'utf8', mode: 0o600 },
  );
  return json.access_token;
}

/**
 * 频道信息
 */
export interface YouTubeChannelInfo {
  id: string;
  title: string;
}

/**
 * 校验凭证：channels.list mine=true
 *
 * @param accessToken access_token
 * @returns 频道信息
 */
export async function getYouTubeMyChannel(
  accessToken: string,
): Promise<YouTubeChannelInfo> {
  const url = new URL(`${YOUTUBE_API_ORIGIN}/youtube/v3/channels`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('mine', 'true');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json()) as {
    items?: Array<{ id?: string; snippet?: { title?: string } }>;
    error?: { message?: string };
  };
  if (!res.ok || !body.items?.[0]?.id) {
    throw new Error(
      body.error?.message || `YouTube 频道查询失败 (HTTP ${res.status})`,
    );
  }
  const item = body.items[0];
  return {
    id: item.id!,
    title: item.snippet?.title || item.id!,
  };
}

/**
 * 可续传上传视频
 *
 * @param input 上传参数
 * @returns 视频 ID
 */
export async function uploadYouTubeVideo(input: {
  accessToken: string;
  filePath: string;
  title: string;
  description: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
  categoryId?: string;
  onInfo?: (message: string) => void;
}): Promise<{ videoId: string }> {
  const { accessToken, filePath, title, description, privacyStatus } = input;
  if (!existsSync(filePath)) {
    throw new Error(`视频文件不存在: ${filePath}`);
  }
  const size = statSync(filePath).size;
  if (size <= 0) {
    throw new Error('视频文件为空');
  }

  const categoryId = input.categoryId?.trim() || '22';
  const metadata = {
    snippet: {
      title: title.slice(0, 100),
      description: description.slice(0, 5000),
      categoryId,
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };

  input.onInfo?.('初始化 YouTube 可续传上传');
  const initUrl = new URL(
    `${YOUTUBE_API_ORIGIN}/upload/youtube/v3/videos`,
  );
  initUrl.searchParams.set('uploadType', 'resumable');
  initUrl.searchParams.set('part', 'snippet,status');

  const initRes = await fetch(initUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-length': String(size),
      'x-upload-content-type': 'video/*',
    },
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) {
    let detail = `HTTP ${initRes.status}`;
    try {
      const errBody = (await initRes.json()) as {
        error?: { message?: string };
      };
      detail = errBody.error?.message || detail;
    } catch {
      // ignore
    }
    throw new Error(`YouTube 初始化上传失败: ${detail}`);
  }
  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    throw new Error('YouTube 未返回可续传上传 URL');
  }

  input.onInfo?.(`上传视频（${Math.round(size / 1024 / 1024)} MB）`);
  // Node fetch 对大文件流支持不一：用 Blob/Buffer 读入可能爆内存；
  // 对桌面工具首版限制 512MB，用 Buffer 一次性 PUT（与多数脚本一致）
  if (size > 512 * 1024 * 1024) {
    throw new Error('视频超过 512MB，请先压缩或到 Studio 手动上传');
  }
  const fileBuf = readFileSync(filePath);
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'video/*',
      'content-length': String(size),
    },
    body: fileBuf,
  });
  const putBody = (await putRes.json()) as {
    id?: string;
    error?: { message?: string };
  };
  if (!putRes.ok || !putBody.id) {
    throw new Error(
      putBody.error?.message || `YouTube 上传失败 (HTTP ${putRes.status})`,
    );
  }
  return { videoId: putBody.id };
}

/**
 * Studio / 观看链接
 *
 * @param videoId 视频 ID
 * @returns URL
 */
export function youtubeVideoUrl(videoId: string): string {
  return `https://studio.youtube.com/video/${encodeURIComponent(videoId)}/edit`;
}
