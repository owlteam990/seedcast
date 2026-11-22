# B站专栏插件

- 状态：专栏文章写入草稿（Web API）。
- 实测日期：待补（插件加载 / 无账号发布拦截先测；真实账号草稿写入需扫码后补）。

## 选型

| 优先级 | 结论 |
|---|---|
| 官方开放 API | 开放平台偏合作/商业，个人 UP 日常专栏仍走 `member.bilibili.com` 创作后台 |
| 现成方案 | Wechatsync `x/article/creative/draft/addupdate`（GPL，**仅协议参考**） |
| 本插件 | Cookie（Playwright 登录）+ CSRF（`bili_jct`）+ 洁净室重写 |

## 发布类型

| id | 标签 | 说明 |
|---|---|---|
| draft | 写入专栏草稿 | `draft/addupdate`；回执：`member.bilibili.com/platform/upload/text/edit?aid=` |

本版不做视频投稿 / 动态。

## 登录

- `https://passport.bilibili.com/login`
- 会话检测：`GET /x/web-interface/nav` 且 `isLogin=true`；Cookie 备选 `SESSDATA` / `bili_jct`

## 设置

| 字段 | 说明 |
|---|---|
| tid | 可选分区 ID；缺省 `4` |

## 已知坑

- 平台要求正文图尽量在自家 CDN；首版不对外部图强制 `upcover`，复杂配图请到编辑器内补传
- 正式发布请在创作中心人工确认
