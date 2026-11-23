/**
 * CSDN 登录态 — 委托 @seedcast/publish-core
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import type { Account } from '@seedcast/shared';
import { checkCsdnSession as checkCore } from '@seedcast/publish-core';

/**
 * 检测 CSDN 账号 Cookie 是否仍有效
 *
 * @param account 账号
 * @returns 是否已登录
 */
export async function checkCsdnSession(account: Account): Promise<boolean> {
  return checkCore(account);
}
