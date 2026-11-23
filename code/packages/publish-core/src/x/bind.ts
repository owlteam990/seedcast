/**
 * 绑定 X OAuth 1.0a 凭证
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { randomUUID } from 'node:crypto';
import {
  createAccount,
  updateAccountStatus,
  type AccountRecord,
} from '../db/accounts.js';
import { getDefaultDataDir, resolveProfileDir } from '../paths.js';
import { getXUserMe } from './client.js';
import { readXCredentials, writeXCredentials } from './credentials.js';

export const X_PLUGIN_ID = 'x';

/**
 * 创建 X 账号并校验凭证
 *
 * @param input 参数
 * @returns 账号与是否校验通过
 */
export async function bindXAccount(input: {
  name: string;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  dataDir?: string;
}): Promise<{ account: AccountRecord; loggedIn: boolean }> {
  const dataDir = input.dataDir ?? getDefaultDataDir();
  const apiKey = input.apiKey.trim();
  const apiSecret = input.apiSecret.trim();
  const accessToken = input.accessToken.trim();
  const accessTokenSecret = input.accessTokenSecret.trim();
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    throw new Error('请填写完整的 API Key / Secret 与 Access Token / Secret');
  }

  const accountId = randomUUID();
  const profileDir = resolveProfileDir(dataDir, X_PLUGIN_ID, accountId);
  writeXCredentials(profileDir, {
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret,
  });

  let displayName = input.name.trim() || 'X';
  const account = createAccount(
    {
      id: accountId,
      pluginId: X_PLUGIN_ID,
      name: displayName,
      profileDir,
    },
    dataDir,
  );

  try {
    const me = await getXUserMe({
      apiKey,
      apiSecret,
      accessToken,
      accessTokenSecret,
    });
    displayName = input.name.trim() || `@${me.username}`;
    updateAccountStatus(account.id, 'logged_in', dataDir);
    account.status = 'logged_in';
    account.lastCheckAt = new Date().toISOString();
    account.name = displayName;
    return { account, loggedIn: true };
  } catch (err) {
    updateAccountStatus(account.id, 'expired', dataDir);
    account.status = 'expired';
    throw err;
  }
}

/**
 * 检测 X 凭证是否仍可用
 *
 * @param account 含 profileDir
 * @returns 是否可用
 */
export async function checkXSession(account: {
  profileDir: string;
}): Promise<boolean> {
  const credentials = readXCredentials(account.profileDir);
  if (!credentials) {
    return false;
  }
  try {
    await getXUserMe(credentials);
    return true;
  } catch {
    return false;
  }
}
