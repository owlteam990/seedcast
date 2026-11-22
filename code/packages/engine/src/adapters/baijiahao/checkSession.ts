/**
 * 百家号登录态检测（Web API）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { Account } from '@seedcast/shared';
import { withProfileCookieSession } from '../cookieHttp.js';
import { BAIJIAHAO_ORIGIN, getBaijiahaoAppInfo } from './client.js';

/**
 * 检测百家号 Cookie 是否仍有效
 *
 * @param account 账号
 * @returns 是否已登录
 * @author Seedcast
 * @date 2026-11-22
 */
export async function checkBaijiahaoSession(
  account: Account,
): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: BAIJIAHAO_ORIGIN,
      run: async ({ fetch: fetchFn }) => {
        return getBaijiahaoAppInfo(fetchFn);
      },
    });
    return Boolean(info?.userId);
  } catch {
    return false;
  }
}
