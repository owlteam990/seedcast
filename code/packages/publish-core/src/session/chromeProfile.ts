/**
 * Chrome persistent profile 打开/关闭（Skill / publish-core 精简版）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext } from 'playwright';

const contextsByProfile = new Map<string, BrowserContext>();

function clearChromiumSingletonLocks(profileDir: string): void {
  for (const name of [
    'SingletonLock',
    'SingletonSocket',
    'SingletonCookie',
  ]) {
    try {
      unlinkSync(join(profileDir, name));
    } catch {
      // ignore
    }
  }
}

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

async function killOrphanChromeForProfile(profileDir: string): Promise<void> {
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
      // exited
    }
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 400);
  });
  clearChromiumSingletonLocks(profileDir);
}

/**
 * 关闭指定 profile 上已登记的 context
 *
 * @param profileDir profile 目录
 */
export async function closeProfileContext(profileDir: string): Promise<void> {
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
 * 打开账号 Chrome persistent context
 *
 * @param profileDir profile 目录
 * @param options headless 等
 * @returns BrowserContext
 */
export async function openAccountContext(
  profileDir: string,
  options?: { headless?: boolean },
): Promise<BrowserContext> {
  mkdirSync(profileDir, { recursive: true });
  await closeProfileContext(profileDir);

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
      ignoreDefaultArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  };

  let context: BrowserContext;
  try {
    context = await launch();
  } catch (err) {
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
