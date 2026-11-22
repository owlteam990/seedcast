/**
 * 任务与回执持久化
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { randomUUID } from 'node:crypto';
import type { PublishTarget, Receipt, Task, TaskStatus } from '@seedcast/shared';
import type { SeedcastDatabase } from './database.js';

/**
 * 创建发布任务
 *
 * @param db 数据库
 * @param contentId 内容 ID
 * @param targets 目标列表
 * @returns 任务
 * @author Seedcast
 * @date 2026-11-21
 */
export function createTask(
  db: SeedcastDatabase,
  contentId: string,
  targets: PublishTarget[],
): Task {
  const task: Task = {
    id: randomUUID(),
    contentId,
    targets,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO tasks (id, content_id, targets_json, status, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    task.id,
    task.contentId,
    JSON.stringify(task.targets),
    task.status,
    task.createdAt,
  );
  return task;
}

/**
 * 更新任务状态
 *
 * @param db 数据库
 * @param taskId 任务 ID
 * @param status 新状态
 * @author Seedcast
 * @date 2026-11-21
 */
export function updateTaskStatus(
  db: SeedcastDatabase,
  taskId: string,
  status: TaskStatus,
): void {
  db.prepare(`UPDATE tasks SET status = ? WHERE id = ?`).run(status, taskId);
}

/**
 * 写入回执
 *
 * @param db 数据库
 * @param receipt 回执
 * @author Seedcast
 * @date 2026-11-21
 */
export function insertReceipt(db: SeedcastDatabase, receipt: Receipt): void {
  db.prepare(
    `INSERT INTO receipts (task_id, target_json, ok, url, error_json, at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    receipt.taskId,
    JSON.stringify(receipt.target),
    receipt.ok ? 1 : 0,
    receipt.url ?? null,
    receipt.error ? JSON.stringify(receipt.error) : null,
    receipt.at,
  );
}

/**
 * 列出任务及回执（发布记录）
 *
 * @param db 数据库
 * @param options 条数与筛选
 * @returns 记录列表（含内容标题）
 * @author Seedcast
 * @date 2026-11-21
 */
export function listRecords(
  db: SeedcastDatabase,
  options: {
    limit?: number;
    pluginId?: string;
    /** true=仅有失败；false=仅全部成功；缺省不过滤 */
    failedOnly?: boolean;
  } = {},
): Array<{
  task: Task;
  receipts: Receipt[];
  contentTitle: string | null;
}> {
  const limit = options.limit ?? 50;
  const taskRows = db
    .prepare(
      `SELECT id, content_id, targets_json, status, created_at
       FROM tasks ORDER BY created_at DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(limit * 3, limit), 500)) as Array<{
    id: string;
    content_id: string;
    targets_json: string;
    status: TaskStatus;
    created_at: string;
  }>;

  const titleStmt = db.prepare(`SELECT title FROM contents WHERE id = ?`);
  const out: Array<{
    task: Task;
    receipts: Receipt[];
    contentTitle: string | null;
  }> = [];

  for (const row of taskRows) {
    const task: Task = {
      id: row.id,
      contentId: row.content_id,
      targets: JSON.parse(row.targets_json) as PublishTarget[],
      status: row.status,
      createdAt: row.created_at,
    };
    const receiptRows = db
      .prepare(
        `SELECT task_id, target_json, ok, url, error_json, at
         FROM receipts WHERE task_id = ? ORDER BY id ASC`,
      )
      .all(task.id) as Array<{
      task_id: string;
      target_json: string;
      ok: number;
      url: string | null;
      error_json: string | null;
      at: string;
    }>;
    let receipts: Receipt[] = receiptRows.map((r) => {
      return {
        taskId: r.task_id,
        target: JSON.parse(r.target_json) as PublishTarget,
        ok: r.ok === 1,
        url: r.url ?? undefined,
        error: r.error_json
          ? (JSON.parse(r.error_json) as Receipt['error'])
          : undefined,
        at: r.at,
      };
    });

    // 按插件筛选回执；若筛空则跳过整条任务
    if (options.pluginId) {
      receipts = receipts.filter((r) => {
        return r.target.pluginId === options.pluginId;
      });
      if (receipts.length === 0) {
        continue;
      }
    }

    const hasFail = receipts.some((r) => {
      return !r.ok;
    });
    const allOk =
      receipts.length > 0 &&
      receipts.every((r) => {
        return r.ok;
      });
    if (options.failedOnly === true && !hasFail) {
      continue;
    }
    if (options.failedOnly === false && !allOk) {
      continue;
    }

    const titleRow = titleStmt.get(task.contentId) as
      | { title: string }
      | undefined;
    out.push({
      task,
      receipts,
      contentTitle: titleRow?.title ?? null,
    });
    if (out.length >= limit) {
      break;
    }
  }

  return out;
}
