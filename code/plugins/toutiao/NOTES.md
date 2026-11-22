# 今日头条插件

- 状态：图文写入（Web API，页内 fetch）已实测；**拒绝假成功 `pgc_id=0`**。
- 实测日期：2026-11-22
  - 会话：`logged_in`，号主「明智易创」
  - 接口：`POST /mp/agw/article/publish?source=mp&type=article`
  - `save=0`（草稿）当前常返回 `code=7050` / `pgc_id=0`「保存失败」
  - `save=1`（提交）可返回真实 `pgc_id`（如 `7710916852063289907`）
  - 策略：先试草稿，失败再提交；回执链必须带非 0 的 `pgc_id`

## 选型

| 优先级 | 结论 |
|---|---|
| 官方开放 API | 抖音开放平台「头条内容发布」偏视频/合作资质；个人号日常图文仍走 mp 后台 |
| 现成方案 | Wechatsync 1.x `mp.toutiao.com/mp/agw/article/publish`（GPL，**仅协议参考**） |
| 本插件 | Cookie（Playwright 登录）+ **页内 fetch**（msToken/a_bogus）洁净室重写 |

## 发布类型

| id | 标签 | 说明 |
|---|---|---|
| draft | 写入头条 | 优先 `save=0`；失败回退 `save=1`。回执：`profile_v4/graph/articles/publish?pgc_id=`（**禁止 `pgc_id=0`**） |

封面：可选上传 `article_material/photo/upload_picture`，写入 `pgc_feed_covers`。

## 登录

- 创作台：`https://mp.toutiao.com/profile_v4/index`
- 登录页：`mp.toutiao.com/auth/page/login/`（含 `sso.toutiao.com`）
- 会话检测：多路径 `get_media_info`；失败时以落地 `profile_v4` HTML 兜底

## 已知坑

- **假成功**：接口在失败时仍可能返回 `data.pgc_id="0"`，必须同时校验 `code/err_no` 与非 0 ID
- 纯 `context.request` 缺签名时更易 7050；页内 `fetch` 更稳
- 编辑页：`profile_v4/graph/articles/publish`
