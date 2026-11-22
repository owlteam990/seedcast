/**
 * 微博登录态检测（头条文章编辑器）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { Account } from '@seedcast/shared';
import { withProfileCookieSession } from '../cookieHttp.js';
import { getWeiboUserConfig, WEIBO_ARTICLE_EDITOR } from './client.js';

/**
 * 检测微博账号 Cookie 是否仍有效
 *
 * @param account 账号
 * @returns 是否已登录
 * @author Seedcast
 * @date 2026-11-22
 */
export async function checkWeiboSession(account: Account): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: WEIBO_ARTICLE_EDITOR,
      run: async ({ fetch: fetchFn, landingHtml }) => {
        return getWeiboUserConfig(fetchFn, landingHtml);
      },
    });
    return Boolean(info?.uid);
  } catch {
    return false;
  }
}
