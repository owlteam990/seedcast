# 简书号插件

- 状态：文章写入写作台草稿（Web API）。
- 实测日期：2026-11-22（插件加载 / 无账号发布拦截已测；真实账号草稿写入待扫码后补）。

## 选型

| 优先级 | 结论 |
|---|---|
| 官方开放 API | 无内容发布开放平台 |
| 现成方案 | Wechatsync 1.0.x 公开过 `author/notes` 协议（GPL-3.0，**仅作协议参考**）；v2 适配器在 private submodule |
| 本插件 | Cookie（Playwright 登录）+ 洁净室重写 Web API |

## 发布类型

| id | 标签 | 说明 |
|---|---|---|
| draft | 写入草稿 | 建笔记 + PUT 正文；返回 `writer#/notebooks/.../notes/...` |

## 登录

- 账号页「添加登录」→ `https://www.jianshu.com/sign_in`
- 登录成功判定：Cookie `remember_user_token` 优先
- 会话检测：`GET /settings/basic.json`

## 设置

| 字段 | 说明 |
|---|---|
| notebookId | 可选文集 ID；缺省取列表第一个 |

## 已知坑

- 账号冻结时 `POST /author/notes` 返回 403，`error[0].code=9902`（「帐号被冻结，暂时无法发布文章」）；登录态仍可能正常
- 历史接口可能改版；失败时用登录态抓包对照 `/author/notebooks`、`/author/notes`
- 正文按 HTML 提交（Markdown 先转简易 HTML）；复杂排版可能需在写作台微调
- 正式公开发表未做；请在写作台内人工发布

## 实测

- 2026-11-22：登录态 OK；建笔记因账号冻结 9902 失败（接口路径正确）
