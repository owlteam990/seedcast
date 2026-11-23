# 小红书插件

- 状态：创作者中心 **图文笔记** / **写长文** 写入草稿（页面自动化）。
- 实测日期：2026-11-23（图文存草稿；长文「新的创作 → 暂存离开」）。

## 选型

| 优先级 | 结论 |
|---|---|
| 官方开放 API | `openaccount.xiaohongshu.com` 主要为 OAuth 登录 / 基础资料，**无个人笔记发布接口** |
| 现成方案 | 社区多为 Cookie + 签名 Creator API，或 Playwright 操作 `creator.xiaohongshu.com/publish` |
| 本插件 | Cookie 会话检测（`personal_info`）+ **有头 Playwright** 按发布形式分流 |

## 发布形式（`settings.publishType`）

| id | 标签 | 入口 | 说明 |
|---|---|---|---|
| `imageText` | 上传图文 | `?target=image` | 短笔记；**≥1 张本地图**；标题 ≤20 |
| `article` | 写长文 | `?target=article` →「新的创作」 | 千字长文；标题 ≤64；点「暂存离开」 |

未显式选择时：内容类型 `article` → 长文，`imageText` → 图文。

本版不做视频 / 播客。

## 登录

- `https://creator.xiaohongshu.com/login` 扫码
- 会话检测：`GET /api/galaxy/creator/home/personal_info`；登录 Cookie **仅** `web_session`（勿用 `a1`）

## 已知坑

- `a1` 是设备标识，匿名访问即存在；曾误配进 `loggedInCookie` 造成登录闪退
- 图文强制本地图片；长文不强制配图
- 图文标题：`input[placeholder*="填写标题"]`；长文标题：`textarea[placeholder*="输入标题"]`；正文均为 `.tiptap.ProseMirror`
- 图文草稿常走 `<xhs-publish-btn>._onSave`；长文为按钮「暂存离开」
- 创作者中心 UI 改版频繁；正式公开发表请在后台人工确认
