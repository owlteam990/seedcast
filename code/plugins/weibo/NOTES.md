# 微博插件

- 状态：头条文章写入草稿（Web API）。
- 实测日期：待补（插件加载 / 无账号发布拦截先测；真实账号草稿写入需扫码后补）。

## 选型

| 优先级 | 结论 |
|---|---|
| 官方开放 API | `open.weibo.com` 发布类接口需应用审核；`statuses/share` 等仅适合分享应用域名链接，不适合个人长文草稿 |
| 现成方案 | Wechatsync 走 `card.weibo.com/article/v5` 头条文章草稿（GPL，**仅协议参考**） |
| 本插件 | Cookie（Playwright 登录）+ 洁净室重写 Web API |

## 发布类型

| id | 标签 | 说明 |
|---|---|---|
| draft | 写入头条文章草稿 | `draft/create` + `draft/save`；回执：`card.weibo.com/article/v5/editor#/draft/{id}` |

本版不做短微博 / 视频。

## 登录

- `https://weibo.com/login.php` → 扫码 / 密码
- 会话检测：解析编辑器页 `config: JSON.parse(...)` 中的 `uid`；Cookie 备选 `SUB` / `SUBP`

## 已知坑

- 正文图片建议先走公网图床；首版不强制转存 sinaimg
- 正式发布请在编辑器内人工确认
