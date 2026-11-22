# Seedcast 插件契约（apiVersion = 1）

- 版本：v1（与引擎 `ENGINE_API_VERSION` 对齐）
- 日期：2026-11-21
- 许可证：Apache-2.0

本文说明如何编写可被 Seedcast 引擎加载的平台插件。**改版优先改 `selectors.json`，不要改主程序。**

---

## 1. 目录结构

```
plugin-<id>/
├── manifest.json      # 必需
├── selectors.json     # 声明式插件必需
├── flow.json          # 声明式插件必需
├── schema.json        # 推荐：平台设置 JSON Schema
├── index.ts           # 代码插件必需（adapter=code）
├── fixtures/          # 可选：本地调试页
└── NOTES.md           # 推荐：实测日期与已知坑
```

插件放置位置：

| 来源 | 路径 | 说明 |
|---|---|---|
| builtin | 仓库 `code/plugins/<id>` | 随引擎分发 |
| local | `~/.seedcast/plugins/<id>` | 用户/第三方安装；同 id 覆盖 builtin |

---

## 2. manifest.json

```json
{
  "id": "zhihu",
  "name": "知乎",
  "version": "0.1.0",
  "apiVersion": 1,
  "adapter": "flow",
  "contentTypes": ["article"],
  "platform": {
    "home": "https://www.zhihu.com",
    "loginUrl": "https://www.zhihu.com/signin",
    "sessionCheck": {
      "url": "https://www.zhihu.com",
      "loggedInSelector": "loggedIn",
      "timeoutMs": 8000
    }
  },
  "capabilities": {
    "draft": true,
    "nativeSchedule": false,
    "publishTypes": [
      { "id": "article", "label": "写文章" }
    ]
  },
  "entry": "index.ts"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| id | 是 | 唯一标识，小写短横线 |
| name | 是 | 展示名 |
| version | 是 | 语义化版本 |
| apiVersion | 是 | 必须等于引擎支持版本（当前为 `1`），否则拒绝加载 |
| adapter | 是 | `flow` \| `code` |
| contentTypes | 是 | `article` \| `imageText` \| `video` \| `audio` |
| platform.home / loginUrl | 是 | 平台首页与登录页 |
| platform.sessionCheck | 否 | 登录态检测；`loggedInSelector` 为 **selectors 键** |
| capabilities | 否 | draft / nativeSchedule / **publishTypes**（可选发布类型，供 GUI 下拉） |
| entry | code 时必填 | 代码入口相对路径 |

---

## 3. selectors.json

集中管理选择器。**flow 中禁止写裸 CSS**，只引用键名。

```json
{
  "loggedIn": ".AppHeader-userInfo",
  "titleInput": "textarea[placeholder='标题']",
  "contentInput": ".DraftEditor-root",
  "submitButton": "button:has-text('发布')"
}
```

平台改版时：只改本文件并更新 `NOTES.md` 实测日期。

多个备选选择器用 ` | ` 分隔（空格-竖线-空格），解释器用 Playwright `locator.or()` 合并。**不要用逗号**拼 `text=` 与 CSS，会被引擎解错。

---

## 4. flow.json

```json
{
  "publish": [
    { "action": "goto", "url": "https://example.com/write" },
    { "action": "waitFor", "selector": "titleInput" },
    { "action": "fill", "selector": "titleInput", "value": "{{title}}" },
    { "action": "insertText", "selector": "contentInput", "value": "{{content}}" },
    { "action": "click", "selector": "submitButton" },
    { "action": "extract", "selector": "resultUrl", "as": "url", "attr": "href" }
  ],
  "publishByType": {
    "article": [ { "action": "goto", "url": "https://example.com/write" } ],
    "pin": [ { "action": "goto", "url": "https://example.com/pin" } ]
  }
}
```

多类型平台：优先用 `publishByType[settings.publishType]`；无分流时回退到 `publish`。

### 4.1 动作词汇（v1）

| action | 关键字段 | 说明 |
|---|---|---|
| goto | url | 打开页面 |
| waitFor | selector | 等待可见 |
| click | selector | 点击 |
| fill | selector, value | 清空并填入 |
| insertText | selector, value | 聚焦后键盘注入（富文本） |
| press | key, selector? | 按键 |
| upload | selector, file | 上传文件 |
| select | selector, option | 下拉选择 |
| sleep | ms | 等待毫秒 |
| extract | selector, as?, attr? | 提取文本或属性到变量 |
| currentUrl | as? | 当前 URL 写入变量 |

### 4.2 模板变量

- `{{title}}` `{{content}}` `{{desc}}`
- `{{settings.*}}`（来自发布目标 settings）
- `{{account.name}}`
- `extract` 的 `as` 结果可被后续步骤引用

### 4.3 失败归因

任一步失败返回结构化错误：`step` / `selector` / `message` / 可选截图路径，写入回执，**不自动重试**。

---

## 5. 代码 Adapter（TypeScript）

`adapter: "code"` 时实现：

```ts
interface Adapter {
  meta: PluginManifest;
  checkSession(ctx: AdapterContext): Promise<boolean>;
  render?(content: Content, settings: Record<string, unknown>): Promise<RenderedContent>;
  publish(ctx: AdapterContext, job: PublishJob): Promise<Partial<Receipt>>;
}
```

引擎通过 Playwright persistent context 注入账号专属 `page`（M1 完善）。复杂平台（如公众号）用代码接管渲染与素材上传。

---

## 6. schema.json

用 JSON Schema 描述平台设置字段，供 GUI 渲染表单与校验。示例见 `plugins/mock/schema.json`。

---

## 7. 安全模型（必须向用户明示）

- 插件在引擎进程内执行，**持有账号会话，属于受信代码，不是安全沙箱**。
- 只安装可信来源；第三方安装需显式确认。
- 官方插件源码可审；不做闭源插件市场。
- 引擎不向第三方发送账号数据；manifest 可声明域名作提示（非强制隔离）。

---

## 8. 本地调试建议

1. 把插件目录放到 `code/plugins/<id>` 或 `~/.seedcast/plugins/<id>`
2. 启动引擎：`pnpm --filter @seedcast/engine start`
3. `GET /plugins` 确认加载与 apiVersion
4. 声明式插件可先用本地 `fixtures/*.html` + mock 流程验证解释器
5. 维护 `NOTES.md`：实测日期、选择器变更、已知坑

---

## 9. 版本兼容

- `apiVersion` 整数递增；不兼容则明确报错，不静默失败。
- 词汇扩展走 apiVersion 升级；旧插件不受影响。
