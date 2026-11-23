/**
 * 绑定公众号账号 — 委托 @seedcast/publish-core，兼容引擎 HTTP 签名
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import type { Account, PluginRecord } from '@seedcast/shared';
import {
  bindWechatMpAccount as bindCore,
  checkWechatMpSession,
} from '@seedcast/publish-core';
import type { SeedcastDatabase } from '../../db/database.js';

export { checkWechatMpSession };

/**
 * 创建公众号账号并校验凭证（拉一次 token）
 *
 * @param input 参数（db 保留兼容，实际由 publish-core 写同一 SQLite）
 * @returns 账号
 */
export async function bindWechatMpAccount(input: {
  db: SeedcastDatabase;
  dataDir: string;
  plugin: PluginRecord;
  name: string;
  appid: string;
  appsecret: string;
}): Promise<{ account: Account; loggedIn: boolean }> {
  if (input.plugin.manifest.id !== 'wechat-mp') {
    throw new Error('仅 wechat-mp 插件支持凭证绑定');
  }
  // db 参数保留以兼容调用方；写入走 publish-core（同一 ~/.seedcast 库）
  void input.db;
  const result = await bindCore({
    name: input.name,
    appid: input.appid,
    appsecret: input.appsecret,
    dataDir: input.dataDir,
  });
  const account: Account = {
    id: result.account.id,
    pluginId: result.account.pluginId,
    name: result.account.name,
    profileDir: result.account.profileDir,
    lastCheckAt: result.account.lastCheckAt,
    status: result.account.status,
  };
  return { account, loggedIn: result.loggedIn };
}
