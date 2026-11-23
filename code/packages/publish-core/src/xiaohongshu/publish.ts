/**
 * 小红书：图文笔记 / 写长文 → 创作者中心草稿（有头 Playwright）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import type { Page } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  closeProfileContext,
  openAccountContext,
} from '../session/chromeProfile.js';
import {
  getXhsPersonalInfo,
  XHS_CREATOR_HOME,
  XHS_CREATOR_ORIGIN,
  XHS_PUBLISH_ARTICLE_URL,
  XHS_PUBLISH_IMAGE_URL,
  type CookieFetch,
} from './client.js';
import {
  resolveXhsLocalImagePaths,
  resolveXhsPublishMode,
  validateXhsImages,
  type XhsPublishMode,
} from './images.js';

/** 图文标题最长 */
const XHS_IMAGE_TITLE_MAX = 20;

/** 长文标题最长 */
const XHS_ARTICLE_TITLE_MAX = 64;

/** 图文标题输入 */
const IMAGE_TITLE_SELECTOR =
  'input[placeholder*="填写标题"], input[placeholder*="标题"]';

/** 长文标题 */
const ARTICLE_TITLE_SELECTOR =
  'textarea[placeholder*="输入标题"], textarea[placeholder*="标题"]';

/** 正文编辑器（tiptap） */
const BODY_SELECTOR =
  '.tiptap.ProseMirror[contenteditable="true"], div.ProseMirror[contenteditable="true"]';

export interface XhsPublishInput {
  profileDir: string;
  title: string;
  markdown: string;
  /** imageText | article；缺省：有本地图→图文，否则长文 */
  mode?: string;
  /** 本地图片路径（图文必填） */
  images?: string[];
  /** 话题，逗号分隔 */
  topics?: string;
  onInfo?: (message: string) => void;
}

export interface XhsPublishResult {
  ok: boolean;
  url?: string;
  mode?: XhsPublishMode;
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
 * 追加话题到正文
 *
 * @param body 正文
 * @param topicsRaw 逗号分隔话题
 * @returns 拼接后正文
 */
function appendTopics(body: string, topicsRaw: string): string {
  const tags = topicsRaw
    .split(/[,，、\s]+/)
    .map((t) => {
      return t.replace(/^#/, '').trim();
    })
    .filter(Boolean)
    .slice(0, 10);
  if (tags.length === 0) {
    return body;
  }
  return `${body}\n\n${tags
    .map((t) => {
      return `#${t}`;
    })
    .join(' ')}`;
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
async function dismissModals(page: Page): Promise<void> {
  const labels = ['我知道了', '知道了', '关闭', '跳过', '暂不'];
  for (const text of labels) {
    const btn = page.getByRole('button', { name: text }).first();
    if (
      await btn.isVisible().catch(() => {
        return false;
      })
    ) {
      await btn.click().catch(() => {
        // ignore
      });
    }
  }
}

/**
 * 按文案点击可见元素
 *
 * @param page 页面
 * @param texts 候选
 * @returns 是否点到
 */
async function clickByText(page: Page, texts: string[]): Promise<boolean> {
  for (const label of texts) {
    const exact = page.getByText(label, { exact: true }).first();
    if (
      await exact.isVisible().catch(() => {
        return false;
      })
    ) {
      await exact.click();
      return true;
    }
  }
  for (const label of texts) {
    const loose = page.getByText(label, { exact: false }).first();
    if (
      await loose.isVisible().catch(() => {
        return false;
      })
    ) {
      await loose.click();
      return true;
    }
  }
  return false;
}

/**
 * 填写标题（input / textarea）
 *
 * @param page 页面
 * @param selector 选择器
 * @param title 标题
 * @param maxLen 最大字数
 * @returns 是否成功
 */
async function fillTitleField(
  page: Page,
  selector: string,
  title: string,
  maxLen: number,
): Promise<boolean> {
  const shortTitle = [...title].slice(0, maxLen).join('');
  const loc = page.locator(selector).first();
  try {
    await loc.waitFor({ state: 'visible', timeout: 20000 });
    await loc.click();
    await loc.fill('');
    await loc.pressSequentially(shortTitle, { delay: 15 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 填写 tiptap 正文
 *
 * @param page 页面
 * @param text 正文
 * @returns 是否成功
 */
async function fillBody(page: Page, text: string): Promise<boolean> {
  const loc = page.locator(BODY_SELECTOR).first();
  try {
    await loc.waitFor({ state: 'visible', timeout: 20000 });
    await loc.click();
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
    if (!ok) {
      return false;
    }
    const got = ((await loc.innerText()) || '').trim();
    return got.length > 0;
  } catch {
    return false;
  }
}

/**
 * 图文：存草稿
 *
 * 小红书发布页底部按钮位于 closed shadow root 内，文本定位不可见；
 * 但宿主 xhs-publish-btn 在 light DOM，按其 rect 比例点击左按钮（暂存离开）。
 *
 * @param page 页面
 * @returns 是否触发
 */
async function clickImageSaveDraft(page: Page): Promise<boolean> {
  const rect = (await page.evaluate(`(() => {
    const host = document.querySelector('xhs-publish-btn');
    if (!host) return null;
    const r = host.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`)) as { x: number; y: number; w: number; h: number } | null;
  if (rect && rect.w > 0 && rect.h > 0) {
    await page.mouse.click(rect.x + rect.w * 0.393, rect.y + rect.h * 0.52);
    return true;
  }
  const byText = await clickByText(page, [
    '暂存离开',
    '存草稿',
    '保存草稿',
    '暂存',
  ]);
  if (byText) {
    return true;
  }
  return page.evaluate(`(() => {
    const hosts = Array.from(document.querySelectorAll('xhs-publish-btn'));
    const methodNames = ['_onSave', '_onSaveDraft', '_onDraft', 'onSaveDraft'];
    for (const host of hosts) {
      for (const name of methodNames) {
        const fn = host[name];
        if (typeof fn === 'function') {
          try {
            fn.call(host);
            return true;
          } catch {}
        }
      }
    }
    return false;
  })()`) as Promise<boolean>;
}

/**
 * 等待保存结果提示
 *
 * @param page 页面
 * @param ms 最长等待毫秒
 * @returns success | failed | none
 */
async function waitSaveResult(
  page: Page,
  ms: number,
): Promise<'success' | 'failed' | 'none'> {
  const t0 = Date.now();
  let success = false;
  let failed = false;
  while (Date.now() - t0 < ms) {
    const text = (await page
      .evaluate('document.body.innerText || ""')
      .catch(() => {
        return '';
      })) as string;
    if (/保存成功|草稿已保存|已保存为草稿/.test(text)) {
      success = true;
      break;
    }
    if (/草稿保存失败|保存失败/.test(text)) {
      failed = true;
      break;
    }
    await page.waitForTimeout(300);
  }
  if (success) {
    return 'success';
  }
  return failed ? 'failed' : 'none';
}

/**
 * 长文：暂存离开
 *
 * @param page 页面
 * @returns 是否触发
 */
async function clickArticleSaveDraft(page: Page): Promise<boolean> {
  const btn = page.getByRole('button', { name: '暂存离开' }).first();
  if (
    await btn.isVisible().catch(() => {
      return false;
    })
  ) {
    await btn.click();
    return true;
  }
  return clickByText(page, ['暂存离开', '存草稿', '保存草稿']);
}

/**
 * 处理「暂存离开」后的二次确认弹层
 *
 * 只点明确的保存类按钮，绝不点「不保存 / 放弃 / 继续编辑 / 取消」。
 *
 * @param page 页面
 * @returns 是否点到保存类按钮
 */
async function confirmSaveDialog(page: Page): Promise<boolean> {
  const saveLabels = ['保存草稿', '保存并退出', '保存并离开', '保存'];
  const scopeSelectors = [
    '[role="dialog"]',
    '.xhs-modal, .modal, .ant-modal, .semi-modal, .d-modal',
  ];
  for (const selector of scopeSelectors) {
    const roots = page.locator(selector);
    const count = await roots.count().catch(() => {
      return 0;
    });
    for (let i = 0; i < count; i += 1) {
      const root = roots.nth(i);
      if (
        !(await root.isVisible().catch(() => {
          return false;
        }))
      ) {
        continue;
      }
      for (const label of saveLabels) {
        const btn = root
          .getByRole('button', { name: label, exact: true })
          .first();
        if (
          await btn.isVisible().catch(() => {
            return false;
          })
        ) {
          await btn.click().catch(() => {
            // ignore
          });
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * 发布过程截图取证
 *
 * @param page 页面
 * @param tag 文件名标签
 * @returns 截图路径
 */
async function captureShot(page: Page, tag: string): Promise<string | null> {
  try {
    const dir = join(homedir(), '.seedcast', 'logs', 'screenshots', 'xiaohongshu');
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${Date.now()}-${tag}.png`);
    await page.screenshot({ path: file });
    return file;
  } catch {
    return null;
  }
}

/**
 * 回查草稿箱：重新打开发布页 → 打开「草稿箱」→ 检查标题是否在列表中
 *
 * @param page 页面
 * @param title 标题
 * @returns 是否确认保存
 */
async function verifyDraftInBox(page: Page, title: string): Promise<boolean> {
  await page.goto(XHS_PUBLISH_IMAGE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  await dismissModals(page);
  const boxBtn = page.getByText(/草稿箱/).first();
  if (
    await boxBtn.isVisible().catch(() => {
      return false;
    })
  ) {
    await boxBtn.click().catch(() => {
      // ignore
    });
    await page.waitForTimeout(2000);
  }
  // 草稿箱默认停在「视频笔记」，切到「图文笔记」再核对
  const imageTab = page.getByText(/图文笔记/).first();
  if (
    await imageTab.isVisible().catch(() => {
      return false;
    })
  ) {
    await imageTab.click().catch(() => {
      // ignore
    });
    await page.waitForTimeout(2500);
  }
  const text = (await page.evaluate(
    'document.body.innerText || ""',
  )) as string;
  const head = [...title].slice(0, 6).join('');
  await captureShot(page, 'draftbox-verify');
  return text.includes(head);
}

/**
 * 图文笔记草稿
 *
 * @param page 页面
 * @param input 发布输入
 * @param images 本地图
 * @param log 日志
 */
async function publishImageNote(
  page: Page,
  input: XhsPublishInput,
  images: string[],
  log: (msg: string) => void,
): Promise<void> {
  log('打开图文发布页');
  await page.goto(XHS_PUBLISH_IMAGE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  await dismissModals(page);

  const uploadInput = page
    .locator(
      'input[type="file"][accept*="jpg"], input[type="file"][accept*="png"], input[type="file"][accept*="image"], input[type="file"]',
    )
    .first();
  await uploadInput.waitFor({ state: 'attached', timeout: 20000 });

  log(`上传 ${images.length} 张图片`);
  await uploadInput.setInputFiles(images);

  log('等待编辑区出现');
  await page.locator(IMAGE_TITLE_SELECTOR).first().waitFor({
    state: 'visible',
    timeout: 45000,
  });
  await page.locator(BODY_SELECTOR).first().waitFor({
    state: 'visible',
    timeout: 20000,
  });
  await dismissModals(page);

  log('填写标题与正文');
  if (
    !(await fillTitleField(
      page,
      IMAGE_TITLE_SELECTOR,
      input.title,
      XHS_IMAGE_TITLE_MAX,
    ))
  ) {
    throw new Error('找不到图文标题输入框');
  }

  let body = markdownToPlainText(input.markdown ?? '') || input.title;
  const topicsRaw =
    typeof input.topics === 'string' ? input.topics.trim() : '';
  if (topicsRaw) {
    body = appendTopics(body, topicsRaw);
  }
  if (!(await fillBody(page, body))) {
    throw new Error('找不到图文正文编辑器（.tiptap.ProseMirror）');
  }

  // 话题联想下拉框会干扰保存：Esc 关闭并点击标题框失焦
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator(IMAGE_TITLE_SELECTOR).first().click().catch(() => {
    // ignore
  });
  await page.waitForTimeout(800);

  log('点击存草稿');
  if (!(await clickImageSaveDraft(page))) {
    throw new Error(
      '未找到图文「存草稿」入口；请到创作者中心手动保存（窗口已保留）',
    );
  }
  let result = await waitSaveResult(page, 8000);
  if (result !== 'success') {
    log(`保存结果=${result}，重试一次`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await clickImageSaveDraft(page);
    result = await waitSaveResult(page, 8000);
  }
  await captureShot(page, 'after-save');
  if (result !== 'success') {
    throw new Error(
      `草稿保存未确认（平台提示：${result}）。截图在 ~/.seedcast/logs/screenshots/xiaohongshu（窗口已保留）`,
    );
  }

  log('回查草稿箱');
  const found = await verifyDraftInBox(page, input.title);
  if (!found) {
    throw new Error(
      '草稿箱回查未找到该标题，草稿可能未保存（窗口已保留，截图在 ~/.seedcast/logs/screenshots/xiaohongshu）',
    );
  }
  log('草稿箱回查命中');
}

/**
 * 写长文草稿
 *
 * @param page 页面
 * @param input 发布输入
 * @param log 日志
 */
async function publishLongArticle(
  page: Page,
  input: XhsPublishInput,
  log: (msg: string) => void,
): Promise<void> {
  log('打开写长文入口');
  await page.goto(XHS_PUBLISH_ARTICLE_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  await dismissModals(page);

  log('点击「新的创作」');
  const created = await clickByText(page, ['新的创作']);
  if (!created) {
    throw new Error('找不到「新的创作」按钮，请确认账号已开通长文能力');
  }
  await page.waitForTimeout(2500);

  await page.locator(ARTICLE_TITLE_SELECTOR).first().waitFor({
    state: 'visible',
    timeout: 30000,
  });
  await page.locator(BODY_SELECTOR).first().waitFor({
    state: 'visible',
    timeout: 20000,
  });

  log('填写长文标题与正文');
  if (
    !(await fillTitleField(
      page,
      ARTICLE_TITLE_SELECTOR,
      input.title,
      XHS_ARTICLE_TITLE_MAX,
    ))
  ) {
    throw new Error('找不到长文标题输入框（placeholder「输入标题」）');
  }

  const body = markdownToPlainText(input.markdown ?? '') || input.title;
  if (!(await fillBody(page, body))) {
    throw new Error('找不到长文正文编辑器（.tiptap.ProseMirror）');
  }

  log('暂存离开（写入草稿箱）');
  await page.waitForTimeout(1500);
  if (!(await clickArticleSaveDraft(page))) {
    throw new Error(
      '未找到「暂存离开」；长文可能已自动保存，请到草稿箱确认（窗口已保留）',
    );
  }
  await page.waitForTimeout(1500);
  await captureShot(page, 'article-after-save-click');
  await confirmSaveDialog(page);
  await page.waitForTimeout(2500);
  await captureShot(page, 'article-after-save-confirm');
}

/**
 * 发布到小红书创作者中心草稿（图文 / 长文）
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishXhsDraft(
  input: XhsPublishInput,
): Promise<XhsPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  const images = resolveXhsLocalImagePaths(input.images ?? []);
  const mode = resolveXhsPublishMode({
    mode: input.mode,
    hasLocalImages: images.length > 0,
    preferArticle: !input.mode && images.length === 0,
  });
  const imageErr = validateXhsImages(images, mode);
  if (imageErr) {
    return {
      ok: false,
      mode,
      error: { code: 'VALIDATION', message: imageErr },
    };
  }

  let ok = false;
  try {
    const context = await openAccountContext(input.profileDir, {
      headless: false,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    log('检测小红书登录态');
    await page.goto(XHS_CREATOR_HOME, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    const info = await getXhsPersonalInfo(makeRequestFetch(page));
    if (!info) {
      throw new Error(
        '小红书未登录或 Cookie 失效，请 accounts open-login 后扫码',
      );
    }
    log(`已登录：${info.name}`);
    log(mode === 'article' ? '发布形式：写长文' : '发布形式：上传图文');

    if (mode === 'article') {
      await publishLongArticle(page, input, log);
    } else {
      await publishImageNote(page, input, images, log);
    }

    ok = true;
    return {
      ok: true,
      mode,
      url:
        mode === 'article'
          ? XHS_PUBLISH_ARTICLE_URL
          : `${XHS_CREATOR_ORIGIN}/publish/publish`,
    };
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
    // 失败时保留浏览器窗口，便于排查；成功再关
    if (ok) {
      await closeProfileContext(input.profileDir);
    }
  }
}
