/**
 * 今日头条号登录态检测（Web API + 创作台落地页兜底）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import {
  detectToutiaoLoginFromLanding,
  getToutiaoMediaInfo,
  TOUTIAO_MP_HOME,
} from './client.js';

/**
 * 检测头条号 Cookie 是否仍有效
 *
 * @param account 含 profileDir
 * @returns 是否已登录
 */
export async function checkToutiaoSession(account: {
  profileDir: string;
}): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: TOUTIAO_MP_HOME,
      headless: true,
      run: async ({ fetch: fetchFn, landingUrl, landingHtml }) => {
        // 1. API
        const api = await getToutiaoMediaInfo(fetchFn);
        if (api?.userId) {
          return api;
        }
        // 2. 落地页兜底
        return detectToutiaoLoginFromLanding(landingUrl, landingHtml);
      },
    });
    return Boolean(info?.userId);
  } catch {
    return false;
  }
}
