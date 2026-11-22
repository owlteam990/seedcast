# 百家号插件

- 状态：文章写入草稿（Web API）。
- 实测日期：2026-11-22（真实账号草稿成功，例：`article_id=1882525456351731823`）。

## 选型

| 优先级 | 结论 |
|---|---|
| 官方开放 API | 企业/内容源接入门槛高，个人创作者日常发布不走开放平台 |
| 现成方案 | Wechatsync 等走 `baijiahao.baidu.com` 后台 Web API（GPL，**仅协议参考**） |
| 本插件 | Cookie（Playwright 登录）+ 洁净室重写 |

## 发布类型

| id | 标签 | 说明 |
|---|---|---|
| draft | 写入草稿 | `pcui/article/save`；返回 `builder/rc/edit?article_id=` |

本版不做图文合集 / 视频。

## 登录

- `builder/theme/bjh/login` → 百度账号扫码/密码
- 成功判定：Cookie 备选 `BJHSESSID` / `BDUSS`；passport 页禁用宽 DOM
- 会话检测：`GET /builder/app/appinfo`

## 已知坑

- 保存草稿需从 `/builder/rc/edit` 解析 `__BJH__INIT__AUTH__` 作为 `token` 头
- 响应可能是 JSONP（`bjhdraft(...)`）
