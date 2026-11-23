/**
 * 账号 Chrome persistent context 会话池
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  chromium,
  type BrowserContext,
  type Page,
} from 'playwright';
import type { PluginManifest } from '@seedcast/shared';
import {
  isLoggedInMarkerVisible,
  waitForLoggedInMarker,
} from '../flow/locate.js';

/** 按 profile 目录登记的已打开 context（同目录同时只能有一个 Chrome） */
const contextsByProfile = new Map<string, BrowserContext>();

/**
 * 清除 Chromium Singleton 锁文件（进程已死但锁残留时）
 *
 * @param profileDir profile 目录
 */
function clearChromiumSingletonLocks(profileDir: string): void {
  for (const name of [
    'SingletonLock',
    'SingletonSocket',
    'SingletonCookie',
  ]) {
    const path = join(profileDir, name);
    try {
      unlinkSync(path);
    } catch {
      // 不存在或无权：忽略
    }
  }
}

/**
 * 查找仍占用该 user-data-dir 的 Chrome/Chromium 进程
 *
 * @param profileDir profile 绝对路径
 * @returns PID 列表
 */
function findChromePidsUsingProfile(profileDir: string): number[] {
  try {
    const out = execFileSync('ps', ['-ax', '-o', 'pid=,command='], {
      encoding: 'utf8',
    });
    const pids: number[] = [];
    for (const line of out.split('\n')) {
      if (!line.includes(profileDir)) {
        continue;
      }
      // 只杀主进程；Helper 会随主进程退出
      if (
        !/\/MacOS\/Google Chrome |\/chrome$|\/chromium/i.test(line) ||
        /Helper \(/.test(line)
      ) {
        continue;
      }
      const pid = Number.parseInt(line.trim().split(/\s+/)[0] ?? '', 10);
      if (Number.isFinite(pid) && pid > 0 && pid !== process.pid) {
        pids.push(pid);
      }
    }
    return [...new Set(pids)];
  } catch {
    return [];
  }
}

/**
 * 结束占用 profile 的孤儿 Chrome（引擎重启后窗口仍在等场景）
 *
 * @param profileDir profile 目录
 */
async function killOrphanChromeForProfile(
  profileDir: string,
): Promise<void> {
  const pids = findChromePidsUsingProfile(profileDir);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }
  if (pids.length === 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 800);
  });
  for (const pid of pids) {
    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
    } catch {
      // 已退出
    }
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 400);
  });
  clearChromiumSingletonLocks(profileDir);
}

/**
 * 关闭指定 profile 上已登记的 Playwright context
 *
 * @param profileDir profile 绝对路径
 * @author Seedcast
 * @date 2026-11-21
 */
export async function closeProfileContext(
  profileDir: string,
): Promise<void> {
  const existing = contextsByProfile.get(profileDir);
  if (!existing) {
    return;
  }
  contextsByProfile.delete(profileDir);
  await existing.close().catch(() => {
    // ignore
  });
}

/**
 * 打开（或复用前先关闭）账号专属 persistent context。
 * 同一 profile 同时只能有一个实例；发布/打开/检测会互斥释放。
 *
 * @param profileDir profile 绝对路径
 * @param options 启动选项
 * @returns BrowserContext
 * @author Seedcast
 * @date 2026-11-21
 */
export async function openAccountContext(
  profileDir: string,
  options?: { headless?: boolean },
): Promise<BrowserContext> {
  mkdirSync(profileDir, { recursive: true });

  // 1. 关闭本进程已管的同 profile 窗口（例如「打开」后去发布）
  await closeProfileContext(profileDir);

  // 2. 若仍有孤儿 Chrome 占着目录（引擎重启后常见），先结束再启
  const orphans = findChromePidsUsingProfile(profileDir);
  if (orphans.length > 0) {
    await killOrphanChromeForProfile(profileDir);
  } else {
    clearChromiumSingletonLocks(profileDir);
  }

  const launch = async (): Promise<BrowserContext> => {
    return chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: options?.headless ?? false,
      viewport: { width: 1280, height: 800 },
      // 桌面环境不需要 sandbox 关闭；避免黄条告警与部分站点异常
      ignoreDefaultArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  };

  let context: BrowserContext;
  try {
    context = await launch();
  } catch (err) {
    // 2. 常见：引擎重启后旧 Chrome 仍占 profile → 杀孤儿再试一次
    const msg = err instanceof Error ? err.message : String(err);
    const profileBusy =
      /ProcessSingleton|user data directory is already in use|正在现有的浏览器会话中打开|Target page, context or browser has been closed/i.test(
        msg,
      );
    if (!profileBusy) {
      throw err;
    }
    await killOrphanChromeForProfile(profileDir);
    clearChromiumSingletonLocks(profileDir);
    context = await launch();
  }

  contextsByProfile.set(profileDir, context);
  context.on('close', () => {
    if (contextsByProfile.get(profileDir) === context) {
      contextsByProfile.delete(profileDir);
    }
  });
  return context;
}

/**
 * 解析账号 profile 目录
 *
 * @param dataDir 数据根
 * @param pluginId 插件 ID
 * @param accountId 账号 ID
 * @returns 绝对路径
 * @author Seedcast
 * @date 2026-11-21
 */
export function resolveProfileDir(
  dataDir: string,
  pluginId: string,
  accountId: string,
): string {
  return join(dataDir, 'profiles', pluginId, accountId);
}

/**
 * 解析登录态 Cookie 名列表（支持逗号分隔多个备选）
 *
 * @param raw 原始声明
 * @returns Cookie 名列表
 */
function parseLoggedInCookieNames(raw?: string): string[] {
  if (!raw || !raw.trim()) {
    return [];
  }
  return raw
    .split(',')
    .map((s) => {
      return s.trim();
    })
    .filter((s) => {
      return s.length > 0;
    });
}

/**
 * 当前 URL 是否仍像登录页
 *
 * @param page 页面
 * @param loginUrl 登录 URL
 * @returns 是否仍在登录相关页
 */
function looksLikeLoginPage(page: Page, loginUrl: string): boolean {
  const current = page.url();
  try {
    const login = new URL(loginUrl);
    const cur = new URL(current);
    // passport.* 整站视为登录域（CSDN 登录完成前常停在此）
    if (/(^|\.)passport\./i.test(cur.hostname)) {
      return true;
    }
    if (
      cur.pathname.includes('signin') ||
      cur.pathname.includes('login') ||
      cur.pathname.includes('register')
    ) {
      return true;
    }
    // 仅当 loginUrl 指向具体路径时，才用「同 host + 路径前缀」
    // 避免 loginPath="/" 或「整站 hostname」把已登录页误判成登录页
    const loginPath = login.pathname.replace(/\/+$/, '') || '/';
    if (
      loginPath !== '/' &&
      cur.hostname === login.hostname &&
      cur.pathname.startsWith(loginPath)
    ) {
      return true;
    }
  } catch {
    // ignore
  }
  return /signin|login|passport|register/i.test(current);
}

/**
 * 判断错误是否为浏览器/页面已关闭
 *
 * @param err 错误
 * @returns 是否已关闭
 */
function isBrowserClosedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Target page, context or browser has been closed|has been closed|Connection closed|Browser closed/i.test(
    msg,
  );
}

/**
 * 根据插件 sessionCheck 检测是否已登录
 *
 * @param page 页面
 * @param manifest 插件 manifest
 * @returns 是否已登录
 * @author Seedcast
 * @date 2026-11-21
 */
export async function checkSessionOnPage(
  page: Page,
  manifest: PluginManifest,
): Promise<boolean> {
  const check = manifest.platform.sessionCheck;
  if (!check) {
    // 无声明时无法判定，视为未知→false（调用方标 unknown/expired）
    return false;
  }

  // selectors 键需映射为真实 CSS：调用方应传入解析后的表达式（支持 ` | `）
  const timeout = check.timeoutMs ?? 12000;
  try {
    await page.goto(check.url, {
      waitUntil: 'domcontentloaded',
      timeout: Math.max(timeout, 20000),
    });

    // 1. Cookie 优先（知乎 z_c0 等；支持逗号分隔多个备选名）
    const cookieNames = parseLoggedInCookieNames(check.loggedInCookie);
    if (cookieNames.length > 0) {
      const cookies = await page.context().cookies(check.url);
      const hit = cookies.find((c) => {
        return (
          cookieNames.includes(c.name) &&
          typeof c.value === 'string' &&
          c.value.trim().length > 0
        );
      });
      if (hit) {
        return true;
      }
      const all = await page.context().cookies();
      if (
        all.some((c) => {
          return (
            cookieNames.includes(c.name) &&
            typeof c.value === 'string' &&
            c.value.trim().length > 0
          );
        })
      ) {
        return true;
      }
    }

    // 2. DOM 登录态标记（支持备选选择器）
    return waitForLoggedInMarker(page, check.loggedInSelector, timeout);
  } catch {
    return false;
  }
}

/**
 * 登录等待结果
 */
export type WaitForLoginOutcome =
  | { status: 'logged_in' }
  | { status: 'timeout' }
  | { status: 'cancelled' }
  | { status: 'browser_closed' };

/**
 * 打开登录页并等待用户扫码/登录成功。
 * - 轮询期间禁止反复 goto，否则二维码页会被刷掉
 * - 用户关闭浏览器或外部 AbortSignal 时立即结束，释放 profile 锁
 *
 * @param input 参数
 * @returns 等待结果
 * @author Seedcast
 * @date 2026-11-21
 */
export async function waitForLogin(input: {
  profileDir: string;
  loginUrl: string;
  loggedInCss: string;
  checkUrl: string;
  /** 可选：登录态 Cookie 名（存在且非空即视为已登录） */
  loggedInCookie?: string;
  timeoutMs?: number;
  pollMs?: number;
  headless?: boolean;
  signal?: AbortSignal;
}): Promise<WaitForLoginOutcome> {
  const timeoutMs = input.timeoutMs ?? 5 * 60 * 1000;
  const pollMs = input.pollMs ?? 1500;

  if (input.signal?.aborted) {
    return { status: 'cancelled' };
  }

  const context = await openAccountContext(input.profileDir, {
    headless: input.headless ?? false,
  });

  let browserClosed = false;
  const onClose = (): void => {
    browserClosed = true;
  };
  context.on('close', onClose);

  const onAbort = (): void => {
    void context.close().catch(() => {
      // ignore
    });
  };
  input.signal?.addEventListener('abort', onAbort, { once: true });

  const cookieNames = parseLoggedInCookieNames(input.loggedInCookie);

  /**
   * 检测 profile 是否已有任一登录 Cookie
   */
  const hasLoginCookie = async (): Promise<boolean> => {
    if (cookieNames.length === 0) {
      return false;
    }
    // 同时查 checkUrl 与当前页，覆盖跨域登录（passport → www）
    const urls = [input.checkUrl];
    try {
      const pages = context.pages();
      const current = pages[0]?.url();
      if (current && current.startsWith('http')) {
        urls.push(current);
      }
    } catch {
      // ignore
    }
    const seen = new Set<string>();
    for (const url of urls) {
      const cookies = await context.cookies(url);
      for (const c of cookies) {
        if (seen.has(`${c.name}=${c.value}`)) {
          continue;
        }
        seen.add(`${c.name}=${c.value}`);
        if (
          cookieNames.includes(c.name) &&
          typeof c.value === 'string' &&
          c.value.trim().length > 0
        ) {
          return true;
        }
      }
    }
    // 再扫全量 Cookie（部分站点 HostOnly 与 URL 过滤不一致）
    const all = await context.cookies();
    return all.some((c) => {
      return (
        cookieNames.includes(c.name) &&
        typeof c.value === 'string' &&
        c.value.trim().length > 0
      );
    });
  };

  try {
    if (input.signal?.aborted) {
      return { status: 'cancelled' };
    }

    const page = context.pages()[0] ?? (await context.newPage());
    page.on('close', onClose);

    // 只导航一次到登录页，留给用户扫码
    await page.goto(input.loginUrl, { waitUntil: 'domcontentloaded' });

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (input.signal?.aborted) {
        return { status: 'cancelled' };
      }
      // persistent context 关闭窗口会触发 close；勿再依赖 browser()（常为 null）
      if (browserClosed) {
        return { status: 'browser_closed' };
      }

      try {
        // 0. Cookie 始终可作为登录成功证据
        if (await hasLoginCookie()) {
          return { status: 'logged_in' };
        }

        const stillOnLogin = looksLikeLoginPage(page, input.loginUrl);

        // 1. 仍在登录/passport 页：禁止用 DOM 判定（易误匹配头像/营销链接导致秒关窗）
        if (stillOnLogin) {
          // 静默等待
        } else {
          // 2. 已离开登录页 → 到 checkUrl 再确认 Cookie / DOM
          await page.goto(input.checkUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });
          if (await hasLoginCookie()) {
            return { status: 'logged_in' };
          }
          if (await isLoggedInMarkerVisible(page, input.loggedInCss)) {
            return { status: 'logged_in' };
          }
        }
      } catch (err) {
        if (isBrowserClosedError(err) || browserClosed) {
          return { status: 'browser_closed' };
        }
        if (input.signal?.aborted) {
          return { status: 'cancelled' };
        }
        // 其它瞬时错误：继续等
      }

      // 3. 仍在登录页：静默等待，绝不刷新
      await new Promise<void>((resolve) => {
        setTimeout(resolve, pollMs);
      });
    }
    return { status: 'timeout' };
  } catch (err) {
    if (input.signal?.aborted) {
      return { status: 'cancelled' };
    }
    if (isBrowserClosedError(err) || browserClosed) {
      return { status: 'browser_closed' };
    }
    throw err;
  } finally {
    input.signal?.removeEventListener('abort', onAbort);
    context.off('close', onClose);
    await context.close().catch(() => {
      // ignore
    });
  }
}
