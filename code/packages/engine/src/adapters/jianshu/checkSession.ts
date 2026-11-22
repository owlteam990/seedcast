/**
 * 简书登录态检测（Web API）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { Account } from '@seedcast/shared';
import { withProfileCookieSession } from '../cookieHttp.js';
import { getJianshuBasicSettings, JIANSHU_ORIGIN } from './client.js';

/**
 * 检测简书账号 Cookie 是否仍有效
 *
 * @param account 账号
 * @returns 是否已登录
 * @author Seedcast
 * @date 2026-11-22
 */
export async function checkJianshuSession(account: Account): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: JIANSHU_ORIGIN,
      run: async ({ fetch: fetchFn }) => {
        return getJianshuBasicSettings(fetchFn);
      },
    });
    return Boolean(info?.nickname);
  } catch {
    return false;
  }
}
