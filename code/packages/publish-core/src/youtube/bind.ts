/**
 * 绑定 YouTube OAuth 凭证
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
import { getYouTubeAccessToken, getYouTubeMyChannel } from './client.js';
import {
  readYouTubeCredentials,
  writeYouTubeCredentials,
} from './credentials.js';

export const YOUTUBE_PLUGIN_ID = 'youtube';

/**
 * 创建 YouTube 账号并校验凭证
 *
 * @param input 参数
 * @returns 账号与是否校验通过
 */
export async function bindYouTubeAccount(input: {
  name: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  dataDir?: string;
}): Promise<{ account: AccountRecord; loggedIn: boolean }> {
  const dataDir = input.dataDir ?? getDefaultDataDir();
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  const refreshToken = input.refreshToken.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('请填写 Client ID / Client Secret / Refresh Token');
  }

  const accountId = randomUUID();
  const profileDir = resolveProfileDir(dataDir, YOUTUBE_PLUGIN_ID, accountId);
  writeYouTubeCredentials(profileDir, {
    clientId,
    clientSecret,
    refreshToken,
  });

  const account = createAccount(
    {
      id: accountId,
      pluginId: YOUTUBE_PLUGIN_ID,
      name: input.name.trim() || 'YouTube',
      profileDir,
    },
    dataDir,
  );

  try {
    const token = await getYouTubeAccessToken(
      profileDir,
      { clientId, clientSecret, refreshToken },
      true,
    );
    const channel = await getYouTubeMyChannel(token);
    account.name = input.name.trim() || channel.title;
    updateAccountStatus(account.id, 'logged_in', dataDir);
    account.status = 'logged_in';
    account.lastCheckAt = new Date().toISOString();
    return { account, loggedIn: true };
  } catch (err) {
    updateAccountStatus(account.id, 'expired', dataDir);
    account.status = 'expired';
    throw err;
  }
}

/**
 * 检测 YouTube 凭证是否仍可用
 *
 * @param account 含 profileDir
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
