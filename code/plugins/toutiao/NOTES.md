# 今日头条插件

- 状态：图文写入草稿（Web API，`save=0`）已实测通过。
- 实测日期：2026-11-22
  - 会话：`logged_in`，识别号主「明智易创」
  - 草稿：`pgc_id=7710825931258003983`

## 选型

| 优先级 | 结论 |
|---|---|
| 官方开放 API | 抖音开放平台「头条内容发布」偏视频/合作资质；个人号日常图文仍走 mp 后台 |
| 现成方案 | Wechatsync 1.x `mp.toutiao.com/mp/agw/article/publish`（GPL，**仅协议参考**） |
| 本插件 | Cookie（Playwright 登录）+ Playwright `context.request`（完整 Cookie 罐 / SSO）洁净室重写 |

## 发布类型

| id | 标签 | 说明 |
|---|---|---|
| draft | 写入草稿 | `publish?source=mp&type=article` + `save=0`；回执链 `profile_v4/graph/articles/publish?pgc_id=` |

本版不做图文合集 / 视频。

## 登录

- 创作台：`https://mp.toutiao.com/profile_v4/index`
- 登录页：`mp.toutiao.com/auth/page/login/`（含 `sso.toutiao.com`）
- Cookie：`sessionid` / `sid_tt` / `uid_tt` 等（跨子域由 Playwright jar 携带）
- 会话检测：多路径 `get_media_info`；失败时以落地 `profile_v4` / 创作台 HTML 兜底（避免误报 expired）

## 已知坑

- 纯 Node `fetch` + 手工 Cookie 头易丢 SSO，会误判「已登录 UI / API expired」——必须用 `context.request`
- 编辑页新路径为 `profile_v4/graph/articles/publish`（旧 `graphic/publish` 仍兼容热身）
- 登录等待禁止在 passport/SSO 页用 DOM 误判已登录
