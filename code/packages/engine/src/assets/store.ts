/**
 * 本地素材入库（粘贴图等）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

/**
 * MIME → 扩展名
 */
const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/**
 * 将 base64 素材写入 dataDir/assets
 *
 * @param dataDir 数据根
 * @param input mime 与 base64（可带 data: 前缀）
 * @returns 绝对路径与文件名
 * @author Seedcast
 * @date 2026-11-21
 */
export function saveAssetFromBase64(
  dataDir: string,
  input: { mime: string; dataBase64: string; filename?: string },
): { path: string; filename: string } {
  // 1. 规范化 mime / 扩展名
  const mime = (input.mime || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const fromName = input.filename ? extname(input.filename) : '';
  const ext = MIME_EXT[mime] || fromName || '.bin';
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  const filename = `${randomUUID()}${safeExt}`;

  // 2. 解码（去掉 data URL 前缀）
  let b64 = input.dataBase64.trim();
  const comma = b64.indexOf(',');
  if (b64.startsWith('data:') && comma >= 0) {
    b64 = b64.slice(comma + 1);
  }
  const buf = Buffer.from(b64, 'base64');
  if (buf.length === 0) {
    throw new Error('素材内容为空');
  }
  if (buf.length > 12 * 1024 * 1024) {
    throw new Error('素材过大（上限 12MB）');
  }

  // 3. 落盘
  const assetsDir = join(dataDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  const abs = join(assetsDir, filename);
  writeFileSync(abs, buf);
  return { path: abs, filename };
}

/**
 * 解析 assets 目录下的安全文件路径（禁止跳出）
 *
 * @param dataDir 数据根
 * @param filename 仅文件名
 * @returns 绝对路径；非法或不存在返回 null
 * @author Seedcast
 * @date 2026-11-21
 */
export function resolveAssetFile(
  dataDir: string,
  filename: string,
): string | null {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return null;
  }
  const abs = join(dataDir, 'assets', filename);
  if (!existsSync(abs)) {
    return null;
  }
  return abs;
}
