# CSDN 插件

- 状态：文章写入 Markdown 草稿箱（Web API）。
- 实测日期：2026-11-22（真实账号草稿写入成功，例：`editor.csdn.net/md?articleId=171183099`）。

## 选型

| 优先级 | 结论 |
|---|---|
| 官方开放 API | 无面向第三方的内容发布开放平台 |
| 现成方案 | Wechatsync 等社区实现走 `bizapi.csdn.net`（GPL-3.0，**仅作协议参考，未拷贝源码**） |
| 本插件 | Cookie（Playwright 登录）+ 洁净室重写 Web API |

## 发布类型

| id | 标签 | 说明 |
|---|---|---|
| draft | 写入草稿箱 | `saveArticle`，`pubStatus=draft`；返回 `editor.csdn.net/md?articleId=` |

本版不做视频发布。

## 登录

- 账号页「添加登录」→ Chrome persistent profile → `passport.csdn.net/login`
- 登录成功判定：**仅认登录 Cookie**（`UserName` / `UserToken` / `UserInfo` / `c_token`）；仍在 passport 页时**不用 DOM**（旧选择器会误匹配营销链接导致秒关窗）
- 离开登录页后可辅以 DOM；最后用 `getBaseInfo` 复核
- 会话检测 / 发布：HTTP `getBaseInfo`

## 已知坑

- 2026-11-22：曾因 `img.avatar` / `a[href*='blog.csdn.net']` 在登录页误判 → 浏览器自动关闭、账号假 `logged_in` 再变 `expired`（已修）
- `x-ca-key` / 签名密钥来自 CSDN 编辑器前端网关，随平台改版可能失效
- 请求需带 `Origin/Referer: editor.csdn.net`，否则易 403
- 正式公开发表未做；请在 CSDN 编辑器内人工点发布
