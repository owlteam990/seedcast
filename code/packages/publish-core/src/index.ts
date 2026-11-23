/**
 * @seedcast/publish-core — Skill / 引擎共用发布核心
 *
 * 首期：微信公众号草稿。数据目录默认复用 ~/.seedcast。
 *
 * @author Seedcast
 * @date 2026-11-23
 */

export {
  getDefaultDataDir,
  ensureDataDirs,
  resolveProfileDir,
} from './paths.js';

export {
  listAccounts,
  getAccount,
  createAccount,
  updateAccountStatus,
  updateAccount,
  deleteAccount,
  registerAccount,
  openAccountsDb,
  type AccountRecord,
  type AccountStatus,
} from './db/accounts.js';

export {
  RECORDABLE_PLATFORMS,
  isRecordablePlatform,
  type RecordablePlatform,
} from './platforms.js';

export {
  WECHAT_PLUGIN_ID,
  bindWechatMpAccount,
  checkWechatMpSession,
  updateWechatMpCredentials,
} from './wechat/bind.js';

export {
  publishWechatMpDraft,
  type WechatPublishInput,
  type WechatPublishResult,
} from './wechat/publish.js';

export {
  WECHAT_CREDENTIALS_FILE,
  WECHAT_TOKEN_CACHE_PREFIX,
  readWechatCredentials,
  writeWechatCredentials,
  looksLikeWechatAppId,
  tokenCachePath,
  type WechatCredentials,
} from './wechat/credentials.js';

export {
  WechatApiError,
  getAccessToken,
  uploadImage,
  createDraft,
  getDraft,
} from './wechat/client.js';

export {
  markdownToWechatHtml,
  sanitizeWechatHtml,
} from './wechat/markdownHtml.js';

export {
  truncateByBytes,
  truncateTitle,
  WECHAT_MAX_TITLE_CHARS,
  WECHAT_MAX_AUTHOR_BYTES,
  WECHAT_MAX_DIGEST_BYTES,
} from './wechat/truncate.js';

export { markdownToSimpleHtml } from './markdown/simpleHtml.js';

export {
  withProfileCookieSession,
  formatCookieHeader,
} from './http/cookieSession.js';

export {
  openAccountContext,
  closeProfileContext,
} from './session/chromeProfile.js';

export {
  PLATFORM_LOGIN_URLS,
  openPlatformLogin,
  closeLoginBrowser,
} from './session/openLogin.js';

export {
  publishCsdnDraft,
  type CsdnPublishInput,
  type CsdnPublishResult,
} from './csdn/publish.js';

export { checkCsdnSession } from './csdn/checkSession.js';

export {
  CSDN_EDITOR_ORIGIN,
  CSDN_BIZ_API,
  CSDN_HOME,
  csdnDraftUrl,
  getCsdnBaseInfo,
  saveCsdnArticleDraft,
  signCsdnRequest,
  type CookieFetch,
} from './csdn/client.js';

export {
  publishJianshuDraft,
  type JianshuPublishInput,
  type JianshuPublishResult,
} from './jianshu/publish.js';

export { checkJianshuSession } from './jianshu/checkSession.js';

export {
  JIANSHU_ORIGIN,
  getJianshuBasicSettings,
  listJianshuNotebooks,
  createJianshuNote,
  updateJianshuNote,
  jianshuDraftUrl,
  type JianshuNotebook,
} from './jianshu/client.js';

export {
  publishBaijiahaoDraft,
  type BaijiahaoPublishInput,
  type BaijiahaoPublishResult,
} from './baijiahao/publish.js';

export { checkBaijiahaoSession } from './baijiahao/checkSession.js';

export {
  BAIJIAHAO_ORIGIN,
  getBaijiahaoAppInfo,
  fetchBaijiahaoAuthToken,
  saveBaijiahaoArticleDraft,
  baijiahaoDraftUrl,
} from './baijiahao/client.js';

export {
  publishToutiaoDraft,
  type ToutiaoPublishInput,
  type ToutiaoPublishResult,
} from './toutiao/publish.js';

export { checkToutiaoSession } from './toutiao/checkSession.js';

export {
  TOUTIAO_MP_ORIGIN,
  TOUTIAO_MP_HOME,
  TOUTIAO_ARTICLE_EDITOR,
  TOUTIAO_GRAPHIC_PUBLISH,
  TOUTIAO_UPLOAD_PICTURE,
  detectToutiaoLoginFromLanding,
  getToutiaoMediaInfo,
  normalizeToutiaoPgcId,
  uploadToutiaoCover,
  saveToutiaoArticleDraft,
  toutiaoDraftUrl,
} from './toutiao/client.js';

export {
  publishXhsDraft,
  type XhsPublishInput,
  type XhsPublishResult,
} from './xiaohongshu/publish.js';

export { checkXhsSession } from './xiaohongshu/checkSession.js';

export {
  XHS_CREATOR_ORIGIN,
  XHS_CREATOR_HOME,
  XHS_PUBLISH_IMAGE_URL,
  XHS_PUBLISH_ARTICLE_URL,
  getXhsPersonalInfo,
  type XhsUserInfo,
} from './xiaohongshu/client.js';

export {
  XHS_IMAGE_MAX,
  isXhsLocalImageRef,
  resolveXhsLocalImagePaths,
  resolveXhsPublishMode,
  validateXhsImages,
  type XhsPublishMode,
} from './xiaohongshu/images.js';

export {
  publishZhihuDraft,
  type ZhihuPublishInput,
  type ZhihuPublishResult,
} from './zhihu/publish.js';

export { checkZhihuSession } from './zhihu/checkSession.js';

export {
  ZHIHU_ORIGIN,
  ZHIHU_ZHUANLAN_ORIGIN,
  extractZhihuXsrf,
  getZhihuMe,
  createZhihuArticleDraft,
  updateZhihuArticleDraft,
  zhihuDraftUrl,
} from './zhihu/client.js';

export {
  publishWeiboDraft,
  type WeiboPublishInput,
  type WeiboPublishResult,
} from './weibo/publish.js';

export { checkWeiboSession } from './weibo/checkSession.js';

export {
  WEIBO_ARTICLE_ORIGIN,
  WEIBO_ARTICLE_EDITOR,
  parseWeiboEditorConfig,
  getWeiboUserConfig,
  createWeiboArticleDraft,
  saveWeiboArticleDraft,
  weiboDraftUrl,
  type WeiboUserConfig,
} from './weibo/client.js';

export {
  publishBilibiliDraft,
  type BilibiliPublishInput,
  type BilibiliPublishResult,
} from './bilibili/publish.js';

export { checkBilibiliSession } from './bilibili/checkSession.js';

export {
  BILIBILI_MEMBER_ORIGIN,
  BILIBILI_API_ORIGIN,
  BILIBILI_DEFAULT_TID,
  extractBilibiliCsrf,
  getBilibiliNav,
  saveBilibiliArticleDraft,
  bilibiliDraftUrl,
  type BilibiliNavInfo,
} from './bilibili/client.js';

export {
  publishDouyinDraft,
  type DouyinPublishInput,
  type DouyinPublishResult,
  type DouyinPublishMode,
} from './douyin/publish.js';

export { checkDouyinSession } from './douyin/checkSession.js';

export {
  DOUYIN_CREATOR_ORIGIN,
  DOUYIN_ARTICLE_EDITOR,
  DOUYIN_UPLOAD_PAGE,
  getDouyinUserInfo,
  type DouyinUserInfo,
} from './douyin/client.js';

export {
  X_PLUGIN_ID,
  bindXAccount,
  checkXSession,
} from './x/bind.js';

export {
  publishXPost,
  type XPublishInput,
  type XPublishResult,
} from './x/publish.js';

export {
  X_CREDENTIALS_FILE,
  readXCredentials,
  writeXCredentials,
  type XCredentials,
} from './x/credentials.js';

export {
  X_API_ORIGIN,
  buildOAuth1Header,
  getXUserMe,
  createXPost,
  xPostUrl,
  buildXPostText,
  type XUserMe,
} from './x/client.js';

export {
  YOUTUBE_PLUGIN_ID,
  bindYouTubeAccount,
  checkYouTubeSession,
} from './youtube/bind.js';

export {
  publishYouTubeDraft,
  type YouTubePublishInput,
  type YouTubePublishResult,
} from './youtube/publish.js';

export {
  YOUTUBE_CREDENTIALS_FILE,
  YOUTUBE_TOKEN_CACHE,
  readYouTubeCredentials,
  writeYouTubeCredentials,
  youtubeTokenCachePath,
  type YouTubeCredentials,
} from './youtube/credentials.js';

export {
  YOUTUBE_API_ORIGIN,
  getYouTubeAccessToken,
  getYouTubeMyChannel,
  uploadYouTubeVideo,
  youtubeVideoUrl,
  type YouTubeChannelInfo,
} from './youtube/client.js';

export {
  CNBLOGS_PLUGIN_ID,
  bindCnblogsAccount,
  checkCnblogsMetaWeblog,
} from './cnblogs/bind.js';

export { checkCnblogsSession } from './cnblogs/checkSession.js';

export {
  publishCnblogsDraft,
  type CnblogsPublishInput,
  type CnblogsPublishResult,
} from './cnblogs/publish.js';

export {
  CNBLOGS_CREDENTIALS_FILE,
  readCnblogsCredentials,
  writeCnblogsCredentials,
  type CnblogsCredentials,
} from './cnblogs/credentials.js';

export {
  CNBLOGS_RPC_ORIGIN,
  cnblogsMetaWeblogEndpoint,
  cnblogsDraftEditUrl,
  cnblogsPostUrl,
  getCnblogsUsersBlogs,
  createCnblogsPost,
  type CnblogsBlogInfo,
} from './cnblogs/client.js';

export {
  CNBLOGS_ACCOUNT_ORIGIN,
  CNBLOGS_I_ORIGIN,
  getCnblogsUserInfo,
  createCnblogsWebDraft,
  extractCnblogsXsrfToken,
  type CnblogsUserInfo,
} from './cnblogs/webClient.js';

/** 当前 publish-core 已支持发布的平台 */
export const SUPPORTED_PLATFORMS = [
  'wechat-mp',
  'csdn',
  'jianshu',
  'baijiahao',
  'toutiao',
  'xiaohongshu',
  'zhihu',
  'weibo',
  'bilibili',
  'douyin',
  'x',
  'youtube',
  'cnblogs',
] as const;
