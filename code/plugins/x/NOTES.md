# X（Twitter）插件

- 状态：官方 API 发帖（OAuth 1.0a 用户上下文）。
- 实测日期：待补（插件加载 / 缺凭证拦截已测；真实发帖需自备开发者凭证）。

## 选型

| 优先级 | 结论 |
|---|---|
| 官方开放 API | **选用**：`POST /2/tweets`；需用户自备 App + Access Token（2026 起新开发者多为按次计费） |
| 现成方案 | 社区多为 twitter-api-v2 / 自建 OAuth；本仓库洁净室实现最小签名与发帖 |
| 页面自动化 | 不优先（PRD 已预留官方 API 型插件） |

## 发布类型

| id | 标签 | 说明 |
|---|---|---|
| publish | 发布帖子 | 立即发帖；X 无「草稿箱」官方写接口，故非 draft |

## 登录 / 绑定

账号页填写：

- API Key / API Key Secret
- Access Token / Access Token Secret

获取：https://console.x.com → 创建 App → Keys and tokens

## 已知坑

- 免费档位已收紧；发帖可能按次计费，请自查控制台定价
- 默认文案截断约 280 字符；更长帖需 X Premium 额度且本版不自动切 thread
- 含链接的帖子在部分计费档位更贵
