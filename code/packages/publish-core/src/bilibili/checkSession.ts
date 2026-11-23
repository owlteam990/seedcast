/**
 * B站登录态检测（Web API）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { BILIBILI_MEMBER_ORIGIN, getBilibiliNav } from './client.js';

/**
 * 检测 B站账号 Cookie 是否仍有效
 *
 * @param account 含 profileDir
 * @returns 是否已登录
 */
export async function checkBilibiliSession(account: {
  profileDir: string;
}): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: BILIBILI_MEMBER_ORIGIN,
      headless: true,
      run: async ({ fetch: fetchFn }) => getBilibiliNav(fetchFn),
    });
    return Boolean(info?.mid);
  } catch {
    return false;
  }
}
