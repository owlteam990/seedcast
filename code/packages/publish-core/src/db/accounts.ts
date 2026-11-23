/**
 * 账号读写（复用 ~/.seedcast/db/seedcast.sqlite）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DB_RELATIVE_PATH } from '@seedcast/shared';
import {
  ensureDataDirs,
  getDefaultDataDir,
  resolveProfileDir,
} from '../paths.js';

export type AccountStatus = 'unknown' | 'logged_in' | 'expired';

export interface AccountRecord {
  id: string;
  pluginId: string;
  name: string;
  profileDir: string;
  lastCheckAt: string | null;
  status: AccountStatus;
}

type SqliteDb = Database.Database;

interface AccountRow {
  id: string;
  plugin_id: string;
  name: string;
  profile_dir: string;
  last_check_at: string | null;
  status: string;
}

/**
 * 打开业务库（若缺 accounts 表则建最小表，兼容已有桌面库）
 *
 * @param dataDir 数据根
 * @returns Database
 */
export function openAccountsDb(dataDir: string = getDefaultDataDir()): SqliteDb {
  ensureDataDirs(dataDir);
  const dbPath = join(dataDir, DB_RELATIVE_PATH);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT NOT NULL PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      name TEXT NOT NULL,
      profile_dir TEXT NOT NULL,
      last_check_at TEXT,
      status TEXT NOT NULL DEFAULT 'unknown'
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_plugin ON accounts(plugin_id);
  `);
  return db;
}

function rowToAccount(row: AccountRow): AccountRecord {
  const status = (['unknown', 'logged_in', 'expired'].includes(row.status)
    ? row.status
    : 'unknown') as AccountStatus;
  return {
    id: row.id,
    pluginId: row.plugin_id,
    name: row.name,
    profileDir: row.profile_dir,
    lastCheckAt: row.last_check_at,
    status,
  };
}

/**
 * 列出账号
 *
 * @param pluginId 可选插件过滤
 * @param dataDir 数据根
 * @returns 账号列表
 */
export function listAccounts(
  pluginId?: string,
  dataDir: string = getDefaultDataDir(),
): AccountRecord[] {
  const db = openAccountsDb(dataDir);
  try {
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
  } finally {
    db.close();
  }
}

/**
 * 按 ID 取账号
 *
 * @param id 账号 ID
 * @param dataDir 数据根
 * @returns 账号或 null
 */
export function getAccount(
  id: string,
  dataDir: string = getDefaultDataDir(),
): AccountRecord | null {
  const db = openAccountsDb(dataDir);
  try {
    const row = db
      .prepare(
        `SELECT id, plugin_id, name, profile_dir, last_check_at, status
         FROM accounts WHERE id = ?`,
      )
      .get(id) as AccountRow | undefined;
    return row ? rowToAccount(row) : null;
  } finally {
    db.close();
  }
}

/**
 * 插入账号
 *
 * @param input 字段
 * @param dataDir 数据根
 * @returns 新账号
 */
export function createAccount(
  input: {
    pluginId: string;
    name: string;
    profileDir: string;
    id?: string;
    status?: AccountStatus;
  },
  dataDir: string = getDefaultDataDir(),
): AccountRecord {
  const account: AccountRecord = {
    id: input.id ?? randomUUID(),
    pluginId: input.pluginId,
    name: input.name,
    profileDir: input.profileDir,
    lastCheckAt: null,
    status: input.status ?? 'unknown',
  };
  const db = openAccountsDb(dataDir);
  try {
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
  } finally {
    db.close();
  }
}

/**
 * 更新登录态
 *
 * @param id 账号 ID
 * @param status 状态
 * @param dataDir 数据根
 */
export function updateAccountStatus(
  id: string,
  status: AccountStatus,
  dataDir: string = getDefaultDataDir(),
): void {
  const db = openAccountsDb(dataDir);
  try {
    db.prepare(
      `UPDATE accounts SET status = ?, last_check_at = ? WHERE id = ?`,
    ).run(status, new Date().toISOString(), id);
  } finally {
    db.close();
  }
}

/**
 * 更新账号名称与/或状态
 *
 * @param id 账号 ID
 * @param patch 可改字段
 * @param dataDir 数据根
 * @returns 更新后账号
 */
export function updateAccount(
  id: string,
  patch: { name?: string; status?: AccountStatus },
  dataDir: string = getDefaultDataDir(),
): AccountRecord {
  const existing = getAccount(id, dataDir);
  if (!existing) {
    throw new Error(`账号不存在: ${id}`);
  }
  const name =
    typeof patch.name === 'string' && patch.name.trim()
      ? patch.name.trim()
      : existing.name;
  const status = patch.status ?? existing.status;
  const lastCheckAt =
    patch.status !== undefined ? new Date().toISOString() : existing.lastCheckAt;

  const db = openAccountsDb(dataDir);
  try {
    db.prepare(
      `UPDATE accounts SET name = ?, status = ?, last_check_at = ? WHERE id = ?`,
    ).run(name, status, lastCheckAt, id);
  } finally {
    db.close();
  }
  return {
    ...existing,
    name,
    status,
    lastCheckAt,
  };
}

/**
 * 删除账号记录；可选删除 profile 目录
 *
 * @param id 账号 ID
 * @param options purgeProfile 是否删 profile（默认 true）
 * @param dataDir 数据根
 * @returns 是否删到记录
 */
export function deleteAccount(
  id: string,
  options: { purgeProfile?: boolean } = {},
  dataDir: string = getDefaultDataDir(),
): boolean {
  const existing = getAccount(id, dataDir);
  if (!existing) {
    return false;
  }
  const purgeProfile = options.purgeProfile !== false;
  const db = openAccountsDb(dataDir);
  try {
    db.prepare(`DELETE FROM accounts WHERE id = ?`).run(id);
  } finally {
    db.close();
  }
  if (purgeProfile && existing.profileDir) {
    try {
      rmSync(existing.profileDir, { recursive: true, force: true });
    } catch {
      // 目录占用或权限：记录已删，目录残留可人工清理
    }
  }
  return true;
}

/**
 * 登记平台账号（创建 profile 目录 + 写入 SQLite）
 * 浏览器扫码类平台登记后 status=unknown，需在桌面完成登录；
 * 公众号请用 bindWechatMpAccount。
 *
 * @param input 平台与名称
 * @param dataDir 数据根
 * @returns 新账号
 */
export function registerAccount(
  input: {
    pluginId: string;
    name: string;
    status?: AccountStatus;
  },
  dataDir: string = getDefaultDataDir(),
): AccountRecord {
  const pluginId = input.pluginId.trim();
  const name = input.name.trim();
  if (!pluginId) {
    throw new Error('pluginId 不能为空');
  }
  if (!name) {
    throw new Error('账号名称不能为空');
  }
  ensureDataDirs(dataDir);
  const id = randomUUID();
  const profileDir = resolveProfileDir(dataDir, pluginId, id);
  mkdirSync(profileDir, { recursive: true });
  return createAccount(
    {
      id,
      pluginId,
      name,
      profileDir,
      status: input.status ?? 'unknown',
    },
    dataDir,
  );
}
