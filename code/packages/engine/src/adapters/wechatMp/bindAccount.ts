/**
 * 绑定公众号 AppID/AppSecret 为 Seedcast 账号
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { randomUUID } from 'node:crypto';
import type { Account, PluginRecord } from '@seedcast/shared';
import type { SeedcastDatabase } from '../../db/database.js';
import {
  createAccount,
  updateAccountStatus,
} from '../../db/accounts.js';
import { resolveProfileDir } from '../../session/pool.js';
import { getAccessToken } from './client.js';
import {
  looksLikeWechatAppId,
  readWechatCredentials,
  writeWechatCredentials,
} from './credentials.js';

/**
 * 创建公众号账号并校验凭证（拉一次 token）
 *
 * @param input 参数
 * @returns 账号
 * @author Seedcast
 * @date 2026-11-21
 */
export async function bindWechatMpAccount(input: {
  db: SeedcastDatabase;
  dataDir: string;
  plugin: PluginRecord;
  name: string;
  appid: string;
  appsecret: string;
}): Promise<{ account: Account; loggedIn: boolean }> {
  const { db, dataDir, plugin, name } = input;
  const appid = input.appid.trim();
  const appsecret = input.appsecret.trim();

  if (!looksLikeWechatAppId(appid)) {
    throw new Error('AppID 格式不正确（应为 wx 开头共 18 位）');
  }
  if (!appsecret || appsecret.length < 16) {
    throw new Error('AppSecret 无效');
  }
  if (plugin.manifest.id !== 'wechat-mp') {
    throw new Error('仅 wechat-mp 插件支持凭证绑定');
  }

  const accountId = randomUUID();
  const profileDir = resolveProfileDir(dataDir, plugin.manifest.id, accountId);
  writeWechatCredentials(profileDir, { appid, appsecret });

  const account = createAccount(db, {
    id: accountId,
    pluginId: plugin.manifest.id,
    name: name.trim() || `公众号-${appid.slice(0, 8)}`,
    profileDir,
  });

  try {
    await getAccessToken(profileDir, { appid, appsecret }, true);
    updateAccountStatus(db, account.id, 'logged_in');
    account.status = 'logged_in';
    account.lastCheckAt = new Date().toISOString();
    return { account, loggedIn: true };
  } catch (err) {
    updateAccountStatus(db, account.id, 'expired');
    account.status = 'expired';
    throw err;
  }
}

/**
 * 检测公众号凭证是否仍可用
 *
 * @param account 账号
 * @returns 是否可用
 * @author Seedcast
 * @date 2026-11-21
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
