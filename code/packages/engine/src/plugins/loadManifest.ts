/**
 * 读取并校验插件 manifest.json
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENGINE_API_VERSION,
  SeedcastErrorCode,
  type AdapterKind,
  type ContentType,
  type PluginManifest,
} from '@seedcast/shared';

/**
 * manifest 校验失败
 */
export class ManifestValidationError extends Error {
  /** 结构化错误码 */
  readonly code: SeedcastErrorCode;

  /**
   * @param message 可读消息
   * @param code 错误码
   */
  constructor(
    message: string,
    code: SeedcastErrorCode = SeedcastErrorCode.VALIDATION,
  ) {
    super(message);
    this.name = 'ManifestValidationError';
    this.code = code;
  }
}

/**
 * 从插件目录加载 manifest
 *
 * @param pluginDir 插件根目录
 * @returns 校验后的 manifest
 * @throws ManifestValidationError 文件缺失或字段非法
 * @author Seedcast
 * @date 2026-11-21
 */
export function loadManifest(pluginDir: string): PluginManifest {
  const manifestPath = join(pluginDir, 'manifest.json');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  } catch {
    throw new ManifestValidationError(
      `无法读取 manifest: ${manifestPath}`,
      SeedcastErrorCode.PLUGIN_NOT_FOUND,
    );
  }

  return validateManifest(raw, pluginDir);
}

/**
 * 校验 manifest 对象结构与 apiVersion 兼容性
 *
 * @param raw 原始 JSON
 * @param pluginDir 用于错误信息
 * @returns PluginManifest
 * @author Seedcast
 * @date 2026-11-21
 */
export function validateManifest(raw: unknown, pluginDir: string): PluginManifest {
  if (!raw || typeof raw !== 'object') {
    throw new ManifestValidationError(`manifest 不是对象: ${pluginDir}`);
  }

  const m = raw as Record<string, unknown>;

  // 1. 必填标量
  const id = requireString(m, 'id', pluginDir);
  const name = requireString(m, 'name', pluginDir);
  const version = requireString(m, 'version', pluginDir);
  const apiVersion = requireNumber(m, 'apiVersion', pluginDir);
  const adapter = requireString(m, 'adapter', pluginDir) as AdapterKind;

  if (adapter !== 'flow' && adapter !== 'code') {
    throw new ManifestValidationError(
      `adapter 非法（期望 flow|code）: ${pluginDir}`,
    );
  }

  // 2. apiVersion 兼容
  if (apiVersion !== ENGINE_API_VERSION) {
    throw new ManifestValidationError(
      `插件 ${id} apiVersion=${apiVersion} 与引擎 ${ENGINE_API_VERSION} 不兼容`,
      SeedcastErrorCode.PLUGIN_API_INCOMPATIBLE,
    );
  }

  // 3. contentTypes
  if (!Array.isArray(m.contentTypes) || m.contentTypes.length === 0) {
    throw new ManifestValidationError(`contentTypes 必填: ${pluginDir}`);
  }
  const contentTypes = m.contentTypes as ContentType[];

  // 4. platform
  if (!m.platform || typeof m.platform !== 'object') {
    throw new ManifestValidationError(`platform 必填: ${pluginDir}`);
  }
  const platformRaw = m.platform as Record<string, unknown>;
  const home = requireString(platformRaw, 'home', `${pluginDir}/platform`);
  const loginUrl = requireString(platformRaw, 'loginUrl', `${pluginDir}/platform`);

  const manifest: PluginManifest = {
    id,
    name,
    version,
    apiVersion,
    adapter,
    contentTypes,
    platform: { home, loginUrl },
  };

  // 5. 可选 sessionCheck
  if (platformRaw.sessionCheck && typeof platformRaw.sessionCheck === 'object') {
    const sc = platformRaw.sessionCheck as Record<string, unknown>;
    manifest.platform.sessionCheck = {
      url: requireString(sc, 'url', `${pluginDir}/sessionCheck`),
      loggedInSelector: requireString(
        sc,
        'loggedInSelector',
        `${pluginDir}/sessionCheck`,
      ),
      loggedInCookie:
        typeof sc.loggedInCookie === 'string' && sc.loggedInCookie.trim()
          ? sc.loggedInCookie.trim()
          : undefined,
      timeoutMs:
        typeof sc.timeoutMs === 'number' ? sc.timeoutMs : undefined,
    };
  }

  // 6. 可选 capabilities / entry
  if (m.capabilities && typeof m.capabilities === 'object') {
    const cap = m.capabilities as Record<string, unknown>;
    const parseIdLabelList = (
      raw: unknown,
    ): Array<{ id: string; label: string }> => {
      const list: Array<{ id: string; label: string }> = [];
      if (!Array.isArray(raw)) {
        return list;
      }
      for (const item of raw) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const row = item as Record<string, unknown>;
        if (typeof row.id === 'string' && typeof row.label === 'string') {
          list.push({ id: row.id, label: row.label });
        }
      }
      return list;
    };
    const publishTypes = parseIdLabelList(cap.publishTypes);
    const articleImportModes = parseIdLabelList(cap.articleImportModes);
    manifest.capabilities = {
      draft: Boolean(cap.draft),
      nativeSchedule: Boolean(cap.nativeSchedule),
      ...(publishTypes.length > 0 ? { publishTypes } : {}),
      ...(articleImportModes.length > 0 ? { articleImportModes } : {}),
    };
  }

  if (typeof m.entry === 'string') {
    manifest.entry = m.entry;
  }

  if (adapter === 'code' && !manifest.entry) {
    throw new ManifestValidationError(
      `adapter=code 时 entry 必填: ${pluginDir}`,
    );
  }

  return manifest;
}

/**
 * 读取必填字符串字段
 *
 * @param obj 对象
 * @param key 键
 * @param ctx 错误上下文
 * @returns 字符串值
 */
function requireString(
  obj: Record<string, unknown>,
  key: string,
  ctx: string,
): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new ManifestValidationError(`${key} 必填字符串: ${ctx}`);
  }
  return v;
}

/**
 * 读取必填数字字段
 *
 * @param obj 对象
 * @param key 键
 * @param ctx 错误上下文
 * @returns 数字值
 */
function requireNumber(
  obj: Record<string, unknown>,
  key: string,
  ctx: string,
): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ManifestValidationError(`${key} 必填数字: ${ctx}`);
  }
  return v;
}
