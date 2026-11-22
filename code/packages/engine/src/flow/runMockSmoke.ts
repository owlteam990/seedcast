/**
 * 用 mock 插件 + 本地 HTML 跑通一条完整 flow（M0 验收）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { SeedcastErrorCode } from '@seedcast/shared';
import { resolveBuiltinPluginsDir } from '../plugins/loader.js';
import { runFlow } from './interpreter.js';
import type { FlowFile } from './types.js';

/**
 * 执行 mock 冒烟并返回结构化结果
 *
 * @returns 回执形态对象
 * @author Seedcast
 * @date 2026-11-21
 */
export async function runMockSmoke(): Promise<{
  ok: boolean;
  url?: string;
  error?: {
    code: string;
    step?: string;
    selector?: string;
    screenshot?: string;
    message?: string;
  };
  extracted?: Record<string, string>;
}> {
  const builtin = resolveBuiltinPluginsDir();
  if (!builtin) {
    return {
      ok: false,
      error: {
        code: SeedcastErrorCode.PLUGIN_NOT_FOUND,
        message: '找不到内置 plugins 目录',
      },
    };
  }

  const mockDir = join(builtin, 'mock');
  const flow = JSON.parse(
    readFileSync(join(mockDir, 'flow.json'), 'utf8'),
  ) as FlowFile;
  const selectors = JSON.parse(
    readFileSync(join(mockDir, 'selectors.json'), 'utf8'),
  ) as Record<string, string>;

  const fixturePath = resolve(mockDir, 'fixtures/article.html');
  const fixtureUrl = pathToFileURL(fixturePath).href;

  // 驱动本机 Chrome（不捆绑 Chromium）
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const screenshotDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../.tmp-smoke',
    );

    const result = await runFlow({
      page,
      steps: flow.publish,
      selectors,
      vars: {
        title: 'Seedcast Mock Title',
        content: 'Hello from Seedcast flow interpreter',
        fixtureUrl,
      },
      screenshotDir,
    });

    if (!result.ok) {
      return {
        ok: false,
        extracted: result.extracted,
        error: {
          code: result.error.code,
          step: result.error.step,
          selector: result.error.selector,
          screenshot: result.error.screenshot,
          message: result.error.message,
        },
      };
    }

    return {
      ok: true,
      url: result.extracted.url,
      extracted: result.extracted,
    };
  } finally {
    await browser.close();
  }
}

/**
 * CLI：node dist/flow/runMockSmoke.js
 *
 * @author Seedcast
 * @date 2026-11-21
 */
async function main(): Promise<void> {
  const receipt = await runMockSmoke();
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.ok) {
    process.exitCode = 1;
  }
}

const isDirect =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirect) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
