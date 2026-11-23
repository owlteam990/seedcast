/**
 * 绑定公众号 AppID/AppSecret
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { randomUUID } from 'node:crypto';
import {
  createAccount,
  getAccount,
  updateAccount,
  updateAccountStatus,
  type AccountRecord,
} from '../db/accounts.js';
import { getDefaultDataDir, resolveProfileDir } from '../paths.js';
import { getAccessToken } from './client.js';
import {
  looksLikeWechatAppId,
  readWechatCredentials,
  writeWechatCredentials,
} from './credentials.js';

export const WECHAT_PLUGIN_ID = 'wechat-mp';

/**
 * 创建公众号账号并校验凭证
 *
 * @param input 参数
 * @returns 账号与是否校验通过
 */
export async function bindWechatMpAccount(input: {
  name: string;
  appid: string;
  appsecret: string;
  dataDir?: string;
}): Promise<{ account: AccountRecord; loggedIn: boolean }> {
  const dataDir = input.dataDir ?? getDefaultDataDir();
  const appid = input.appid.trim();
  const appsecret = input.appsecret.trim();

  if (!looksLikeWechatAppId(appid)) {
    throw new Error('AppID 格式不正确（应为 wx 开头共 18 位）');
  }
  if (!appsecret || appsecret.length < 16) {
    throw new Error('AppSecret 无效');
  }

  const accountId = randomUUID();
  const profileDir = resolveProfileDir(dataDir, WECHAT_PLUGIN_ID, accountId);
  writeWechatCredentials(profileDir, { appid, appsecret });

  const account = createAccount(
    {
      id: accountId,
      pluginId: WECHAT_PLUGIN_ID,
      name: input.name.trim() || `公众号-${appid.slice(0, 8)}`,
      profileDir,
    },
    dataDir,
  );

  try {
    await getAccessToken(profileDir, { appid, appsecret }, true);
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
 * 检测公众号凭证是否仍可用
 *
 * @param account 含 profileDir
 * @returns 是否可用
 */
export async function checkWechatMpSession(account: {
  profileDir: string;
}): Promise<boolean> {
  const credentials = readWechatCredentials(account.profileDir);
  if (!credentials) {
    return false;
  }
  try {
    await getAccessToken(account.profileDir, credentials, false);
    return true;
  } catch {
    return false;
  }
}

/**
 * 更新已有公众号账号的凭证（可同时改名）
 *
 * @param input 账号 ID 与新凭证
 * @returns 更新后账号
 */
export async function updateWechatMpCredentials(input: {
  accountId: string;
  appid: string;
  appsecret: string;
  name?: string;
  dataDir?: string;
}): Promise<{ account: AccountRecord; loggedIn: boolean }> {
  const dataDir = input.dataDir ?? getDefaultDataDir();
  const existing = getAccount(input.accountId, dataDir);
  if (!existing || existing.pluginId !== WECHAT_PLUGIN_ID) {
    throw new Error(`公众号账号不存在: ${input.accountId}`);
  }
  const appid = input.appid.trim();
  const appsecret = input.appsecret.trim();
  if (!looksLikeWechatAppId(appid)) {
    throw new Error('AppID 格式不正确（应为 wx 开头共 18 位）');
  }
  if (!appsecret || appsecret.length < 16) {
    throw new Error('AppSecret 无效');
  }
  writeWechatCredentials(existing.profileDir, { appid, appsecret });
  let account = existing;
  if (input.name?.trim()) {
    account = updateAccount(existing.id, { name: input.name.trim() }, dataDir);
  }
  try {
    await getAccessToken(existing.profileDir, { appid, appsecret }, true);
    updateAccountStatus(existing.id, 'logged_in', dataDir);
    account = {
      ...account,
      status: 'logged_in',
      lastCheckAt: new Date().toISOString(),
    };
    return { account, loggedIn: true };
  } catch (err) {
    updateAccountStatus(existing.id, 'expired', dataDir);
    throw err;
  }
}
