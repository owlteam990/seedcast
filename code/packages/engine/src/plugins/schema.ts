/**
 * 读取插件 schema.json
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 加载插件设置 schema（缺失或非法时返回 null）
 *
 * @param pluginDir 插件目录
 * @returns JSON Schema 对象或 null
 * @author Seedcast
 * @date 2026-11-21
 */
export function loadPluginSchema(pluginDir: string): Record<string, unknown> | null {
  const path = join(pluginDir, 'schema.json');
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}
