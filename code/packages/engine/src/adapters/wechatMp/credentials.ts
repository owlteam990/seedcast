/**
 * 公众号账号凭证读写（存于账号 profileDir）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 凭证文件名 */
export const WECHAT_CREDENTIALS_FILE = 'credentials.json';

/** Token 缓存文件名前缀 */
export const WECHAT_TOKEN_CACHE_PREFIX = 'token_cache.';

/**
 * 公众号凭证
 */
export interface WechatCredentials {
  /** AppID */
  appid: string;
  /** AppSecret */
  appsecret: string;
}

/**
 * 读取凭证
 *
 * @param profileDir 账号 profile 目录
 * @returns 凭证或 null
 * @author Seedcast
 * @date 2026-11-21
 */
export function readWechatCredentials(
  profileDir: string,
): WechatCredentials | null {
  const path = join(profileDir, WECHAT_CREDENTIALS_FILE);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      unknown
    >;
    const appid = typeof raw.appid === 'string' ? raw.appid.trim() : '';
    const appsecret =
      typeof raw.appsecret === 'string' ? raw.appsecret.trim() : '';
    if (!appid || !appsecret) {
      return null;
    }
    return { appid, appsecret };
  } catch {
    return null;
  }
}

/**
 * 写入凭证（权限 600）
 *
 * @param profileDir 账号目录
 * @param credentials 凭证
 * @author Seedcast
 * @date 2026-11-21
 */
export function writeWechatCredentials(
  profileDir: string,
  credentials: WechatCredentials,
): void {
  mkdirSync(profileDir, { recursive: true });
  const path = join(profileDir, WECHAT_CREDENTIALS_FILE);
  writeFileSync(
    path,
    JSON.stringify(
      {
        appid: credentials.appid.trim(),
        appsecret: credentials.appsecret.trim(),
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

/**
 * 校验 AppID 形态
 *
 * @param appid AppID
 * @returns 是否像合法 AppID
 * @author Seedcast
 * @date 2026-11-21
 */
export function looksLikeWechatAppId(appid: string): boolean {
  return /^wx[a-zA-Z0-9]{16}$/.test(appid.trim());
}

/**
 * Token 缓存路径（按 appid 区分，避免多号串缓存）
 *
 * @param profileDir 账号目录
 * @param appid AppID
 * @returns 绝对路径
 * @author Seedcast
 * @date 2026-11-21
 */
export function tokenCachePath(profileDir: string, appid: string): string {
  return join(profileDir, `${WECHAT_TOKEN_CACHE_PREFIX}${appid}.json`);
}
