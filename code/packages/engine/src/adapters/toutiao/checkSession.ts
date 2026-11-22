/**
 * 今日头条号登录态检测（Web API + 创作台落地页兜底）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { Account } from '@seedcast/shared';
import { withProfileCookieSession } from '../cookieHttp.js';
import {
  detectToutiaoLoginFromLanding,
  getToutiaoMediaInfo,
  TOUTIAO_MP_HOME,
} from './client.js';

/**
 * 检测头条号 Cookie 是否仍有效
 *
 * @param account 账号
 * @returns 是否已登录
 * @author Seedcast
 * @date 2026-11-22
 */
export async function checkToutiaoSession(account: Account): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: TOUTIAO_MP_HOME,
      run: async ({ fetch: fetchFn, landingUrl, landingHtml }) => {
        // 1. API
        const api = await getToutiaoMediaInfo(fetchFn);
        if (api?.userId) {
          return api;
        }
        // 2. 落地页兜底（用户截图：profile_v4 已登录但 media_info 可能失败）
        return detectToutiaoLoginFromLanding(landingUrl, landingHtml);
      },
    });
    return Boolean(info?.userId);
  } catch {
    return false;
  }
}
