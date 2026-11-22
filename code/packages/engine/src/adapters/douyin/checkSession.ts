/**
 * 抖音登录态检测（创作者中心 Web API）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { Account } from '@seedcast/shared';
import { withProfileCookieSession } from '../cookieHttp.js';
import { DOUYIN_CREATOR_ORIGIN, getDouyinUserInfo } from './client.js';

/**
 * 检测抖音创作者 Cookie 是否仍有效
 *
 * @param account 账号
 * @returns 是否已登录
 * @author Seedcast
 * @date 2026-11-22
 */
export async function checkDouyinSession(account: Account): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: DOUYIN_CREATOR_ORIGIN,
      run: async ({ fetch: fetchFn }) => {
        return getDouyinUserInfo(fetchFn);
      },
    });
    return Boolean(info?.uid);
  } catch {
    return false;
  }
}
