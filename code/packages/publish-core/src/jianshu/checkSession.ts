/**
 * 简书登录态检测
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { getJianshuBasicSettings, JIANSHU_ORIGIN } from './client.js';

/**
 * 检测简书 Cookie 是否有效
 *
 * @param account 含 profileDir
 * @returns 是否已登录
 */
export async function checkJianshuSession(account: {
  profileDir: string;
}): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: JIANSHU_ORIGIN,
      headless: true,
      run: async ({ fetch: fetchFn }) => getJianshuBasicSettings(fetchFn),
    });
    return Boolean(info?.nickname);
  } catch {
    return false;
  }
}
