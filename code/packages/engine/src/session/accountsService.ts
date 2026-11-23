/**
 * 账号登录与会话检测业务
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { randomUUID } from 'node:crypto';
import { rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Account, PluginRecord } from '@seedcast/shared';
import { SeedcastErrorCode } from '@seedcast/shared';
import type { SeedcastDatabase } from '../db/database.js';
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccountStatus,
} from '../db/accounts.js';
import {
  checkSessionOnPage,
  closeProfileContext,
  openAccountContext,
  resolveProfileDir,
  waitForLogin,
} from './pool.js';

/**
 * 读取插件 selectors.json
 *
 * @param pluginDir 插件目录
 * @returns 选择器表
 */
function loadSelectors(pluginDir: string): Record<string, string> {
  const path = join(pluginDir, 'selectors.json');
  if (!existsSync(path)) {
    return {};
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
}

/**
 * 将 sessionCheck.loggedInSelector 键解析为 CSS
 *
 * @param plugin 插件
 * @returns CSS 选择器
 */
function resolveLoggedInCss(plugin: PluginRecord): string {
  const key = plugin.manifest.platform.sessionCheck?.loggedInSelector;
  if (!key) {
    throw new Error('插件未声明 sessionCheck.loggedInSelector');
  }
  const selectors = loadSelectors(plugin.dir);
  const css = selectors[key] ?? key;
  return css;
}

/**
 * 添加账号并打开登录浏览器，等待扫码/登录成功
 *
 * @param input 依赖与参数
 * @returns 账号与是否登录成功
 * @author Seedcast
 * @date 2026-11-21
 */
export async function loginAccount(input: {
  db: SeedcastDatabase;
  dataDir: string;
  plugin: PluginRecord;
  name: string;
  timeoutMs?: number;
  /** 请求取消 / 客户端断开时中止等待 */
  signal?: AbortSignal;
}): Promise<{
  account: Account;
  loggedIn: boolean;
  outcome: 'logged_in' | 'timeout' | 'cancelled' | 'browser_closed';
}> {
  const { db, dataDir, plugin, name, timeoutMs } = input;

  // 1. 预分配 accountId 与 profile 目录（保持一一对应）
  const accountId = randomUUID();
  const profileDir = resolveProfileDir(dataDir, plugin.manifest.id, accountId);
  const account = createAccount(db, {
    id: accountId,
    pluginId: plugin.manifest.id,
    name,
    profileDir,
  });

  const check = plugin.manifest.platform.sessionCheck;
  const loginUrl = plugin.manifest.platform.loginUrl;
  const checkUrl = check?.url ?? plugin.manifest.platform.home;

  let loggedInCss: string;
  try {
    loggedInCss = resolveLoggedInCss(plugin);
  } catch (err) {
    updateAccountStatus(db, account.id, 'unknown');
    throw err;
  }

  // 2. mock 特例：直接打开 fixture（已含 #logged-in）
  const fixturePath = join(plugin.dir, 'fixtures/article.html');
  const effectiveLoginUrl =
    plugin.manifest.id === 'mock'
      ? pathToFileURL(fixturePath).href
      : loginUrl;
  const effectiveCheckUrl =
    plugin.manifest.id === 'mock' ? effectiveLoginUrl : checkUrl;

  const isMock = plugin.manifest.id === 'mock';
  const outcome = await waitForLogin({
    profileDir,
    loginUrl: effectiveLoginUrl,
    checkUrl: effectiveCheckUrl,
    loggedInCss,
    loggedInCookie: check?.loggedInCookie,
    timeoutMs: timeoutMs ?? (isMock ? 30_000 : 300_000),
    // mock fixture 可无头跑通；真实平台需有头以便扫码
    headless: isMock,
    signal: input.signal,
  });

  let loggedIn = outcome.status === 'logged_in';
  let finalOutcome = outcome.status;

  // Cookie/Web API 平台：Playwright 误判后用接口复核，避免「秒关窗 + 假 logged_in」
  if (loggedIn) {
    const ok = await verifyCookieApiSession(plugin.manifest.id, account);
    if (ok === false) {
      loggedIn = false;
      finalOutcome = 'timeout';
    }
  }

  // 关闭窗口 / 取消 / 超时 → 标记 expired，并释放 profile 供检测/删除
  updateAccountStatus(db, account.id, loggedIn ? 'logged_in' : 'expired');
  account.status = loggedIn ? 'logged_in' : 'expired';
  account.lastCheckAt = new Date().toISOString();
  return {
    account,
    loggedIn,
    outcome: finalOutcome,
  };
}

/**
 * Cookie Web API 平台登录后复核（非此类平台返回 null）
 *
 * @param pluginId 插件 ID
 * @param account 账号
 * @returns true/false；不适用返回 null
 */
async function verifyCookieApiSession(
  pluginId: string,
  account: Account,
): Promise<boolean | null> {
  if (pluginId === 'csdn') {
    const { checkCsdnSession } = await import(
      '../adapters/csdn/checkSession.js'
    );
    return checkCsdnSession(account);
  }
  if (pluginId === 'jianshu') {
    const { checkJianshuSession } = await import(
      '../adapters/jianshu/checkSession.js'
    );
    return checkJianshuSession(account);
  }
  if (pluginId === 'baijiahao') {
    const { checkBaijiahaoSession } = await import(
      '../adapters/baijiahao/checkSession.js'
    );
    return checkBaijiahaoSession(account);
  }
  if (pluginId === 'toutiao') {
    const { checkToutiaoSession } = await import(
      '../adapters/toutiao/checkSession.js'
    );
    return checkToutiaoSession(account);
  }
  if (pluginId === 'weibo') {
    const { checkWeiboSession } = await import(
      '../adapters/weibo/checkSession.js'
    );
    return checkWeiboSession(account);
  }
  if (pluginId === 'bilibili') {
    const { checkBilibiliSession } = await import(
      '../adapters/bilibili/checkSession.js'
    );
    return checkBilibiliSession(account);
  }
  if (pluginId === 'douyin') {
    const { checkDouyinSession } = await import(
      '../adapters/douyin/checkSession.js'
    );
    return checkDouyinSession(account);
  }
  if (pluginId === 'xiaohongshu') {
    const { checkXhsSession } = await import(
      '../adapters/xiaohongshu/checkSession.js'
    );
    return checkXhsSession(account);
  }
  return null;
}

/**
 * 检测已有账号登录态
 *
 * @param input 依赖
 * @returns 是否已登录
 * @author Seedcast
 * @date 2026-11-21
 */
export async function checkAccountSession(input: {
  db: SeedcastDatabase;
  account: Account;
  plugin: PluginRecord;
}): Promise<boolean> {
  const { db, account, plugin } = input;

  // 官方 API 凭证型：不走 Chrome
  if (plugin.manifest.id === 'wechat-mp') {
    const { checkWechatMpSession } = await import(
      '../adapters/wechatMp/bindAccount.js'
    );
    const ok = await checkWechatMpSession(account);
    updateAccountStatus(db, account.id, ok ? 'logged_in' : 'expired');
    return ok;
  }
  if (plugin.manifest.id === 'x') {
    const { checkXSession } = await import('../adapters/x/bindAccount.js');
    const ok = await checkXSession(account);
    updateAccountStatus(db, account.id, ok ? 'logged_in' : 'expired');
    return ok;
  }
  if (plugin.manifest.id === 'youtube') {
    const { checkYouTubeSession } = await import(
      '../adapters/youtube/bindAccount.js'
    );
    const ok = await checkYouTubeSession(account);
    updateAccountStatus(db, account.id, ok ? 'logged_in' : 'expired');
    return ok;
  }

  // Cookie + Web API 平台
  const cookieApiOk = await verifyCookieApiSession(
    plugin.manifest.id,
    account,
  );
  if (cookieApiOk !== null) {
    updateAccountStatus(
      db,
      account.id,
      cookieApiOk ? 'logged_in' : 'expired',
    );
    return cookieApiOk;
  }

  const check = plugin.manifest.platform.sessionCheck;
  if (!check) {
    updateAccountStatus(db, account.id, 'unknown');
    return false;
  }

  const loggedInCss = resolveLoggedInCss(plugin);
  const context = await openAccountContext(account.profileDir, {
    headless: true,
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    // 覆盖 manifest 中的键为真实 CSS 再检测
    const manifest = {
      ...plugin.manifest,
      platform: {
        ...plugin.manifest.platform,
        sessionCheck: {
          ...check,
          loggedInSelector: loggedInCss,
        },
      },
    };
    const ok = await checkSessionOnPage(page, manifest);
    updateAccountStatus(db, account.id, ok ? 'logged_in' : 'expired');
    return ok;
  } finally {
    await context.close();
  }
}

/**
 * 用已登录账号的 Chrome profile 打开平台页面（有头，供人工查看）
 * 窗口保持打开；用户关闭浏览器后自动释放。再次点击会先关掉旧窗口。
 *
 * @param input 账号与插件
 * @returns 实际打开的 URL
 * @author Seedcast
 * @date 2026-11-21
 */
export async function openAccountBrowser(input: {
  account: Account;
  plugin: PluginRecord;
  /** 可选覆盖 URL；默认平台 home */
  url?: string;
}): Promise<{ url: string }> {
  const { account, plugin, url } = input;

  // 1. 解析目标页（openAccountContext 会关掉同 profile 旧窗口）
  let targetUrl = url?.trim() || plugin.manifest.platform.home;
  if (plugin.manifest.id === 'mock') {
    targetUrl =
      url?.trim() ||
      pathToFileURL(join(plugin.dir, 'fixtures/article.html')).href;
  }

  // 2. 有头打开 persistent profile（登记在会话池，供发布前互斥释放）
  const context = await openAccountContext(account.profileDir, {
    headless: false,
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    return { url: page.url() || targetUrl };
  } catch (err) {
    await closeProfileContext(account.profileDir);
    throw err;
  }
}

/**
 * 删除账号并清理 profile 目录
 *
 * @param input 依赖
 * @returns 是否删除
 * @author Seedcast
 * @date 2026-11-21
 */
export async function removeAccount(input: {
  db: SeedcastDatabase;
  accountId: string;
}): Promise<boolean> {
  const account = getAccount(input.db, input.accountId);
  if (!account) {
    return false;
  }

  // 先关掉可能打开的查看/发布窗口，再删目录
  await closeProfileContext(account.profileDir);

  deleteAccount(input.db, account.id);
  if (existsSync(account.profileDir)) {
    rmSync(account.profileDir, { recursive: true, force: true });
  }
  return true;
}

/**
 * 列出账号（透传）
 *
 * @param db 数据库
 * @param pluginId 可选过滤
 * @returns 账号列表
 * @author Seedcast
 * @date 2026-11-21
 */
export function listAllAccounts(
  db: SeedcastDatabase,
  pluginId?: string,
): Account[] {
  return listAccounts(db, pluginId);
}

/**
 * 统一错误码导出（供路由使用）
 */
export { SeedcastErrorCode };
