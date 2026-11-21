/**
 * 结构化错误码（发布回执 / API 共用）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

/**
 * 发布与会话相关错误码
 */
export enum SeedcastErrorCode {
  /** 未知错误 */
  UNKNOWN = 'UNKNOWN',
  /** 登录态失效 */
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  /** 选择器未匹配 / 改版 */
  SELECTOR_MISS = 'SELECTOR_MISS',
  /** 步骤超时 */
  TIMEOUT = 'TIMEOUT',
  /** 平台拒绝（权限/审核等） */
  PLATFORM_REJECTED = 'PLATFORM_REJECTED',
  /** 插件 apiVersion 不兼容 */
  PLUGIN_API_INCOMPATIBLE = 'PLUGIN_API_INCOMPATIBLE',
  /** 插件未找到或未启用 */
  PLUGIN_NOT_FOUND = 'PLUGIN_NOT_FOUND',
  /** 参数 / settings 校验失败 */
  VALIDATION = 'VALIDATION',
}
