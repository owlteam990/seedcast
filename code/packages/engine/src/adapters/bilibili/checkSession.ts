/**
 * B站登录态检测（Web API）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { Account } from '@seedcast/shared';
import { withProfileCookieSession } from '../cookieHttp.js';
import { BILIBILI_MEMBER_ORIGIN, getBilibiliNav } from './client.js';

/**
 * 检测 B站账号 Cookie 是否仍有效
 *
 * @param account 账号
 * @returns 是否已登录
 * @author Seedcast
 * @date 2026-11-22
 */
export async function checkBilibiliSession(
  account: Account,
): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: BILIBILI_MEMBER_ORIGIN,
      run: async ({ fetch: fetchFn }) => {
        return getBilibiliNav(fetchFn);
      },
    });
    return Boolean(info?.mid);
  } catch {
    return false;
  }
}
