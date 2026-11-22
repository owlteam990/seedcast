# YouTube 插件

- 状态：官方 Data API v3 可续传上传（默认 private）。
- 实测日期：待补（插件加载 / 缺凭证拦截已测；真实上传需 Google OAuth 凭证）。

## 选型

| 优先级 | 结论 |
|---|---|
| 官方开放 API | **选用**：`videos.insert` + OAuth 2.0 refresh_token；免费配额约 1 万单位/日 |
| 现成方案 | Google 官方上传示例；本仓库洁净室 HTTP 实现，不引入 googleapis 大包 |
| 页面自动化 | 不优先（PRD 已预留官方 API 型） |

## 发布类型

| id | 标签 | 说明 |
|---|---|---|
| draft | 上传为私密视频 | `privacyStatus=private`；可在 Studio 再公开 |

## 登录 / 绑定

账号页填写 OAuth 桌面应用凭证：

1. Google Cloud Console 启用 YouTube Data API v3
2. 创建 OAuth 客户端（桌面应用）→ Client ID / Client Secret
3. 本机完成一次授权拿到 `refresh_token`（scope：`youtube.upload`）

## 已知坑

- 未验证的 API 项目上传可能被限制为私密（符合本版默认）
- 单次上传配额成本高，日上传次数有限
- 仅视频内容类型；文章/图文请换其它平台
