/**
 * 安装第三方本地插件到 dataDir/plugins
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { loadManifest, ManifestValidationError } from './loadManifest.js';

/**
 * 安装结果
 */
export interface InstallPluginResult {
  pluginId: string;
  name: string;
  version: string;
  targetDir: string;
  overwritten: boolean;
}

/**
 * 将本机插件目录复制到 ~/.seedcast/plugins/<id>
 *
 * @param input 数据根、源路径、是否覆盖
 * @returns 安装结果
 * @throws Error 校验失败
 * @author Seedcast
 * @date 2026-11-21
 */
export function installLocalPlugin(input: {
  dataDir: string;
  sourcePath: string;
  overwrite?: boolean;
}): InstallPluginResult {
  const source = resolve(input.sourcePath.trim());
  if (!existsSync(source) || !statSync(source).isDirectory()) {
    throw new Error(`源路径不是目录: ${source}`);
  }
  if (!existsSync(join(source, 'manifest.json'))) {
    throw new Error('源目录缺少 manifest.json');
  }

  // 1. 校验契约
  let manifest;
  try {
    manifest = loadManifest(source);
  } catch (err) {
    if (err instanceof ManifestValidationError) {
      throw new Error(`manifest 无效: ${err.message}`);
    }
    throw err;
  }

  // 2. 目标目录
  const pluginsRoot = join(input.dataDir, 'plugins');
  mkdirSync(pluginsRoot, { recursive: true });
  const targetDir = join(pluginsRoot, manifest.id);
  const exists = existsSync(targetDir);
  if (exists && !input.overwrite) {
    throw new Error(
      `插件 ${manifest.id} 已安装。如需覆盖请确认 overwrite。`,
    );
  }

  // 3. 复制（先清空再整目录拷）
  if (exists) {
    rmSync(targetDir, { recursive: true, force: true });
  }
  mkdirSync(targetDir, { recursive: true });
  for (const name of readdirSync(source)) {
    if (name === 'node_modules' || name === '.git') {
      continue;
    }
    cpSync(join(source, name), join(targetDir, name), { recursive: true });
  }

  // 4. 再校验目标
  loadManifest(targetDir);

  return {
    pluginId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    targetDir,
    overwritten: exists,
  };
}
