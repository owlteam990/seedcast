/**
 * X（Twitter）OAuth 1.0a 凭证读写
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
export const X_CREDENTIALS_FILE = 'credentials.json';

/**
 * X 用户上下文凭证（OAuth 1.0a）
 */
export interface XCredentials {
  /** API Key (Consumer Key) */
  apiKey: string;
  /** API Key Secret */
  apiSecret: string;
  /** Access Token */
  accessToken: string;
  /** Access Token Secret */
  accessTokenSecret: string;
}

/**
 * 读取 X 凭证
 *
 * @param profileDir 账号目录
 * @returns 凭证或 null
 */
export function readXCredentials(profileDir: string): XCredentials | null {
  const path = join(profileDir, X_CREDENTIALS_FILE);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      unknown
    >;
    const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
    const apiSecret =
      typeof raw.apiSecret === 'string' ? raw.apiSecret.trim() : '';
    const accessToken =
      typeof raw.accessToken === 'string' ? raw.accessToken.trim() : '';
    const accessTokenSecret =
      typeof raw.accessTokenSecret === 'string'
        ? raw.accessTokenSecret.trim()
        : '';
    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
      return null;
    }
    return { apiKey, apiSecret, accessToken, accessTokenSecret };
  } catch {
    return null;
  }
}

/**
 * 写入 X 凭证（权限 600）
 *
 * @param profileDir 账号目录
 * @param credentials 凭证
 */
export function writeXCredentials(
  profileDir: string,
  credentials: XCredentials,
): void {
  mkdirSync(profileDir, { recursive: true });
  const path = join(profileDir, X_CREDENTIALS_FILE);
  writeFileSync(
    path,
    JSON.stringify(
      {
        apiKey: credentials.apiKey.trim(),
        apiSecret: credentials.apiSecret.trim(),
        accessToken: credentials.accessToken.trim(),
        accessTokenSecret: credentials.accessTokenSecret.trim(),
      },
      null,
      2,
    ),
    { encoding: 'utf8', mode: 0o600 },
  );
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows 等可能忽略
  }
}
