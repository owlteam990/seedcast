/**
 * 绑定 YouTube 凭证 — 委托 @seedcast/publish-core
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import type { Account, PluginRecord } from '@seedcast/shared';
import {
  bindYouTubeAccount as bindCore,
  checkYouTubeSession as checkCore,
} from '@seedcast/publish-core';

/**
 * 创建 YouTube 账号并校验凭证
 *
 * @param input 参数
 * @returns 账号
 */
export async function bindYouTubeAccount(input: {
  db: unknown;
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
  const { account, loggedIn } = await bindCore({
    name: input.name,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    refreshToken: input.refreshToken,
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
 * 检测 YouTube 凭证是否仍可用
 *
 * @param account 账号
 * @returns 是否可用
 */
export async function checkYouTubeSession(account: {
  profileDir: string;
}): Promise<boolean> {
  return checkCore(account);
}
