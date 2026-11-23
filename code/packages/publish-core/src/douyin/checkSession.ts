/**
 * 抖音登录态检测（创作者中心 Web API）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { DOUYIN_CREATOR_ORIGIN, getDouyinUserInfo } from './client.js';

/**
 * 检测抖音创作者 Cookie 是否仍有效
 *
 * @param account 含 profileDir
 * @returns 是否已登录
 */
export async function checkDouyinSession(account: {
  profileDir: string;
}): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: DOUYIN_CREATOR_ORIGIN,
      headless: true,
      run: async ({ fetch: fetchFn }) => getDouyinUserInfo(fetchFn),
    });
    return Boolean(info?.uid);
  } catch {
    return false;
  }
}
