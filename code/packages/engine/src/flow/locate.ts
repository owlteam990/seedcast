/**
 * 选择器表达式定位（支持 ` | ` 备选）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { Locator, Page } from 'playwright';

/**
 * 将选择器表达式解析为 Locator。
 * 多个备选用 ` | ` 分隔（勿用逗号，避免与 CSS/text 引擎冲突）。
 *
 * @param page 页面
 * @param expr 选择器表达式
 * @returns Locator（已 .first()）
 */
export function locateByExpr(page: Page, expr: string): Locator {
  const parts = expr
    .split(/\s*\|\s*/)
    .map((p) => {
      return p.trim();
    })
    .filter((p) => {
      return p.length > 0;
    });
  if (parts.length === 0) {
    throw new Error('选择器表达式为空');
  }
  let loc = page.locator(parts[0]);
  for (let i = 1; i < parts.length; i += 1) {
    loc = loc.or(page.locator(parts[i]));
  }
  return loc.first();
}

/**
 * 等待登录态选择器可见（支持 ` | ` 备选）
 *
 * @param page 页面
 * @param expr 选择器表达式
 * @param timeoutMs 超时
 * @returns 是否在时限内可见
 */
export async function waitForLoggedInMarker(
  page: Page,
  expr: string,
  timeoutMs: number,
): Promise<boolean> {
  try {
    await locateByExpr(page, expr).waitFor({
      state: 'visible',
      timeout: timeoutMs,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 当前页是否已出现登录态标记（不导航、短超时）
 *
 * @param page 页面
 * @param expr 选择器表达式
 * @returns 是否可见
 */
export async function isLoggedInMarkerVisible(
  page: Page,
  expr: string,
): Promise<boolean> {
  return locateByExpr(page, expr)
    .isVisible()
    .catch(() => {
      return false;
    });
}
