# 微信公众号插件

- 路线：官方 **草稿 API**（参考 `docs/微信公众号发布/WECHAT-DRAFT-API-对接文档.md`），不写浏览器。
- **已接入**：`/token`、`/material/add_material`、`/draft/add`、`/draft/get`（上传封面 → MD→内联 HTML → 写草稿 → 回查；成功回执带预览 `url`）。
- **未接入**：`freepublish/submit` 正式发布、群发、原创声明（需认证服务号；自动群发风险高，刻意不做）。
- **不自动群发**；请到 mp.weixin.qq.com 草稿箱人工发布。

## 账号绑定

账号页选择本插件 → 填写 AppID / AppSecret →「绑定凭证」。  
凭证存于 `~/.seedcast/profiles/wechat-mp/<accountId>/credentials.json`（权限 600）。  
Token 缓存：`token_cache.<appid>.json`（按 appid 分文件，避免串号）。

### 如何获取 AppID / AppSecret

1. 登录 [微信公众平台](https://mp.weixin.qq.com)  
2. 「设置与开发」→「基本配置」  
3. 「开发者 ID (AppID)」查看 AppID  
4. 「开发者密码 (AppSecret)」生成/重置并复制  
5. 同页配置「IP 白名单」（本机出口 IP）

## 发布设置

| 字段 | 说明 |
|---|---|
| author | 作者，缺省用账号名 |
| digest | 摘要，缺省用标题 |
| coverFile | 封面路径；缺省 `fixtures/cover.png` |
| contentSourceUrl | 原文链接 |
| showCoverPic | 是否在正文显示封面图 |

## 前置条件

1. 公众平台已开通草稿接口权限  
2. 服务器出口 IP 已加白名单（否则 40164）  
3. 封面图建议 900×383 JPG  

## 实测

见引擎 CHANGELOG；无真实凭证时测绑定校验与 MD→HTML 单测。
