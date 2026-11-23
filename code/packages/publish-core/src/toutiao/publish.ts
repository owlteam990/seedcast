/**
 * 今日头条号：Markdown → 图文（页内 fetch / 签名）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { readFileSync } from 'node:fs';
import { markdownToSimpleHtml } from '../markdown/simpleHtml.js';
import {
  closeProfileContext,
  openAccountContext,
} from '../session/chromeProfile.js';
import {
  detectToutiaoLoginFromLanding,
  getToutiaoMediaInfo,
  saveToutiaoArticleDraft,
  TOUTIAO_MP_HOME,
  toutiaoDraftUrl,
  type CookieFetch,
} from './client.js';

export interface ToutiaoPublishInput {
  profileDir: string;
  title: string;
  markdown: string;
  /** 本地封面路径（可选） */
  coverFile?: string;
  onInfo?: (message: string) => void;
}

export interface ToutiaoPublishResult {
  ok: boolean;
  url?: string;
  pgcId?: string;
  mode?: 'draft' | 'submit';
  note?: string;
  error?: { code: string; message: string };
}

/**
 * 从正文 Markdown 提取首张公网图字节
 *
 * @param markdown 正文
 * @returns 字节或 null
 */
async function coverFromMarkdown(
  markdown: string,
): Promise<Uint8Array | null> {
  const m = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/.exec(markdown || '');
  if (!m?.[1]) {
    return null;
  }
  try {
    const res = await fetch(m[1], { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      return new Uint8Array(await res.arrayBuffer());
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * 用 Playwright request 包装为 CookieFetch（仅会话检测用）
 *
 * @param page 页面
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
 * 发布到头条号（优先草稿，失败回退提交）
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishToutiaoDraft(
  input: ToutiaoPublishInput,
): Promise<ToutiaoPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  try {
    const context = await openAccountContext(input.profileDir, {
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
          `头条号未登录或 Cookie 失效（落地：${landingUrl}），请 accounts open-login 后扫码`,
        );
      }
      log(`已登录：${info.name}`);

      // 2. 封面（可选）
      let coverBytes: Uint8Array | null = null;
      if (input.coverFile) {
        try {
          coverBytes = new Uint8Array(readFileSync(input.coverFile));
        } catch {
          log(`封面文件不可读，跳过：${input.coverFile}`);
        }
      }
      if (!coverBytes) {
        coverBytes = await coverFromMarkdown(input.markdown);
      }
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
      const html = markdownToSimpleHtml(input.markdown ?? '');
      log('写入头条号图文');
      const saved = await saveToutiaoArticleDraft(page, {
        title: input.title,
        html,
        coverBytes,
      });
      log(saved.note);

      return {
        ok: true,
        pgcId: saved.pgcId,
        mode: saved.mode,
        note: saved.note,
        url: toutiaoDraftUrl(saved.pgcId),
      };
    } finally {
      await closeProfileContext(input.profileDir);
    }
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'PLATFORM_REJECTED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
