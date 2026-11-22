/**
 * 声明式 flow 解释器（Playwright Page）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { SeedcastErrorCode } from '@seedcast/shared';
import { locateByExpr } from './locate.js';
import { renderTemplate } from './template.js';
import type { FlowStep, FlowStepError } from './types.js';

/**
 * 解释器执行选项
 */
export interface RunFlowOptions {
  /** Playwright 页面 */
  page: Page;
  /** 步骤列表 */
  steps: FlowStep[];
  /** selectors.json 键值 */
  selectors: Record<string, string>;
  /** 模板变量 */
  vars: Record<string, unknown>;
  /** 失败截图目录（可选） */
  screenshotDir?: string;
}

/**
 * 解释器成功结果
 */
export interface RunFlowResult {
  /** 是否成功 */
  ok: true;
  /** extract / currentUrl 收集的变量 */
  extracted: Record<string, string>;
}

/**
 * 解释器失败结果
 */
export interface RunFlowFailure {
  /** 是否成功 */
  ok: false;
  /** 已提取变量 */
  extracted: Record<string, string>;
  /** 错误详情 */
  error: FlowStepError;
}

/**
 * 解析选择器键为真实 CSS/定位串
 *
 * @param selectors 选择器表
 * @param key 键
 * @returns CSS
 * @throws 键不存在
 */
function resolveSelector(
  selectors: Record<string, string>,
  key: string | undefined,
): string {
  if (!key) {
    throw new Error('步骤缺少 selector 键');
  }
  const css = selectors[key];
  if (!css) {
    throw new Error(`selectors.json 中不存在键: ${key}`);
  }
  if (css.startsWith('PLACEHOLDER')) {
    throw new Error(
      `选择器未配置（仍为占位）: ${key}=${css}，请先实测更新 selectors.json`,
    );
  }
  return css;
}

/**
 * 失败时尝试截图
 *
 * @param page 页面
 * @param screenshotDir 目录
 * @param stepIndex 步骤索引
 * @returns 路径或 undefined
 */
async function maybeScreenshot(
  page: Page,
  screenshotDir: string | undefined,
  stepIndex: number,
): Promise<string | undefined> {
  if (!screenshotDir) {
    return undefined;
  }
  try {
    mkdirSync(screenshotDir, { recursive: true });
    const path = join(screenshotDir, `step-${stepIndex}.png`);
    await page.screenshot({ path, fullPage: true });
    return path;
  } catch {
    return undefined;
  }
}

/**
 * 执行一条 flow
 *
 * @param options 选项
 * @returns 成功或失败结果
 * @author Seedcast
 * @date 2026-11-21
 */
export async function runFlow(
  options: RunFlowOptions,
): Promise<RunFlowResult | RunFlowFailure> {
  const { page, steps, selectors, vars, screenshotDir } = options;
  const extracted: Record<string, string> = {};
  // 可变变量表：extract 结果可被后续步骤引用
  const runtimeVars: Record<string, unknown> = { ...vars, ...extracted };

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    try {
      // 可选步骤：value/file 为空则跳过（话题、封面路径等）
      if (step.skipIfEmpty) {
        const probe = renderTemplate(
          step.value ?? step.file ?? step.option ?? '',
          runtimeVars,
        ).trim();
        if (!probe) {
          continue;
        }
      }

      // 按动作分发
      switch (step.action) {
        case 'goto': {
          const url = renderTemplate(step.url ?? '', runtimeVars);
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          break;
        }
        case 'waitFor': {
          const expr = resolveSelector(selectors, step.selector);
          const timeout = step.ms && step.ms > 0 ? step.ms : 20_000;
          const state = step.state ?? 'visible';
          const loc = locateByExpr(page, expr);
          if (state === 'enabled') {
            // 1. 先等到可见，再等到可点击（知乎「开始导入」等依赖输入后才 enable）
            await loc.waitFor({ state: 'visible', timeout });
            const deadline = Date.now() + timeout;
            while (Date.now() < deadline) {
              if (await loc.isEnabled()) {
                break;
              }
              await new Promise<void>((resolve) => {
                setTimeout(resolve, 200);
              });
            }
            if (!(await loc.isEnabled())) {
              throw new Error(`等待可点击超时: ${step.selector}`);
            }
          } else if (state === 'hidden') {
            await loc.waitFor({ state: 'hidden', timeout });
          } else if (state === 'attached') {
            await loc.waitFor({ state: 'attached', timeout });
          } else {
            await loc.waitFor({ state: 'visible', timeout });
          }
          break;
        }
        case 'click': {
          const expr = resolveSelector(selectors, step.selector);
          const loc = locateByExpr(page, expr);
          await loc.click();
          break;
        }
        case 'fill': {
          const expr = resolveSelector(selectors, step.selector);
          const value = renderTemplate(step.value ?? '', runtimeVars);
          const loc = locateByExpr(page, expr);
          await loc.waitFor({ state: 'visible' });
          await loc.click();
          // 短文本逐字输入触发 React onChange；长标题用 fill 提速
          if (value.length > 48) {
            await loc.fill(value);
          } else {
            await loc.fill('');
            if (value.length > 0) {
              await loc.pressSequentially(value, { delay: 15 });
            }
          }
          break;
        }
        case 'insertText': {
          const expr = resolveSelector(selectors, step.selector);
          const value = renderTemplate(step.value ?? '', runtimeVars);
          const loc = locateByExpr(page, expr);
          await loc.click();
          await page.keyboard.insertText(value);
          break;
        }
        case 'press': {
          const key = step.key ?? 'Enter';
          if (step.selector) {
            const expr = resolveSelector(selectors, step.selector);
            await locateByExpr(page, expr).press(key);
          } else {
            await page.keyboard.press(key);
          }
          break;
        }
        case 'upload': {
          const expr = resolveSelector(selectors, step.selector);
          const file = renderTemplate(step.file ?? '', runtimeVars);
          await locateByExpr(page, expr).setInputFiles(file);
          break;
        }
        case 'select': {
          const expr = resolveSelector(selectors, step.selector);
          const option = renderTemplate(step.option ?? '', runtimeVars);
          await locateByExpr(page, expr).selectOption(option);
          break;
        }
        case 'sleep': {
          const ms = step.ms ?? 0;
          await new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
          });
          break;
        }
        case 'extract': {
          const expr = resolveSelector(selectors, step.selector);
          const loc = locateByExpr(page, expr);
          const as = step.as ?? 'value';
          let text: string;
          if (step.attr) {
            text = (await loc.getAttribute(step.attr)) ?? '';
          } else {
            text = (await loc.textContent()) ?? '';
          }
          extracted[as] = text.trim();
          runtimeVars[as] = extracted[as];
          break;
        }
        case 'currentUrl': {
          const as = step.as ?? 'currentUrl';
          extracted[as] = page.url();
          runtimeVars[as] = extracted[as];
          break;
        }
        default: {
          const unknown = step.action as string;
          throw new Error(`不支持的 flow 动作: ${unknown}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const screenshot = await maybeScreenshot(page, screenshotDir, i);
      const code = message.includes('selectors.json')
        ? SeedcastErrorCode.SELECTOR_MISS
        : message.toLowerCase().includes('timeout')
          ? SeedcastErrorCode.TIMEOUT
          : SeedcastErrorCode.SELECTOR_MISS;

      return {
        ok: false,
        extracted,
        error: {
          code,
          stepIndex: i,
          step: step.action,
          selector: step.selector,
          message,
          screenshot,
        },
      };
    }
  }

  return { ok: true, extracted };
}
