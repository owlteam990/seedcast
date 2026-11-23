/**
 * 公众号凭证 — 复用 @seedcast/publish-core
 *
 * @author Seedcast
 * @date 2026-11-23
 */

export {
  WECHAT_CREDENTIALS_FILE,
  WECHAT_TOKEN_CACHE_PREFIX,
  readWechatCredentials,
  writeWechatCredentials,
  looksLikeWechatAppId,
  tokenCachePath,
  type WechatCredentials,
} from '@seedcast/publish-core';
