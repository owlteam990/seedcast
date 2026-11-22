/**
 * 今日头条号：Markdown → 图文（Web API，页内签名）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { readFileSync } from 'node:fs';
import type {
  Account,
  Content,
  PluginRecord,
  PublishTarget,
  Receipt,
} from '@seedcast/shared';
import { SeedcastErrorCode } from '@seedcast/shared';
import { markdownToSimpleHtml } from '../simpleMarkdownHtml.js';
import {
  closeProfileContext,
  openAccountContext,
} from '../../session/pool.js';
import {
  detectToutiaoLoginFromLanding,
  getToutiaoMediaInfo,
  saveToutiaoArticleDraft,
  TOUTIAO_MP_HOME,
  toutiaoDraftUrl,
  type CookieFetch,
} from './client.js';

/**
 * 从正文 / 素材提取可用封面字节
 *
 * @param content 内容
 * @returns 字节或 null
 */
async function resolveCoverBytes(
  content: Content,
): Promise<Uint8Array | null> {
  // 1. 本地 assets 路径
  for (const asset of content.assets ?? []) {
    if (!/\.(png|jpe?g|webp)$/i.test(asset)) {
      continue;
    }
    try {
      if (asset.startsWith('/') || /^[A-Za-z]:\\/.test(asset)) {
        return new Uint8Array(readFileSync(asset));
      }
    } catch {
      // 下一张
    }
  }

  // 2. Markdown 中的公网图
  const md = content.markdown || '';
  const m = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/.exec(md);
  if (m?.[1]) {
    try {
      const res = await fetch(m[1], { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        return new Uint8Array(await res.arrayBuffer());
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * 用 Playwright request 包装为 CookieFetch（仅会话检测用）
 *
 * @param page 页面所在 context
 * @returns CookieFetch
 */
function makeRequestFetch(
  page: import('playwright').Page,
): CookieFetch {
  const context = page.context();
  return async (url, init, extraHeaders) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {
      ...(extraHeaders ?? {}),
    };
    const opts: {
      headers: Record<string, string>;
      data?: string;
      timeout: number;
      failOnStatusCode: boolean;
    } = {
      headers,
      timeout: 30000,
      failOnStatusCode: false,
    };
    if (typeof init?.body === 'string') {
      opts.data = init.body;
    }
    const apiRes =
      method === 'POST'
        ? await context.request.post(url, opts)
        : await context.request.get(url, opts);
    const buf = await apiRes.body();
    return new Response(buf, {
      status: apiRes.status(),
      statusText: apiRes.statusText(),
    });
  };
}

/**
 * 发布到头条号
 *
 * @param input 发布输入
 * @returns 回执
 */
export async function publishToutiaoDraft(input: {
  plugin: PluginRecord;
  content: Content;
  target: PublishTarget;
  account: Account;
  taskId: string;
  onInfo?: (message: string) => void;
}): Promise<Receipt> {
  const { content, target, account, taskId, onInfo } = input;
  const at = new Date().toISOString();
  const log = (msg: string): void => {
    onInfo?.(msg);
  };

  try {
    const context = await openAccountContext(account.profileDir, {
      headless: true,
    });
    try {
      const page = context.pages()[0] ?? (await context.newPage());

      // 1. 登录态
      log('检测头条号登录态');
      await page.goto(TOUTIAO_MP_HOME, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await page.waitForTimeout(1500);
      const landingUrl = page.url();
      let landingHtml = '';
      try {
        landingHtml = (await page.content()).slice(0, 200_000);
      } catch {
        landingHtml = '';
      }

      const fetchFn = makeRequestFetch(page);
      let info = await getToutiaoMediaInfo(fetchFn);
      if (!info) {
        info = detectToutiaoLoginFromLanding(landingUrl, landingHtml);
      }
      if (!info) {
        throw new Error(
          `头条号未登录或 Cookie 失效（落地：${landingUrl}），请到账号页重新登录`,
        );
      }
      log(`已登录：${info.name}`);

      // 2. 封面（可选）
      let coverBytes = await resolveCoverBytes(content);
      if (!coverBytes && info.avatar) {
        try {
          const res = await fetch(info.avatar, {
            signal: AbortSignal.timeout(15000),
          });
          if (res.ok) {
            coverBytes = new Uint8Array(await res.arrayBuffer());
          }
        } catch {
          // ignore
        }
      }

      // 3. 写入
      const html = markdownToSimpleHtml(content.markdown ?? '');
      log('写入头条号图文');
      const saved = await saveToutiaoArticleDraft(page, {
        title: content.title,
        html,
        coverBytes,
      });
      log(saved.note);

      return {
        taskId,
        target,
        ok: true,
        url: toutiaoDraftUrl(saved.pgcId),
        at,
      };
    } finally {
      await closeProfileContext(account.profileDir);
    }
  } catch (err) {
    return {
      taskId,
      target,
      ok: false,
      error: {
        code: SeedcastErrorCode.PLATFORM_REJECTED,
        message: err instanceof Error ? err.message : String(err),
      },
      at,
    };
  }
}
