/**
 * 声明式插件发布执行（Playwright + flow）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BrowserContext } from 'playwright';
import type {
  Account,
  Content,
  PluginRecord,
  PublishTarget,
  Receipt,
} from '@seedcast/shared';
import { SeedcastErrorCode } from '@seedcast/shared';
import {
  collectSelectorKeys,
  resolvePublishSteps,
} from '../flow/resolvePublishSteps.js';
import { runFlow } from '../flow/interpreter.js';
import type { FlowFile, FlowStep } from '../flow/types.js';
import { openAccountContext } from '../session/pool.js';

/**
 * 文章「导入文档」且未指定文件时，用正文生成临时 Markdown
 *
 * @param content 内容
 * @param settings 设置（可能被写入 importFile）
 * @param workDir 工作目录
 * @returns 可能补充了 importFile 的 settings
 */
function ensureArticleImportFile(
  content: Content,
  settings: Record<string, unknown>,
  workDir: string,
): Record<string, unknown> {
  if (settings.articleImport !== 'document') {
    return settings;
  }
  const existing = settings.importFile;
  if (typeof existing === 'string' && existing.trim().length > 0) {
    return settings;
  }
  mkdirSync(workDir, { recursive: true });
  const safeTitle = content.title.replace(/[^\w\u4e00-\u9fff-]+/g, '_').slice(0, 40);
  const filePath = join(workDir, `${safeTitle || 'import'}.md`);
  const body =
    content.markdown.trim().length > 0
      ? content.markdown
      : `# ${content.title}\n`;
  writeFileSync(filePath, body, 'utf8');
  return { ...settings, importFile: filePath };
}

/**
 * 读取插件 flow / selectors
 *
 * @param pluginDir 插件目录
 * @returns flow 与 selectors
 */
function loadFlowAssets(pluginDir: string): {
  flow: FlowFile;
  selectors: Record<string, string>;
} {
  const flow = JSON.parse(
    readFileSync(join(pluginDir, 'flow.json'), 'utf8'),
  ) as FlowFile;
  const selectors = JSON.parse(
    readFileSync(join(pluginDir, 'selectors.json'), 'utf8'),
  ) as Record<string, string>;
  return { flow, selectors };
}

/**
 * 仅校验本流程用到的选择器（避免其它类型的占位拖垮当前发布）
 *
 * @param selectors 全量选择器
 * @param steps 当前步骤
 * @throws 选择器缺失或仍为占位
 */
function assertStepsSelectorsReady(
  selectors: Record<string, string>,
  steps: FlowStep[],
): void {
  const keys = collectSelectorKeys(steps);
  for (const key of keys) {
    const value = selectors[key];
    if (!value) {
      throw new Error(`selectors.json 缺少键: ${key}`);
    }
    if (value.startsWith('PLACEHOLDER')) {
      throw new Error(
        `选择器未配置（仍为占位）: ${key}=${value}，请先实测更新 selectors.json`,
      );
    }
  }
}

/**
 * 知乎等插件的发布类型前置校验（在打开浏览器前调用）
 *
 * @param pluginId 插件 ID
 * @param settings 设置
 * @author Seedcast
 * @date 2026-11-21
 */
/** 知乎支持的发布类型（与 manifest 对齐；不含写回答） */
const ZHIHU_PUBLISH_TYPES = new Set([
  'question',
  'pin',
  'article',
  'video',
]);

/** 知乎文章导入方式 */
const ZHIHU_ARTICLE_IMPORTS = new Set([
  'editor',
  'wechatLink',
  'document',
]);

export function validatePublishSettings(
  pluginId: string,
  settings: Record<string, unknown>,
): void {
  if (pluginId !== 'zhihu') {
    return;
  }
  const publishType =
    typeof settings.publishType === 'string' ? settings.publishType : 'article';
  if (!ZHIHU_PUBLISH_TYPES.has(publishType)) {
    throw new Error(
      `不支持的发布类型「${publishType}」。可选: ${[...ZHIHU_PUBLISH_TYPES].join(', ')}`,
    );
  }

  if (publishType !== 'article') {
    return;
  }

  const articleImport =
    typeof settings.articleImport === 'string'
      ? settings.articleImport
      : 'editor';
  if (!ZHIHU_ARTICLE_IMPORTS.has(articleImport)) {
    throw new Error(
      `不支持的文章导入方式「${articleImport}」。可选: ${[...ZHIHU_ARTICLE_IMPORTS].join(', ')}`,
    );
  }
  if (articleImport === 'wechatLink') {
    const url = settings.importUrl;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
      throw new Error('导入公众号链接需填写有效的 http(s) 链接');
    }
  }
  if (articleImport === 'document') {
    const file = settings.importFile;
    // 允许缺省：发布时会用正文 Markdown 生成临时 .md
    if (
      file !== undefined &&
      file !== null &&
      file !== '' &&
      typeof file !== 'string'
    ) {
      throw new Error('导入文档路径 importFile 必须是字符串');
    }
  }
}

/**
 * 组装模板变量
 *
 * @param content 内容
 * @param target 目标
 * @param plugin 插件
 * @returns vars
 */
function buildVars(
  content: Content,
  target: PublishTarget,
  plugin: PluginRecord,
): Record<string, unknown> {
  const settings = target.settings ?? {};
  const topicsRaw =
    typeof settings.topics === 'string' ? settings.topics : '';
  const topic =
    topicsRaw
      .split(/[,，]/)
      .map((t) => {
        return t.trim();
      })
      .find((t) => {
        return t.length > 0;
      }) ?? '';
  const coverFile =
    typeof settings.coverFile === 'string' ? settings.coverFile.trim() : '';
  // 无本地封面时，尝试从正文配图里选一张（导入公众号正文通常有图）
  const coverFromContent = coverFile ? '' : '1';

  const vars: Record<string, unknown> = {
    title: content.title,
    content: content.markdown,
    desc: content.title,
    settings,
    topic,
    coverFromContent,
    account: { name: target.accountId },
  };

  // mock 插件：默认指向内置 fixture
  if (plugin.manifest.id === 'mock') {
    const fixturePath = join(plugin.dir, 'fixtures/article.html');
    vars.fixtureUrl =
      typeof settings.fixtureUrl === 'string' && settings.fixtureUrl.length > 0
        ? settings.fixtureUrl
        : pathToFileURL(fixturePath).href;
  }

  return vars;
}

/**
 * 使用 flow 适配器发布单个目标（必须复用账号 Chrome profile）
 *
 * @param input 发布输入
 * @returns 回执
 * @author Seedcast
 * @date 2026-11-21
 */
export async function publishWithFlow(input: {
  plugin: PluginRecord;
  content: Content;
  target: PublishTarget;
  account: Account;
  taskId: string;
  screenshotDir?: string;
  headless?: boolean;
}): Promise<Receipt> {
  const {
    plugin,
    content,
    target,
    account,
    taskId,
    screenshotDir,
    headless = false,
  } = input;
  const at = new Date().toISOString();

  if (plugin.manifest.adapter !== 'flow') {
    return {
      taskId,
      target,
      ok: false,
      error: {
        code: SeedcastErrorCode.VALIDATION,
        message: `插件 ${plugin.manifest.id} 不是 flow 适配器`,
      },
      at,
    };
  }

  let context: BrowserContext | undefined;
  /** 有头失败时保留窗口，不主动关掉 */
  let keepBrowserOpen = false;
  try {
    let settings = { ...(target.settings ?? {}) };
    validatePublishSettings(plugin.manifest.id, settings);

    // 导入文档：无路径时用 Markdown 落临时文件
    if (plugin.manifest.id === 'zhihu') {
      const workDir = join(
        screenshotDir ?? join(account.profileDir, '..', '..', 'tmp'),
        'imports',
        taskId,
      );
      settings = ensureArticleImportFile(content, settings, workDir);
    }

    const effectiveTarget: PublishTarget = {
      ...target,
      settings,
    };

    const { flow, selectors } = loadFlowAssets(plugin.dir);
    const { publishType, steps } = resolvePublishSteps(flow, settings);
    assertStepsSelectorsReady(selectors, steps);

    // 关键：必须用该账号的 persistent profile，否则登录态不在
    context = await openAccountContext(account.profileDir, { headless });
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(45_000);

    const result = await runFlow({
      page,
      steps,
      selectors,
      vars: {
        ...buildVars(content, effectiveTarget, plugin),
        publishType,
      },
      screenshotDir,
    });

    if (!result.ok) {
      if (!headless) {
        keepBrowserOpen = true;
      }
      return {
        taskId,
        target,
        ok: false,
        error: {
          code: result.error.code,
          step: result.error.step,
          selector: result.error.selector,
          screenshot: result.error.screenshot,
          message: `[${publishType}] ${result.error.message}${
            keepBrowserOpen ? '（已保留浏览器窗口，请手动关闭）' : ''
          }`,
        },
        at: new Date().toISOString(),
      };
    }

    return {
      taskId,
      target,
      ok: true,
      url: result.extracted.url,
      at: new Date().toISOString(),
    };
  } catch (err) {
    if (!headless && context) {
      keepBrowserOpen = true;
    }
    return {
      taskId,
      target,
      ok: false,
      error: {
        code: SeedcastErrorCode.UNKNOWN,
        message: `${err instanceof Error ? err.message : String(err)}${
          keepBrowserOpen ? '（已保留浏览器窗口，请手动关闭）' : ''
        }`,
      },
      at: new Date().toISOString(),
    };
  } finally {
    if (context && !keepBrowserOpen) {
      await context.close().catch(() => {
        // ignore
      });
    }
  }
}
