/**
 * CSDN 登录态检测（Web API）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { Account } from '@seedcast/shared';
import { withProfileCookieSession } from '../cookieHttp.js';
import { CSDN_EDITOR_ORIGIN, getCsdnBaseInfo } from './client.js';

/**
 * 检测 CSDN 账号 Cookie 是否仍有效
 *
 * @param account 账号
 * @returns 是否已登录
 * @author Seedcast
 * @date 2026-11-22
 */
export async function checkCsdnSession(account: Account): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: CSDN_EDITOR_ORIGIN,
      run: async ({ fetch: fetchFn }) => {
        return getCsdnBaseInfo(fetchFn);
      },
    });
    return Boolean(info?.name);
  } catch {
    return false;
  }
}
