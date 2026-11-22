/**
 * 内容库 CRUD（SQLite）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { randomUUID } from 'node:crypto';
import type { Content, ContentType } from '@seedcast/shared';
import type { SeedcastDatabase } from './database.js';

interface ContentRow {
  id: string;
  title: string;
  markdown: string;
  assets_json: string;
  created_at: string;
  updated_at: string;
  content_type?: string;
}

/**
 * 规范化内容类型
 *
 * @param raw 原始值
 * @returns ContentType
 */
function normalizeContentType(raw: string | undefined): ContentType {
  if (raw === 'imageText' || raw === 'video' || raw === 'audio') {
    return raw;
  }
  return 'article';
}

/**
 * 行转 Content
 *
 * @param row 数据库行
 * @returns Content
 */
function rowToContent(row: ContentRow): Content {
  let assets: string[] = [];
  try {
    assets = JSON.parse(row.assets_json) as string[];
  } catch {
    assets = [];
  }
  return {
    id: row.id,
    contentType: normalizeContentType(row.content_type),
    title: row.title,
    markdown: row.markdown,
    assets,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 列出全部内容（按更新时间倒序）
 *
 * @param db 数据库
 * @returns 内容列表
 * @author Seedcast
 * @date 2026-11-21
 */
export function listContents(db: SeedcastDatabase): Content[] {
  const rows = db
    .prepare(
      `SELECT id, title, markdown, assets_json, created_at, updated_at, content_type
       FROM contents ORDER BY updated_at DESC`,
    )
    .all() as ContentRow[];
  return rows.map(rowToContent);
}

/**
 * 按 ID 获取内容
 *
 * @param db 数据库
 * @param id 内容 ID
 * @returns 内容或 null
 * @author Seedcast
 * @date 2026-11-21
 */
export function getContent(db: SeedcastDatabase, id: string): Content | null {
  const row = db
    .prepare(
      `SELECT id, title, markdown, assets_json, created_at, updated_at, content_type
       FROM contents WHERE id = ?`,
    )
    .get(id) as ContentRow | undefined;
  if (!row) {
    return null;
  }
  return rowToContent(row);
}

/**
 * 创建内容
 *
 * @param db 数据库
 * @param input 标题与正文等
 * @returns 新建内容
 * @author Seedcast
 * @date 2026-11-21
 */
export function createContent(
  db: SeedcastDatabase,
  input: {
    title: string;
    markdown: string;
    assets?: string[];
    contentType?: ContentType;
  },
): Content {
  const now = new Date().toISOString();
  const content: Content = {
    id: randomUUID(),
    contentType: input.contentType ?? 'article',
    title: input.title,
    markdown: input.markdown,
    assets: input.assets ?? [],
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO contents (id, title, markdown, assets_json, created_at, updated_at, content_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    content.id,
    content.title,
    content.markdown,
    JSON.stringify(content.assets),
    content.createdAt,
    content.updatedAt,
    content.contentType,
  );
  return content;
}

/**
 * 更新内容
 *
 * @param db 数据库
 * @param id 内容 ID
 * @param patch 可更新字段
 * @returns 更新后内容；不存在返回 null
 * @author Seedcast
 * @date 2026-11-21
 */
export function updateContent(
  db: SeedcastDatabase,
  id: string,
  patch: {
    title?: string;
    markdown?: string;
    assets?: string[];
    contentType?: ContentType;
  },
): Content | null {
  const existing = getContent(db, id);
  if (!existing) {
    return null;
  }
  const next: Content = {
    ...existing,
    title: patch.title ?? existing.title,
    markdown: patch.markdown ?? existing.markdown,
    assets: patch.assets ?? existing.assets,
    contentType: patch.contentType ?? existing.contentType,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE contents SET title = ?, markdown = ?, assets_json = ?, updated_at = ?, content_type = ?
     WHERE id = ?`,
  ).run(
    next.title,
    next.markdown,
    JSON.stringify(next.assets),
    next.updatedAt,
    next.contentType,
    id,
  );
  return next;
}

/**
 * 删除内容
 *
 * @param db 数据库
 * @param id 内容 ID
 * @returns 是否删除成功
 * @author Seedcast
 * @date 2026-11-21
 */
export function deleteContent(db: SeedcastDatabase, id: string): boolean {
  const result = db.prepare(`DELETE FROM contents WHERE id = ?`).run(id);
  return result.changes > 0;
}
