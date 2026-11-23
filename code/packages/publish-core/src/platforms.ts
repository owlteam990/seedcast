/**
 * Skill / publish-core 可登记的平台 ID
 *
 * @author Seedcast
 * @date 2026-11-23
 */

/** 可写入 ~/.seedcast 账号表的平台（登记/编辑/删除） */
export const RECORDABLE_PLATFORMS = [
  'wechat-mp',
  'zhihu',
  'csdn',
  'jianshu',
  'baijiahao',
  'toutiao',
  'weibo',
  'douyin',
  'bilibili',
  'xiaohongshu',
  'x',
  'youtube',
  'cnblogs',
] as const;

export type RecordablePlatform = (typeof RECORDABLE_PLATFORMS)[number];

/**
 * 是否为可登记平台
 *
 * @param pluginId 插件 ID
 * @returns 是否合法
 */
export function isRecordablePlatform(pluginId: string): boolean {
  return (RECORDABLE_PLATFORMS as readonly string[]).includes(pluginId);
}
