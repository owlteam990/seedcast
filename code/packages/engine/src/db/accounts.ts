/**
 * 账号 CRUD（SQLite）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { randomUUID } from 'node:crypto';
import type { Account, AccountStatus } from '@seedcast/shared';
import type { SeedcastDatabase } from './database.js';

interface AccountRow {
  id: string;
  plugin_id: string;
  name: string;
  profile_dir: string;
  last_check_at: string | null;
  status: AccountStatus;
}

/**
 * 行转 Account
 *
 * @param row 数据库行
 * @returns Account
 */
function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    name: row.name,
    profileDir: row.profile_dir,
    lastCheckAt: row.last_check_at,
    status: row.status,
  };
}

/**
 * 列出账号（可按插件过滤）
 *
 * @param db 数据库
 * @param pluginId 可选插件 ID
 * @returns 账号列表
 * @author Seedcast
 * @date 2026-11-21
 */
export function listAccounts(
  db: SeedcastDatabase,
  pluginId?: string,
): Account[] {
  if (pluginId) {
    const rows = db
      .prepare(
        `SELECT id, plugin_id, name, profile_dir, last_check_at, status
         FROM accounts WHERE plugin_id = ? ORDER BY name ASC`,
      )
      .all(pluginId) as AccountRow[];
    return rows.map(rowToAccount);
  }
  const rows = db
    .prepare(
      `SELECT id, plugin_id, name, profile_dir, last_check_at, status
       FROM accounts ORDER BY plugin_id ASC, name ASC`,
    )
    .all() as AccountRow[];
  return rows.map(rowToAccount);
}

/**
 * 按 ID 获取账号
 *
 * @param db 数据库
 * @param id 账号 ID
 * @returns 账号或 null
 * @author Seedcast
 * @date 2026-11-21
 */
export function getAccount(db: SeedcastDatabase, id: string): Account | null {
  const row = db
    .prepare(
      `SELECT id, plugin_id, name, profile_dir, last_check_at, status
       FROM accounts WHERE id = ?`,
    )
    .get(id) as AccountRow | undefined;
  if (!row) {
    return null;
  }
  return rowToAccount(row);
}

/**
 * 创建账号记录
 *
 * @param db 数据库
 * @param input 插件、名称、profile 目录
 * @returns 新账号
 * @author Seedcast
 * @date 2026-11-21
 */
export function createAccount(
  db: SeedcastDatabase,
  input: {
    pluginId: string;
    name: string;
    profileDir: string;
    /** 可选预分配 ID（用于与 profile 目录对齐） */
    id?: string;
  },
): Account {
  const account: Account = {
    id: input.id ?? randomUUID(),
    pluginId: input.pluginId,
    name: input.name,
    profileDir: input.profileDir,
    lastCheckAt: null,
    status: 'unknown',
  };
  db.prepare(
    `INSERT INTO accounts (id, plugin_id, name, profile_dir, last_check_at, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    account.id,
    account.pluginId,
    account.name,
    account.profileDir,
    account.lastCheckAt,
    account.status,
  );
  return account;
}

/**
 * 更新账号登录态
 *
 * @param db 数据库
 * @param id 账号 ID
 * @param status 状态
 * @param lastCheckAt 检测时间
 * @author Seedcast
 * @date 2026-11-21
 */
export function updateAccountStatus(
  db: SeedcastDatabase,
  id: string,
  status: AccountStatus,
  lastCheckAt: string = new Date().toISOString(),
): void {
  db.prepare(
    `UPDATE accounts SET status = ?, last_check_at = ? WHERE id = ?`,
  ).run(status, lastCheckAt, id);
}

/**
 * 删除账号记录
 *
 * @param db 数据库
 * @param id 账号 ID
 * @returns 是否删除
 * @author Seedcast
 * @date 2026-11-21
 */
export function deleteAccount(db: SeedcastDatabase, id: string): boolean {
  const result = db.prepare(`DELETE FROM accounts WHERE id = ?`).run(id);
  return result.changes > 0;
}
