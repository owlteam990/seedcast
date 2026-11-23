/**
 * 小红书图文素材 — 委托 @seedcast/publish-core（兼容 Content）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import type { Content } from '@seedcast/shared';
import {
  XHS_IMAGE_MAX,
  isXhsLocalImageRef,
  resolveXhsLocalImagePaths as resolvePaths,
  resolveXhsPublishMode as resolveMode,
  validateXhsImages as validateImages,
  type XhsPublishMode,
} from '@seedcast/publish-core';

export { XHS_IMAGE_MAX, isXhsLocalImageRef, type XhsPublishMode };

/**
 * 解析内容中可用的本地图片绝对路径
 *
 * @param content 内容
 * @returns 本地绝对路径
 */
export function resolveXhsLocalImagePaths(content: Content): string[] {
  return resolvePaths(content.assets ?? []);
}

/**
 * 解析发布形式：显式 settings > 内容类型推断
 *
 * @param content 内容
 * @param settings 发布设置
 * @returns 图文或长文
 */
export function resolveXhsPublishMode(
  content: Content,
  settings?: Record<string, unknown>,
): XhsPublishMode {
  const raw =
    typeof settings?.publishType === 'string'
      ? settings.publishType.trim()
      : '';
  if (raw === 'article' || raw === 'imageText') {
    return raw;
  }
  return resolveMode({
    preferArticle: content.contentType === 'article',
    hasLocalImages: resolvePaths(content.assets ?? []).length > 0,
  });
}

/**
 * 校验小红书发布前素材
 *
 * @param content 内容
 * @param mode 发布形式
 * @returns 错误文案；通过返回 null
 */
export function validateXhsImages(
  content: Content,
  mode: XhsPublishMode = 'imageText',
): string | null {
  return validateImages(resolveXhsLocalImagePaths(content), mode);
}
