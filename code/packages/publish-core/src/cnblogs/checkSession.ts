/**
 * 博客园登录态：Cookie（优先）或 MetaWeblog 令牌
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { checkCnblogsMetaWeblog } from './bind.js';
import { readCnblogsCredentials } from './credentials.js';
import { getCnblogsUserInfo } from './webClient.js';

/**
 * 检测博客园会话
 *
 * @param account 含 profileDir
 * @returns 是否已登录（园账号；发文还需开通博客）
 */
export async function checkCnblogsSession(account: {
  profileDir: string;
}): Promise<boolean> {
  // 1) Cookie：account.cnblogs.com/user/userinfo
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: 'https://www.cnblogs.com/',
      headless: true,
      run: async ({ fetch: fetchFn }) => getCnblogsUserInfo(fetchFn),
    });
    if (info?.displayName || info?.spaceUserId) {
      return true;
    }
  } catch {
    // fallthrough
  }

  // 2) MetaWeblog 凭证
  const credentials = readCnblogsCredentials(account.profileDir);
  if (credentials) {
    return checkCnblogsMetaWeblog(credentials);
  }
  return false;
}
