/**
 * 发布配置模板 CRUD（按插件保存 schema settings）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { randomUUID } from 'node:crypto';
import type { SeedcastDatabase } from './database.js';

/**
 * 发布配置模板
 */
export interface SettingTemplate {
  id: string;
  pluginId: string;
  name: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface TemplateRow {
  id: string;
  plugin_id: string;
  name: string;
  settings_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * 行转模板
 *
 * @param row 数据库行
 * @returns 模板
 */
function rowToTemplate(row: TemplateRow): SettingTemplate {
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(row.settings_json) as Record<string, unknown>;
  } catch {
    settings = {};
  }
  return {
    id: row.id,
    pluginId: row.plugin_id,
    name: row.name,
    settings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 列出模板（可按插件过滤）
 *
 * @param db 数据库
 * @param pluginId 可选插件 ID
 * @returns 模板列表
 * @author Seedcast
 * @date 2026-11-21
 */
export function listSettingTemplates(
  db: SeedcastDatabase,
  pluginId?: string,
): SettingTemplate[] {
  if (pluginId) {
    const rows = db
      .prepare(
        `SELECT id, plugin_id, name, settings_json, created_at, updated_at
         FROM setting_templates WHERE plugin_id = ?
         ORDER BY updated_at DESC`,
      )
      .all(pluginId) as TemplateRow[];
    return rows.map(rowToTemplate);
  }
  const rows = db
    .prepare(
      `SELECT id, plugin_id, name, settings_json, created_at, updated_at
       FROM setting_templates ORDER BY plugin_id ASC, updated_at DESC`,
    )
    .all() as TemplateRow[];
  return rows.map(rowToTemplate);
}

/**
 * 按 ID 取模板
 *
 * @param db 数据库
 * @param id 模板 ID
 * @returns 模板或 null
 */
export function getSettingTemplate(
  db: SeedcastDatabase,
  id: string,
): SettingTemplate | null {
  const row = db
    .prepare(
      `SELECT id, plugin_id, name, settings_json, created_at, updated_at
       FROM setting_templates WHERE id = ?`,
    )
    .get(id) as TemplateRow | undefined;
  if (!row) {
    return null;
  }
  return rowToTemplate(row);
}

/**
 * 创建模板
 *
 * @param db 数据库
 * @param input 字段
 * @returns 新建模板
 */
export function createSettingTemplate(
  db: SeedcastDatabase,
  input: {
    pluginId: string;
    name: string;
    settings: Record<string, unknown>;
  },
): SettingTemplate {
  const now = new Date().toISOString();
  const tpl: SettingTemplate = {
    id: randomUUID(),
    pluginId: input.pluginId,
    name: input.name.trim(),
    settings: input.settings,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO setting_templates
     (id, plugin_id, name, settings_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    tpl.id,
    tpl.pluginId,
    tpl.name,
    JSON.stringify(tpl.settings),
    tpl.createdAt,
    tpl.updatedAt,
  );
  return tpl;
}

/**
 * 更新模板
 *
 * @param db 数据库
 * @param id 模板 ID
 * @param patch 可更新字段
 * @returns 更新后模板；不存在返回 null
 */
export function updateSettingTemplate(
  db: SeedcastDatabase,
  id: string,
  patch: { name?: string; settings?: Record<string, unknown> },
): SettingTemplate | null {
  const existing = getSettingTemplate(db, id);
  if (!existing) {
    return null;
  }
  const next: SettingTemplate = {
    ...existing,
    name: patch.name?.trim() || existing.name,
    settings: patch.settings ?? existing.settings,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE setting_templates
     SET name = ?, settings_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(next.name, JSON.stringify(next.settings), next.updatedAt, id);
  return next;
}

/**
 * 删除模板
 *
 * @param db 数据库
 * @param id 模板 ID
 * @returns 是否删除
 */
export function deleteSettingTemplate(
  db: SeedcastDatabase,
  id: string,
): boolean {
  const result = db
    .prepare(`DELETE FROM setting_templates WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}
