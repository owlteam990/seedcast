/**
 * 抖音：文章 / 图文 → 创作者中心草稿（有头 Playwright）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { Page } from 'playwright';
import {
  closeProfileContext,
  openAccountContext,
} from '../session/chromeProfile.js';
import {
  DOUYIN_ARTICLE_EDITOR,
  DOUYIN_CREATOR_ORIGIN,
  DOUYIN_UPLOAD_PAGE,
  getDouyinUserInfo,
  type CookieFetch,
} from './client.js';

export type DouyinPublishMode = 'article' | 'imageText';

export interface DouyinPublishInput {
  profileDir: string;
  title: string;
  markdown: string;
  /** article | imageText；缺省：有本地图→图文，否则文章 */
  mode?: string;
  /** 本地图片（图文必填） */
  images?: string[];
  onInfo?: (message: string) => void;
}

export interface DouyinPublishResult {
  ok: boolean;
  url?: string;
  mode?: DouyinPublishMode;
  error?: { code: string; message: string };
}

/**
 * Markdown → 纯文本
 *
 * @param markdown 正文
 * @returns 纯文本
 */
function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~>#-]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 解析本地图片路径
 *
 * @param assets 素材列表
 * @returns 存在的本地路径
 */
function resolveLocalImagePaths(assets: string[] = []): string[] {
  const out: string[] = [];
  const dataAssets = join(homedir(), '.seedcast', 'assets');
  for (const asset of assets) {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(asset) || /^https?:\/\//i.test(asset)) {
      continue;
    }
    const candidates = [
      asset,
      isAbsolute(asset) ? asset : join(dataAssets, asset),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        out.push(c);
        break;
      }
    }
  }
  return out.slice(0, 35);
}

/**
 * Playwright request → CookieFetch
 *
 * @param page 页面
 * @returns CookieFetch
 */
function makeRequestFetch(page: Page): CookieFetch {
  const context = page.context();
  return async (url, init, extraHeaders) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
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
 * 关闭常见引导弹层
 *
 * @param page 页面
 */
async function dismissDouyinModals(page: Page): Promise<void> {
  await page.evaluate(`() => {
    const targets = ['我知道了', '知道了', '关闭', '暂不'];
    for (const text of targets) {
      const btn = Array.from(
        document.querySelectorAll('button, [role="button"], span'),
      ).find((el) => (el.textContent || '').trim() === text);
      if (btn instanceof HTMLElement) {
        btn.click();
      }
    }
  }`);
}

/**
 * 按文案点击
 *
 * @param page 页面
 * @param texts 候选
 * @returns 是否点到
 */
async function clickByText(page: Page, texts: string[]): Promise<boolean> {
  return page.evaluate(
    `(labels) => {
      const nodes = Array.from(
        document.querySelectorAll(
          'button, [role="button"], span, div, a, label',
        ),
      );
      for (const label of labels) {
        const hit = nodes.find((el) => {
          const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
          return t === label || t.includes(label);
        });
        if (hit instanceof HTMLElement) {
          hit.click();
          return true;
        }
      }
      return false;
    }`,
    texts,
  ) as Promise<boolean>;
}

/**
 * 填写标题
 *
 * @param page 页面
 * @param title 标题
 * @returns 是否成功
 */
/** 文章标题最长（创作者中心 2026-11 实测） */
const DOUYIN_ARTICLE_TITLE_MAX = 30;

/**
 * 填写标题
 *
 * @param page 页面
 * @param title 标题
 * @returns 是否成功
 */
async function fillTitle(page: Page, title: string): Promise<boolean> {
  const shortTitle = [...title].slice(0, DOUYIN_ARTICLE_TITLE_MAX).join('');
  const locator = page
    .locator(
      'input[placeholder*="文章标题"], input[placeholder*="作品标题"], input[placeholder*="填写作品标题"], input[placeholder*="标题"]',
    )
    .first();
  try {
    await locator.waitFor({ state: 'visible', timeout: 20000 });
    await locator.click();
    await locator.fill('');
    await locator.pressSequentially(shortTitle, { delay: 20 });
    return true;
  } catch {
    return page.evaluate(
      `(value) => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const titleInput = inputs.find((el) => {
          const ph = el.placeholder || '';
          return (
            ph.includes('文章标题') ||
            ph.includes('标题') ||
            ph.includes('作品标题') ||
            ph.includes('填写作品标题')
          );
        });
        if (!(titleInput instanceof HTMLInputElement)) {
          return false;
        }
        titleInput.focus();
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(titleInput, value);
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }`,
      shortTitle,
    ) as Promise<boolean>;
  }
}

/**
 * 填写 contenteditable / tipTap 正文
 *
 * @param page 页面
 * @param text 文本
 * @returns 是否成功
 */
async function fillEditable(page: Page, text: string): Promise<boolean> {
  const tipTap = page
    .locator(
      '.tiptap.ProseMirror[contenteditable="true"], div.ProseMirror[contenteditable="true"]',
    )
    .first();
  try {
    await tipTap.waitFor({ state: 'visible', timeout: 20000 });
    await tipTap.click();
    const ok = (await page.evaluate(`(() => {
      const value = ${JSON.stringify(text)};
      const el = document.querySelector(
        '.tiptap.ProseMirror[contenteditable="true"], div.ProseMirror[contenteditable="true"]',
      );
      if (!(el instanceof HTMLElement)) {
        return false;
      }
      el.focus();
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)) as boolean;
    if (ok) {
      const got = ((await tipTap.innerText()) || '').trim();
      return got.length > 0;
    }
  } catch {
    // fallback
  }
  return page.evaluate(
    `(value) => {
      const editors = Array.from(
        document.querySelectorAll('[contenteditable="true"]'),
      );
      const editor = editors.find((el) => el instanceof HTMLElement);
      if (!(editor instanceof HTMLElement)) {
        return false;
      }
      editor.focus();
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, value);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return (editor.innerText || '').trim().length > 0;
    }`,
    text,
  ) as Promise<boolean>;
}

/**
 * 点击暂存
 *
 * @param page 页面
 * @returns 是否点到
 */
async function clickSaveDraft(page: Page): Promise<boolean> {
  const labels = ['暂存离开', '存草稿', '保存草稿', '暂存'];
  for (const label of labels) {
    const btn = page.getByRole('button', { name: label }).first();
    if (
      await btn.isVisible().catch(() => {
        return false;
      })
    ) {
      await btn.click({ force: true }).catch(() => {
        // ignore
      });
      return true;
    }
    const byText = page.getByText(label, { exact: true }).first();
    if (
      await byText.isVisible().catch(() => {
        return false;
      })
    ) {
      await byText.click({ force: true }).catch(() => {
        // ignore
      });
      return true;
    }
  }
  return clickByText(page, labels);
}

/**
 * 文章草稿
 *
 * @param page 页面
 * @param input 输入
 * @param log 日志
 * @returns URL
 */
async function publishArticleDraft(
  page: Page,
  input: DouyinPublishInput,
  log: (msg: string) => void,
): Promise<string> {
  log('打开抖音「发布文章」编辑器');
  await page.goto(DOUYIN_ARTICLE_EDITOR, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(3000);
  await dismissDouyinModals(page);
  // 已在发文 URL 时勿再点侧栏「作品发布」，以免打乱编辑区
  const titleReady = await page
    .locator('input[placeholder*="文章标题"], input[placeholder*="标题"]')
    .first()
    .isVisible()
    .catch(() => {
      return false;
    });
  if (!titleReady) {
    await clickByText(page, ['发布文章', '我要发文', '写文章']);
    await page.waitForTimeout(2000);
    await dismissDouyinModals(page);
  }

  log('填写标题');
  const titleOk = await fillTitle(page, input.title);
  if (!titleOk) {
    throw new Error('找不到抖音文章标题输入框（placeholder 含「文章标题」）');
  }

  const body = markdownToPlainText(input.markdown ?? '');
  if (!body || body.length < 20) {
    throw new Error('抖音文章正文过短（建议 ≥20 字），请补充后再发');
  }
  log('填写正文');
  if (!(await fillEditable(page, body))) {
    throw new Error(
      '找不到抖音文章编辑器，请确认账号已开通创作者中心发文能力',
    );
  }

  log('点击暂存草稿');
  if (!(await clickSaveDraft(page))) {
    throw new Error(
      '未找到「暂存离开 / 存草稿」按钮，请到创作者中心手动确认（窗口已保留）',
    );
  }
  await page.waitForTimeout(2000);
  return page.url() || DOUYIN_CREATOR_ORIGIN;
}

/**
 * 图文草稿
 *
 * @param page 页面
 * @param input 输入
 * @param images 本地图
 * @param log 日志
 * @returns URL
 */
async function publishImageTextDraft(
  page: Page,
  input: DouyinPublishInput,
  images: string[],
  log: (msg: string) => void,
): Promise<string> {
  log('打开抖音上传页（图文）');
  await page.goto(DOUYIN_UPLOAD_PAGE, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  await dismissDouyinModals(page);
  await clickByText(page, ['发布图文', '图文', '上传图文']);
  await page.waitForTimeout(1000);

  log(`上传 ${images.length} 张图片`);
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(images);
  await page.waitForTimeout(4000);
  await dismissDouyinModals(page);

  for (let i = 0; i < 40; i++) {
    const ready = (await page.evaluate(`() => {
      const hasTitle = Array.from(document.querySelectorAll('input')).some(
        (el) => (el.placeholder || '').includes('标题'),
      );
      const hasSave = Array.from(
        document.querySelectorAll('button, [role="button"], span'),
      ).some((el) => {
        const t = (el.textContent || '').trim();
        return t.includes('暂存') || t.includes('存草稿');
      });
      return hasTitle || hasSave;
    }`)) as boolean;
    if (ready) {
      break;
    }
    await page.waitForTimeout(500);
  }

  log('填写标题与文案');
  await fillTitle(page, input.title);
  const caption =
    markdownToPlainText(input.markdown ?? '') || input.title;
  await fillEditable(page, caption);

  log('点击暂存草稿');
  if (!(await clickSaveDraft(page))) {
    throw new Error(
      '未找到「暂存离开」按钮，图文可能仍在上传中（窗口已保留）',
    );
  }
  await page.waitForTimeout(2000);
  return page.url() || DOUYIN_CREATOR_ORIGIN;
}

/**
 * 发布到抖音创作者中心草稿
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishDouyinDraft(
  input: DouyinPublishInput,
): Promise<DouyinPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  const images = resolveLocalImagePaths(input.images ?? []);
  const raw = typeof input.mode === 'string' ? input.mode.trim() : '';
  const mode: DouyinPublishMode =
    raw === 'imageText' || raw === 'article'
      ? raw
      : images.length > 0
        ? 'imageText'
        : 'article';

  if (mode === 'imageText' && images.length === 0) {
    return {
      ok: false,
      mode,
      error: {
        code: 'VALIDATION',
        message: '抖音图文至少需要 1 张本地图片（--images）',
      },
    };
  }

  let ok = false;
  try {
    const context = await openAccountContext(input.profileDir, {
      headless: false,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    log('检测抖音登录态');
    await page.goto(DOUYIN_CREATOR_ORIGIN, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(1500);
    const info = await getDouyinUserInfo(makeRequestFetch(page));
    if (!info) {
      throw new Error(
        '抖音未登录或 Cookie 失效，请 accounts open-login 后扫码',
      );
    }
    log(`已登录：${info.nickname}`);
    log(mode === 'imageText' ? '发布形式：图文' : '发布形式：文章');

    const url =
      mode === 'imageText'
        ? await publishImageTextDraft(page, input, images, log)
        : await publishArticleDraft(page, input, log);

    ok = true;
    return { ok: true, mode, url };
  } catch (err) {
    return {
      ok: false,
      mode,
      error: {
        code: 'PLATFORM_REJECTED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  } finally {
    if (ok) {
      await closeProfileContext(input.profileDir);
    }
  }
}
