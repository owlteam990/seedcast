/**
 * 小红书登录态检测（创作者中心 Web API）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { getXhsPersonalInfo, XHS_CREATOR_HOME } from './client.js';

/**
 * 检测小红书创作者 Cookie 是否仍有效
 *
 * @param account 含 profileDir
 * @returns 是否已登录
 */
export async function checkXhsSession(account: {
  profileDir: string;
}): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: XHS_CREATOR_HOME,
      headless: true,
      run: async ({ fetch: fetchFn }) => getXhsPersonalInfo(fetchFn),
    });
    return Boolean(info?.userId);
  } catch {
    return false;
  }
}
