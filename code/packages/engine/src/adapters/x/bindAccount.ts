/**
 * 绑定 X OAuth 1.0a 凭证
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { randomUUID } from 'node:crypto';
import type { Account, PluginRecord } from '@seedcast/shared';
import type { SeedcastDatabase } from '../../db/database.js';
import { createAccount, updateAccountStatus } from '../../db/accounts.js';
import { resolveProfileDir } from '../../session/pool.js';
import { getXUserMe } from './client.js';
import { readXCredentials, writeXCredentials } from './credentials.js';

/**
 * 创建 X 账号并校验凭证
 *
 * @param input 参数
 * @returns 账号
 */
export async function bindXAccount(input: {
  db: SeedcastDatabase;
  dataDir: string;
  plugin: PluginRecord;
  name: string;
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}): Promise<{ account: Account; loggedIn: boolean }> {
  if (input.plugin.manifest.id !== 'x') {
    throw new Error('仅 x 插件支持该凭证绑定');
  }
  const apiKey = input.apiKey.trim();
  const apiSecret = input.apiSecret.trim();
  const accessToken = input.accessToken.trim();
  const accessTokenSecret = input.accessTokenSecret.trim();
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    throw new Error('请填写完整的 API Key / Secret 与 Access Token / Secret');
  }

  const accountId = randomUUID();
  const profileDir = resolveProfileDir(
    input.dataDir,
    input.plugin.manifest.id,
    accountId,
  );
  writeXCredentials(profileDir, {
    apiKey,
    apiSecret,
    accessToken,
    accessTokenSecret,
  });

  let displayName = input.name.trim();
  const account = createAccount(input.db, {
    id: accountId,
    pluginId: input.plugin.manifest.id,
    name: displayName || 'X',
    profileDir,
  });

  try {
    const me = await getXUserMe({
      apiKey,
      apiSecret,
      accessToken,
      accessTokenSecret,
    });
    if (!displayName) {
      displayName = `@${me.username}`;
      account.name = displayName;
      // 名称仅展示；DB 已写入初始 name，检测态优先
    }
    updateAccountStatus(input.db, account.id, 'logged_in');
    account.status = 'logged_in';
    account.lastCheckAt = new Date().toISOString();
    account.name = displayName || `@${me.username}`;
    return { account, loggedIn: true };
  } catch (err) {
    updateAccountStatus(input.db, account.id, 'expired');
    account.status = 'expired';
    throw err;
  }
}

/**
 * 检测 X 凭证是否仍可用
 *
 * @param account 账号
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
