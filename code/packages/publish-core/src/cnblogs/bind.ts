/**
 * 绑定博客园 MetaWeblog 凭证
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
import { getCnblogsUsersBlogs } from './client.js';
import { writeCnblogsCredentials } from './credentials.js';

export const CNBLOGS_PLUGIN_ID = 'cnblogs';

/**
 * 创建博客园账号并校验令牌
 *
 * @param input 参数
 * @returns 账号与是否校验通过
 */
export async function bindCnblogsAccount(input: {
  name: string;
  username: string;
  token: string;
  blogName: string;
  dataDir?: string;
}): Promise<{ account: AccountRecord; loggedIn: boolean }> {
  const dataDir = input.dataDir ?? getDefaultDataDir();
  const username = input.username.trim();
  const token = input.token.trim();
  const blogName = input.blogName.trim();
  if (!username || !token || !blogName) {
    throw new Error(
      '请填写 username、token、blogName（在 i.cnblogs.com/settings 启用客户端访问）',
    );
  }

  const accountId = randomUUID();
  const profileDir = resolveProfileDir(dataDir, CNBLOGS_PLUGIN_ID, accountId);
  writeCnblogsCredentials(profileDir, { username, token, blogName });

  let displayName = input.name.trim() || blogName;
  const account = createAccount(
    {
      id: accountId,
      pluginId: CNBLOGS_PLUGIN_ID,
      name: displayName,
      profileDir,
    },
    dataDir,
  );

  try {
    const blogs = await getCnblogsUsersBlogs({ username, token, blogName });
    const hit =
      blogs.find((b) => {
        return (
          b.blogName === blogName ||
          b.url.includes(`/${blogName}`) ||
          b.blogid === blogName
        );
      }) || blogs[0];
    if (hit?.blogName) {
      displayName = input.name.trim() || hit.blogName;
    }
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
 * 检测 MetaWeblog 令牌是否可用
 *
 * @param credentials 凭证
 * @returns 是否可用
 */
export async function checkCnblogsMetaWeblog(credentials: {
  username: string;
  token: string;
  blogName: string;
}): Promise<boolean> {
  try {
    const blogs = await getCnblogsUsersBlogs(credentials);
    return blogs.length > 0;
  } catch {
    return false;
  }
}
