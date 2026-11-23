/**
 * 打开平台登录页（有头 Chrome，复用账号 profile）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { closeProfileContext, openAccountContext } from './chromeProfile.js';

/** 常见平台登录 URL */
export const PLATFORM_LOGIN_URLS: Record<string, string> = {
  csdn: 'https://passport.csdn.net/login',
  zhihu: 'https://www.zhihu.com/signin',
  jianshu: 'https://www.jianshu.com/sign_in',
  xiaohongshu: 'https://creator.xiaohongshu.com/login',
  baijiahao: 'https://baijiahao.baidu.com/',
  toutiao: 'https://mp.toutiao.com/auth/page/login',
  weibo: 'https://weibo.com/login.php',
  douyin: 'https://creator.douyin.com/',
  bilibili: 'https://passport.bilibili.com/login',
  cnblogs: 'https://account.cnblogs.com/signin',
};

/**
 * 打开登录页并保持窗口（不自动关；调用方/用户手动关）
 *
 * @param input profile 与登录 URL
 * @returns 打开的 URL
 */
export async function openPlatformLogin(input: {
  profileDir: string;
  loginUrl: string;
}): Promise<{ ok: true; url: string; message: string }> {
  const context = await openAccountContext(input.profileDir, {
    headless: false,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(input.loginUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  return {
    ok: true,
    url: page.url() || input.loginUrl,
    message:
      '已打开登录页。请在浏览器完成登录后关闭窗口；勿在此进程强杀以免损坏 profile。会话检测请再跑 accounts check。',
  };
}

/**
 * 关闭某 profile 浏览器（登录完成后可选）
 *
 * @param profileDir profile 目录
 */
export async function closeLoginBrowser(profileDir: string): Promise<void> {
  await closeProfileContext(profileDir);
}
