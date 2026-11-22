/**
 * SQLite schema 迁移定义
 *
 * @author Seedcast
 * @date 2026-11-21
 */

/**
 * 单次迁移
 */
export interface Migration {
  /** 目标 schema 版本（整数递增） */
  version: number;
  /** 迁移说明 */
  description: string;
  /** DDL / DML 语句列表（按序执行） */
  statements: string[];
}

/**
 * 迁移列表（按 version 升序）
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: '初始表：schema_version / contents / accounts / tasks / receipts / plugins',
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS contents (
        id TEXT NOT NULL PRIMARY KEY,
        title TEXT NOT NULL,
        markdown TEXT NOT NULL,
        assets_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS accounts (
        id TEXT NOT NULL PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        name TEXT NOT NULL,
        profile_dir TEXT NOT NULL,
        last_check_at TEXT,
        status TEXT NOT NULL DEFAULT 'unknown'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_accounts_plugin ON accounts(plugin_id)`,
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT NOT NULL PRIMARY KEY,
        content_id TEXT NOT NULL,
        targets_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
      `CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        target_json TEXT NOT NULL,
        ok INTEGER NOT NULL,
        url TEXT,
        error_json TEXT,
        at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_receipts_task ON receipts(task_id)`,
      `CREATE TABLE IF NOT EXISTS plugins (
        id TEXT NOT NULL PRIMARY KEY,
        dir TEXT NOT NULL,
        source TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        manifest_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    description: '发布配置模板 setting_templates（FR-G7）',
    statements: [
      `CREATE TABLE IF NOT EXISTS setting_templates (
        id TEXT NOT NULL PRIMARY KEY,
        plugin_id TEXT NOT NULL,
        name TEXT NOT NULL,
        settings_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_setting_templates_plugin
       ON setting_templates(plugin_id)`,
    ],
  },
  {
    version: 3,
    description: 'contents.content_type：article / imageText 等',
    statements: [
      `ALTER TABLE contents ADD COLUMN content_type TEXT NOT NULL DEFAULT 'article'`,
      `CREATE INDEX IF NOT EXISTS idx_contents_type ON contents(content_type)`,
    ],
  },
];
