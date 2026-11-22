/**
 * 绑定 YouTube OAuth 凭证
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { randomUUID } from 'node:crypto';
import type { Account, PluginRecord } from '@seedcast/shared';
import type { SeedcastDatabase } from '../../db/database.js';
import { createAccount, updateAccountStatus } from '../../db/accounts.js';
import { resolveProfileDir } from '../../session/pool.js';
import { getYouTubeAccessToken, getYouTubeMyChannel } from './client.js';
import {
  readYouTubeCredentials,
  writeYouTubeCredentials,
} from './credentials.js';

/**
 * 创建 YouTube 账号并校验凭证
 *
 * @param input 参数
 * @returns 账号
 */
export async function bindYouTubeAccount(input: {
  db: SeedcastDatabase;
  dataDir: string;
  plugin: PluginRecord;
  name: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ account: Account; loggedIn: boolean }> {
  if (input.plugin.manifest.id !== 'youtube') {
    throw new Error('仅 youtube 插件支持该凭证绑定');
  }
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  const refreshToken = input.refreshToken.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('请填写 Client ID / Client Secret / Refresh Token');
  }

  const accountId = randomUUID();
  const profileDir = resolveProfileDir(
    input.dataDir,
    input.plugin.manifest.id,
    accountId,
  );
  writeYouTubeCredentials(profileDir, {
    clientId,
    clientSecret,
    refreshToken,
  });

  const account = createAccount(input.db, {
    id: accountId,
    pluginId: input.plugin.manifest.id,
    name: input.name.trim() || 'YouTube',
    profileDir,
  });

  try {
    const token = await getYouTubeAccessToken(
      profileDir,
      { clientId, clientSecret, refreshToken },
      true,
    );
    const channel = await getYouTubeMyChannel(token);
    account.name = input.name.trim() || channel.title;
    updateAccountStatus(input.db, account.id, 'logged_in');
    account.status = 'logged_in';
    account.lastCheckAt = new Date().toISOString();
    return { account, loggedIn: true };
  } catch (err) {
    updateAccountStatus(input.db, account.id, 'expired');
    account.status = 'expired';
    throw err;
  }
}

/**
 * 检测 YouTube 凭证是否仍可用
 *
 * @param account 账号
 * @returns 是否可用
 */
export async function checkYouTubeSession(account: {
  profileDir: string;
}): Promise<boolean> {
  const credentials = readYouTubeCredentials(account.profileDir);
  if (!credentials) {
    return false;
  }
  try {
    const token = await getYouTubeAccessToken(
      account.profileDir,
      credentials,
      false,
    );
    await getYouTubeMyChannel(token);
    return true;
  } catch {
    return false;
  }
}
