/**
 * CSDN 登录态检测
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { CSDN_EDITOR_ORIGIN, getCsdnBaseInfo } from './client.js';

/**
 * 检测 CSDN Cookie 是否有效
 *
 * @param account 含 profileDir
 * @returns 是否已登录
 */
export async function checkCsdnSession(account: {
  profileDir: string;
}): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: CSDN_EDITOR_ORIGIN,
      headless: true,
      run: async ({ fetch: fetchFn }) => getCsdnBaseInfo(fetchFn),
    });
    return Boolean(info?.name);
  } catch {
    return false;
  }
}
