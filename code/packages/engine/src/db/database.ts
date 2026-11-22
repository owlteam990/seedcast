/**
 * SQLite 数据库打开与迁移
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { DB_RELATIVE_PATH } from '@seedcast/shared';
import { ensureDataDirs, getDefaultDataDir } from '../paths.js';
import { MIGRATIONS } from './migrations.js';

export type SeedcastDatabase = Database.Database;

/**
 * 打开（或创建）业务库并执行待迁移
 *
 * @param dataDir 数据根目录
 * @returns better-sqlite3 Database 实例
 * @author Seedcast
 * @date 2026-11-21
 */
export function openDatabase(dataDir: string = getDefaultDataDir()): SeedcastDatabase {
  // 1. 确保目录并打开库文件
  ensureDataDirs(dataDir);
  const dbPath = join(dataDir, DB_RELATIVE_PATH);
  const db = new Database(dbPath);

  // 2. 基础 PRAGMA
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 3. 跑迁移
  migrate(db);

  return db;
}

/**
 * 读取当前已应用的最大 schema 版本
 *
 * @param db 数据库
 * @returns 版本号，无表或无记录时为 0
 * @author Seedcast
 * @date 2026-11-21
 */
function getCurrentVersion(db: SeedcastDatabase): number {
  // schema_version 表可能尚未创建
  const row = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'`,
    )
    .get() as { name: string } | undefined;

  if (!row) {
    return 0;
  }

  const ver = db
    .prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM schema_version`)
    .get() as { v: number };
  return ver.v;
}

/**
 * 按序应用未执行的迁移
 *
 * @param db 数据库
 * @author Seedcast
 * @date 2026-11-21
 */
export function migrate(db: SeedcastDatabase): void {
  const current = getCurrentVersion(db);
  const pending = MIGRATIONS.filter((m) => {
    return m.version > current;
  }).sort((a, b) => {
    return a.version - b.version;
  });

  if (pending.length === 0) {
    return;
  }

  const applyOne = db.transaction((version: number, statements: string[]) => {
    for (const sql of statements) {
      db.exec(sql);
    }
    db.prepare(
      `INSERT INTO schema_version (version, applied_at) VALUES (?, ?)`,
    ).run(version, new Date().toISOString());
  });

  for (const migration of pending) {
    applyOne(migration.version, migration.statements);
  }
}

/**
 * 查询当前 schema 版本（供 /ping 暴露）
 *
 * @param db 数据库
 * @returns 当前版本
 * @author Seedcast
 * @date 2026-11-21
 */
export function getSchemaVersion(db: SeedcastDatabase): number {
  return getCurrentVersion(db);
}
