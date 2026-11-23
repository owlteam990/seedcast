/**
 * 博客园 MetaWeblog 凭证读写
 *
 * @author Seedcast
 * @date 2026-11-23
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
export const CNBLOGS_CREDENTIALS_FILE = 'credentials.json';

/**
 * 博客园 MetaWeblog 凭证
 * 启用：https://i.cnblogs.com/settings#enableServiceAccess
 */
export interface CnblogsCredentials {
  /** 登录用户名 */
  username: string;
  /** 访问令牌（非登录密码） */
  token: string;
  /** 博客名（RPC 路径 /metaweblog/<blogName>） */
  blogName: string;
}

/**
 * 读取博客园凭证
 *
 * @param profileDir 账号目录
 * @returns 凭证或 null
 */
export function readCnblogsCredentials(
  profileDir: string,
): CnblogsCredentials | null {
  const path = join(profileDir, CNBLOGS_CREDENTIALS_FILE);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      unknown
    >;
    const username =
      typeof raw.username === 'string' ? raw.username.trim() : '';
    const token = typeof raw.token === 'string' ? raw.token.trim() : '';
    const blogName =
      typeof raw.blogName === 'string' ? raw.blogName.trim() : '';
    if (!username || !token || !blogName) {
      return null;
    }
    return { username, token, blogName };
  } catch {
    return null;
  }
}

/**
 * 写入博客园凭证（权限 600）
 *
 * @param profileDir 账号目录
 * @param credentials 凭证
 */
export function writeCnblogsCredentials(
  profileDir: string,
  credentials: CnblogsCredentials,
): void {
  mkdirSync(profileDir, { recursive: true });
  const path = join(profileDir, CNBLOGS_CREDENTIALS_FILE);
  writeFileSync(
    path,
    JSON.stringify(
      {
        username: credentials.username.trim(),
        token: credentials.token.trim(),
        blogName: credentials.blogName.trim(),
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
