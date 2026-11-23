/**
 * 微博登录态检测（头条文章编辑器）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { withProfileCookieSession } from '../http/cookieSession.js';
import { getWeiboUserConfig, WEIBO_ARTICLE_EDITOR } from './client.js';

/**
 * 检测微博账号 Cookie 是否仍有效
 *
 * @param account 含 profileDir
 * @returns 是否已登录
 */
export async function checkWeiboSession(account: {
  profileDir: string;
}): Promise<boolean> {
  try {
    const info = await withProfileCookieSession({
      profileDir: account.profileDir,
      cookieUrl: WEIBO_ARTICLE_EDITOR,
      headless: true,
      run: async ({ fetch: fetchFn, landingHtml }) =>
        getWeiboUserConfig(fetchFn, landingHtml),
    });
    return Boolean(info?.uid);
  } catch {
    return false;
  }
}
