/**
 * 绑定 X 凭证 — 委托 @seedcast/publish-core（兼容引擎签名）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import type { Account, PluginRecord } from '@seedcast/shared';
import {
  bindXAccount as bindCore,
  checkXSession as checkCore,
} from '@seedcast/publish-core';

/**
 * 创建 X 账号并校验凭证
 *
 * @param input 参数（db 保留兼容）
 * @returns 账号
 */
export async function bindXAccount(input: {
  db: unknown;
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
  const { account, loggedIn } = await bindCore({
    name: input.name,
    apiKey: input.apiKey,
    apiSecret: input.apiSecret,
    accessToken: input.accessToken,
    accessTokenSecret: input.accessTokenSecret,
    dataDir: input.dataDir,
  });
  return {
    account: {
      id: account.id,
      pluginId: account.pluginId,
      name: account.name,
      profileDir: account.profileDir,
      lastCheckAt: account.lastCheckAt,
      status: account.status,
    },
    loggedIn,
  };
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
  return checkCore(account);
}
