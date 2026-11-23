/**
 * 小红书图文本地图片解析
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

/** 图文最多张数 */
export const XHS_IMAGE_MAX = 9;

/**
 * 是否像图片素材引用（本地文件名/路径）
 *
 * @param asset 素材引用
 * @returns 是否图片扩展名且非 http(s)
 */
export function isXhsLocalImageRef(asset: string): boolean {
  if (!asset || /^https?:\/\//i.test(asset)) {
    return false;
  }
  return /\.(png|jpe?g|webp|gif)$/i.test(asset);
}

/**
 * 解析可用的本地图片绝对路径
 *
 * @param assets 素材路径列表
 * @returns 本地绝对路径（最多 9 张）
 */
export function resolveXhsLocalImagePaths(assets: string[] = []): string[] {
  const out: string[] = [];
  const dataAssets = join(homedir(), '.seedcast', 'assets');
  for (const asset of assets) {
    if (!isXhsLocalImageRef(asset)) {
      continue;
    }
    const candidates = [
      asset,
      isAbsolute(asset) ? asset : join(dataAssets, asset),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        out.push(c);
        break;
      }
    }
  }
  return out.slice(0, XHS_IMAGE_MAX);
}

/**
 * 小红书发布形式
 */
export type XhsPublishMode = 'imageText' | 'article';

/**
 * 解析发布形式
 *
 * @param input 显式 mode / 是否有本地图
 * @returns 图文或长文
 */
export function resolveXhsPublishMode(input: {
  mode?: string;
  hasLocalImages?: boolean;
  preferArticle?: boolean;
}): XhsPublishMode {
  const raw = typeof input.mode === 'string' ? input.mode.trim() : '';
  if (raw === 'article' || raw === 'imageText') {
    return raw;
  }
  if (input.preferArticle) {
    return 'article';
  }
  if (input.hasLocalImages) {
    return 'imageText';
  }
  return 'article';
}

/**
 * 校验图文配图
 *
 * @param images 已解析本地图
 * @param mode 发布形式
 * @returns 错误文案；通过返回 null
 */
export function validateXhsImages(
  images: string[],
  mode: XhsPublishMode = 'imageText',
): string | null {
  if (mode !== 'imageText') {
    return null;
  }
  if (images.length === 0) {
    return '小红书图文至少需要 1 张本地图片（--images path1,path2）';
  }
  return null;
}
