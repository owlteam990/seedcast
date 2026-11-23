/**
 * 知乎登录态检测（api/v4/me + z_c0）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import {
  extractZhihuXsrf,
  getZhihuMe,
  ZHIHU_ORIGIN,
} from './client.js';

/**
 * 检测知乎 Cookie 是否仍有效
 *
 * @param account 含 profileDir
 * @returns 是否已登录
 */
export async function checkZhihuSession(account: {
  profileDir: string;
}): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: ZHIHU_ORIGIN,
      headless: true,
      run: async ({ fetch: fetchFn, cookieHeader }) => {
        const xsrf = extractZhihuXsrf(cookieHeader);
        return getZhihuMe(fetchFn, xsrf);
      },
    });
    return Boolean(info?.userId);
  } catch {
    return false;
  }
}
