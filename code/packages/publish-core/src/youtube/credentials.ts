/**
 * YouTube OAuth 2.0 凭证读写
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/** 凭证文件名 */
export const YOUTUBE_CREDENTIALS_FILE = 'credentials.json';

/** Token 缓存 */
export const YOUTUBE_TOKEN_CACHE = 'token_cache.json';

/**
 * YouTube OAuth 凭证
 */
export interface YouTubeCredentials {
  /** OAuth Client ID */
  clientId: string;
  /** OAuth Client Secret */
  clientSecret: string;
  /** Refresh Token */
  refreshToken: string;
}

/**
 * 读取 YouTube 凭证
 *
 * @param profileDir 账号目录
 * @returns 凭证或 null
 */
export function readYouTubeCredentials(
  profileDir: string,
): YouTubeCredentials | null {
  const path = join(profileDir, YOUTUBE_CREDENTIALS_FILE);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      unknown
    >;
    const clientId =
      typeof raw.clientId === 'string' ? raw.clientId.trim() : '';
    const clientSecret =
      typeof raw.clientSecret === 'string' ? raw.clientSecret.trim() : '';
    const refreshToken =
      typeof raw.refreshToken === 'string' ? raw.refreshToken.trim() : '';
    if (!clientId || !clientSecret || !refreshToken) {
      return null;
    }
    return { clientId, clientSecret, refreshToken };
  } catch {
    return null;
  }
}

/**
 * 写入 YouTube 凭证
 *
 * @param profileDir 账号目录
 * @param credentials 凭证
 */
export function writeYouTubeCredentials(
  profileDir: string,
  credentials: YouTubeCredentials,
): void {
  mkdirSync(profileDir, { recursive: true });
  const path = join(profileDir, YOUTUBE_CREDENTIALS_FILE);
  writeFileSync(
    path,
    JSON.stringify(
      {
        clientId: credentials.clientId.trim(),
        clientSecret: credentials.clientSecret.trim(),
        refreshToken: credentials.refreshToken.trim(),
      },
      null,
      2,
    ),
    { encoding: 'utf8', mode: 0o600 },
  );
  try {
    chmodSync(path, 0o600);
  } catch {
    // ignore
  }
}

/**
 * Token 缓存路径
 *
 * @param profileDir 账号目录
 * @returns 路径
 */
export function youtubeTokenCachePath(profileDir: string): string {
  return join(profileDir, YOUTUBE_TOKEN_CACHE);
}
