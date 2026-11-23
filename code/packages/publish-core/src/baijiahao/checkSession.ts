/**
 * 百家号登录态检测
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { BAIJIAHAO_ORIGIN, getBaijiahaoAppInfo } from './client.js';

/**
 * 检测百家号 Cookie 是否有效
 *
 * @param account 含 profileDir
 * @returns 是否已登录
 */
export async function checkBaijiahaoSession(account: {
  profileDir: string;
}): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: BAIJIAHAO_ORIGIN,
      headless: true,
      run: async ({ fetch: fetchFn }) => getBaijiahaoAppInfo(fetchFn),
    });
    return Boolean(info?.userId);
  } catch {
    return false;
  }
}
