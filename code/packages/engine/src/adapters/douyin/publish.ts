/**
 * 抖音：文章 / 图文 → 创作者中心草稿（有头 Playwright）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { Page } from 'playwright';
import type {
  Account,
  Content,
  PluginRecord,
  PublishTarget,
  Receipt,
} from '@seedcast/shared';
import { SeedcastErrorCode } from '@seedcast/shared';
import {
  closeProfileContext,
  openAccountContext,
} from '../../session/pool.js';
import {
  DOUYIN_ARTICLE_EDITOR,
  DOUYIN_CREATOR_ORIGIN,
  DOUYIN_UPLOAD_PAGE,
  getDouyinUserInfo,
  type CookieFetch,
} from './client.js';

/**
 * 将 Markdown 压成创作者中心可用的纯文本
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
 * 解析本地图片路径（绝对路径或 ~/.seedcast/assets）
 *
 * @param content 内容
 * @returns 存在的本地图片路径
 */
function resolveLocalImagePaths(content: Content): string[] {
  const out: string[] = [];
  const dataAssets = join(homedir(), '.seedcast', 'assets');
  for (const asset of content.assets ?? []) {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(asset)) {
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
    const resHeaders = new Headers();
    for (const [k, v] of Object.entries(apiRes.headers())) {
      resHeaders.set(k, v);
    }
    return new Response(buf, {
      status: apiRes.status(),
      statusText: apiRes.statusText(),
      headers: resHeaders,
    });
  };
}

/**
 * 关闭常见引导弹层
 *
 * @param page 页面
 */
async function dismissDouyinModals(page: Page): Promise<void> {
  // 字符串脚本：避免 Node TS 校验 DOM 全局
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
 * 在页面上找包含指定文案的可点击元素并点击
 *
 * @param page 页面
 * @param texts 候选文案
 * @returns 是否点到
 */
async function clickByText(
  page: Page,
  texts: string[],
): Promise<boolean> {
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
 * 填写标题 input
 *
 * @param page 页面
 * @param title 标题
 * @returns 是否成功
 */
async function fillTitle(page: Page, title: string): Promise<boolean> {
  return page.evaluate(
    `(value) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const titleInput = inputs.find((el) => {
        const ph = el.placeholder || '';
        return (
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
    title,
  ) as Promise<boolean>;
}

/**
 * 填写 contenteditable 正文 / 文案
 *
 * @param page 页面
 * @param text 文本
 * @returns 是否成功
 */
async function fillEditable(page: Page, text: string): Promise<boolean> {
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
      editor.textContent = '';
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, value);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }`,
    text,
  ) as Promise<boolean>;
}

/**
 * 点击暂存 / 存草稿
 *
 * @param page 页面
 * @returns 是否点到
 */
async function clickSaveDraft(page: Page): Promise<boolean> {
  const labels = ['暂存离开', '存草稿', '保存草稿', '暂存'];
  return clickByText(page, labels);
}

/**
 * 文章路径：打开发布文章编辑器并写入草稿
 *
 * @param page 页面
 * @param content 内容
 * @param log 日志
 * @returns 结果页 URL
 */
async function publishArticleDraft(
  page: Page,
  content: Content,
  log: (msg: string) => void,
): Promise<string> {
  log('打开抖音「发布文章」编辑器');
  await page.goto(DOUYIN_ARTICLE_EDITOR, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  await dismissDouyinModals(page);

  // 部分账号会先落在上传页，尝试点「发布文章 / 我要发文」
  await clickByText(page, ['发布文章', '我要发文', '写文章']);
  await page.waitForTimeout(1500);
  await dismissDouyinModals(page);

  log('填写标题');
  const titleOk = await fillTitle(page, content.title);
  if (!titleOk) {
    // 文章编辑器可能用 contenteditable 当标题区：先写正文即可
    log('未找到标题输入框，继续写正文');
  }

  const body = markdownToPlainText(content.markdown ?? '');
  if (!body || body.length < 20) {
    throw new Error('抖音文章正文过短（建议 ≥20 字），请补充后再发');
  }
  log('填写正文');
  const bodyOk = await fillEditable(page, body);
  if (!bodyOk) {
    throw new Error('找不到抖音文章编辑器，请确认账号已开通创作者中心发文能力');
  }

  log('点击暂存草稿');
  const saved = await clickSaveDraft(page);
  if (!saved) {
    throw new Error('未找到「暂存离开 / 存草稿」按钮，请到创作者中心手动确认');
  }
  await page.waitForTimeout(2000);
  return page.url() || DOUYIN_CREATOR_ORIGIN;
}

/**
 * 图文路径：上传本地图 + 标题文案后暂存
 *
 * @param page 页面
 * @param content 内容
 * @param log 日志
 * @returns 结果页 URL
 */
async function publishImageTextDraft(
  page: Page,
  content: Content,
  log: (msg: string) => void,
): Promise<string> {
  const images = resolveLocalImagePaths(content);
  if (images.length === 0) {
    throw new Error('图文发布需要至少一张本地图片素材（content.assets）');
  }

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

  // 等待进入编辑态
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
  await fillTitle(page, content.title);
  const caption =
    markdownToPlainText(content.markdown ?? '') || content.title;
  await fillEditable(page, caption);

  log('点击暂存草稿');
  const saved = await clickSaveDraft(page);
  if (!saved) {
    throw new Error('未找到「暂存离开」按钮，图文可能仍在上传中，请到创作者中心确认');
  }
  await page.waitForTimeout(2000);
  return page.url() || DOUYIN_CREATOR_ORIGIN;
}

/**
 * 发布到抖音创作者中心草稿
 *
 * @param input 发布输入
 * @returns 回执
 * @author Seedcast
 * @date 2026-11-22
 */
export async function publishDouyinDraft(input: {
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

  // 有头浏览器：便于过验证码与观察创作者中心
  const context = await openAccountContext(account.profileDir, {
    headless: false,
  });
  let ok = false;

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    log('检测抖音登录态');
    await page.goto(DOUYIN_CREATOR_ORIGIN, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(1500);
    const info = await getDouyinUserInfo(makeRequestFetch(page));
    if (!info) {
      throw new Error('抖音未登录或 Cookie 失效，请到账号页重新登录');
    }
    log(`已登录：${info.nickname}`);

    const mode =
      content.contentType === 'imageText' ? 'imageText' : 'article';
    const url =
      mode === 'imageText'
        ? await publishImageTextDraft(page, content, log)
        : await publishArticleDraft(page, content, log);

    ok = true;
    return {
      taskId,
      target,
      ok: true,
      url,
      at,
    };
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
  } finally {
    // 失败不关窗，保留现场；成功再释放 profile
    if (ok) {
      await closeProfileContext(account.profileDir);
    }
  }
}
