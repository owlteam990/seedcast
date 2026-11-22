## 2026-11-22

### 模块：engine / toutiao（误报未登录修复）

**变动类型：** 修复

**变动描述：**
- 背景：创作台 UI 已登录（`profile_v4`），会话检测仍报 `expired`
- `withProfileCookieSession` 改为 Playwright `context.request`，共享完整 Cookie 罐（含跨子域 SSO），不再手工拼 Cookie 头
- 头条会话：多路径 `get_media_info` + 落地页 `profile_v4`/创作台 HTML 兜底；编辑页对齐 `graph/articles/publish`
- 实测：号主「明智易创」`logged_in`；草稿 `pgc_id=7710825931258003983` 写入成功

**影响范围：**
- `adapters/cookieHttp.ts`、`adapters/toutiao/*`、`plugins/toutiao/NOTES.md`

**变动人：** Auto

---

## 2026-11-22

### 模块：plugins / engine（百家号、今日头条）

**变动类型：** 新增

**变动描述：**
- 背景：继续按「优先 Web API」接入百家号与今日头条；无面向个人创作者的通用开放发布 API
- 参考 Wechatsync 等社区后台接口形态（GPL，仅协议参考），洁净室实现 Cookie + HTTP 文章草稿
- 百家号：`appinfo` + `__BJH__INIT__AUTH__` + `pcui/article/save`；头条：`get_media_info` + `mp/agw/article/publish`（save=0）
- 首版仅文章草稿，不做图文合集/视频；runner 代码适配器改为表驱动分发

**影响范围：**
- 插件：`plugins/baijiahao/`、`plugins/toutiao/`
- 引擎：`adapters/baijiahao/*`、`adapters/toutiao/*`、`publish/runner.ts`、`session/accountsService.ts`
- `scripts/build-sidecar.mjs`

**变动人：** Auto

---

## 2026-11-22

### 模块：engine / jianshu（错误文案）

**变动类型：** 优化

**变动描述：**
- 背景：实测发布时简书 `POST /author/notes` 403，原回执只写 HTTP 状态
- 解析平台 `error[].message`（如账号冻结 code 9902）并透出到发布回执

**影响范围：**
- `adapters/jianshu/client.ts`、`plugins/jianshu/NOTES.md`

**变动人：** Auto

---

## 2026-11-22

### 模块：engine / csdn（登录秒关窗）

**变动类型：** 修复

**变动描述：**
- 背景：CSDN「添加并登录」后浏览器未等扫码就自动退出，账号先假 `logged_in` 再变 `expired`
- 根因：登录页 DOM 选择器过宽（`img.avatar`、`blog.csdn.net` 链接）被当成已登录
- 修复：仍在 passport/登录页时只用 Cookie 判定；Cookie 支持逗号多备选；登录成功后用 `getBaseInfo` 复核

**影响范围：**
- `session/pool.ts`、`session/accountsService.ts`
- `plugins/csdn/manifest.json`、`selectors.json`、`NOTES.md`

**变动人：** Auto

---

## 2026-11-22

### 模块：plugins / engine（CSDN、简书号）

**变动类型：** 新增

**变动描述：**
- 背景：按「优先 API → 复用现成协议 → 再自研」接入 CSDN 与简书号；两平台无官方开放发布 API
- 参考 Wechatsync 等社区 Web API 形态（GPL，仅协议参考），洁净室实现 Cookie + HTTP 草稿写入
- 新增 `cookieHttp`：从账号 Chrome profile 取 Cookie 再请求平台接口
- CSDN：`bizapi.csdn.net` 签名保存 Markdown 草稿；简书号：`/author/notes` 写作台草稿
- 登录仍走 Playwright 扫码；会话检测与发布走 Web API；首版不做视频/正式公开发表

**影响范围：**
- 插件：`plugins/csdn/`、`plugins/jianshu/`
- 引擎：`adapters/cookieHttp.ts`、`adapters/csdn/*`、`adapters/jianshu/*`、`adapters/simpleMarkdownHtml.ts`
- `publish/runner.ts`、`session/accountsService.ts`、`session/pool.ts`（登录等待支持 Cookie）
- `scripts/build-sidecar.mjs`

**变动人：** Auto

---

## 2026-11-22

### 模块：engine / desktop（ImgBB 测试上传无反馈）

**变动类型：** 修复

**变动描述：**
- 背景：设置页点「上传测试图」看似无反应；实际可能失败或引擎端口已失效
- 测试结果改为按钮下方即时显示成功/失败文案；引擎断连提示「重新连接」
- ImgBB：补浏览器 UA、base64/文件双通道重试；forbidden 时提示可改 litterbox / S3

**影响范围：**
- `packages/engine/src/assets/imageHost.ts`
- `apps/desktop/src/App.tsx`、`api.ts`、`styles.css`

**变动人：** Auto

---

## 2026-11-22

### 模块：engine / zhihu（已登录却检测为过期）

**变动类型：** 修复

**变动描述：**
- 背景：知乎账号浏览器里已登录，点「检测」却标 expired
- 根因：`sessionCheck` 把带 ` | ` 的备选选择器直接交给 `waitForSelector`（不支持），DOM 永远匹配失败
- 会话检测改为与 flow 相同的备选定位；知乎增加 `loggedInCookie: z_c0` 优先判定；更新 loggedIn 选择器

**影响范围：**
- `packages/engine/src/flow/locate.ts`、`session/pool.ts`、`plugins/loadManifest.ts`
- `plugins/zhihu/manifest.json`、`selectors.json`
- 账号库「检测」/ 发布前会话校验

**变动人：** Auto

---

## 2026-11-22

### 模块：desktop（Markdown 分栏取消联动滚动）

**变动类型：** 优化

**变动描述：**
- 背景：分栏模式下编辑区与预览区滚动互相拖动，不便对照阅读（内容库 / 发布中心共用同一编辑器）
- 取消两侧自动同步滚动；行号 gutter 仍跟随编辑区
- 分栏滚轮隔离（overscroll-behavior）+ 预览重绘时保持滚动位置，避免输入时预览被拽回顶部

**影响范围：**
- `apps/desktop/src/MarkdownEditor.tsx`、`styles.css`
- 内容库正文、发布中心 Markdown

**变动人：** Auto

---

## 2026-11-22

### 模块：desktop（正文粘贴/插入图走公网图床）

**变动类型：** 优化

**变动描述：**
- 背景：图床开启后，应仅对正文新粘贴/插入图片上传公网，本地图库旧图不变
- Markdown 编辑器在 `imageHost.enabled` 时改走 `POST /assets/remote`，正文插入公网 URL；关闭时仍仅本机入库
- 设置页文案对齐：启用后仅新粘贴和插入的正文图片上传公网

**影响范围：**
- `apps/desktop/src/MarkdownEditor.tsx`、`App.tsx`
- 内容库正文编辑 / 发布页 Markdown 编辑

**变动人：** Auto

---

## 2026-11-22

### 模块：desktop（内容/模板删除无效）

**变动类型：** 修复

**变动描述：**
- 背景：内容库「删除」点击无反应；根因是 Tauri WebView 下 `window.confirm` 不弹窗且返回 false，删除被静默取消
- 改为应用内确认对话框；删除成功后刷新列表并提示「内容已删除」
- 同步修复发布配置模板删除的同一问题

**影响范围：**
- `apps/desktop/src/App.tsx`、`styles.css`
- 引擎 DELETE `/contents/:id` 本身正常，无需改后端

**变动人：** Auto

---

## 2026-11-22

### 模块：engine / desktop（图床支持 S3 / OSS）

**变动类型：** 新增

**变动描述：**
- 背景：公网图床需支持自建/云厂商对象存储，兼容阿里云 OSS、AWS S3、MinIO 等
- 新增 `provider=s3`：Endpoint、Region、Bucket、目录前缀、自定义域名、AK/SK、Session Token、强制 Path Style
- 引擎侧 SigV4 PutObject（无 AWS SDK 依赖）；设置页提供方卡片 +「使用公网图床」开关 +「上传测试图」
- 新增 `POST /assets/remote/test`（可用未保存草稿配置测通）

**影响范围：**
- `packages/engine/src/assets/imageHost.ts`、`s3Put.ts`
- `packages/engine/src/config/userConfig.ts`、`http/server.ts`
- `apps/desktop` 设置页图床 UI / `api.ts`
- 配置文件 `~/.seedcast-config.json` 的 `imageHost` 字段

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / desktop（修复发行包「引擎启动超时」与「暂无插件」）

**变动类型：** 修复

**变动描述：**
- 背景：从 DMG 挂载卷直接打开时易出现引擎启动超时；即便从 Applications 打开，内置插件目录偶发未注入，账号库显示「暂无插件」
- sidecar 插件回退路径补上 `Contents/Resources/resources/plugins`（Tauri resources 嵌套）
- 壳 `resolve_builtin_plugins` 增加相对主程序路径回退，确保 `SEEDCAST_BUILTIN_PLUGINS` 能注入

**影响范围：**
- `packages/engine/src/plugins/loader.ts`
- `apps/desktop/src-tauri/src/lib.rs`
- 需重新打包 / 更新 Applications 内 sidecar 后生效

**变动人：** Auto

---

## 2026-11-22

### 模块：tooling（macOS 编译脚本）

**变动类型：** 新增

**变动描述：**
- 新增 `code/scripts/build-mac.sh`：检查 Node/pnpm/Rust/Bun/Xcode → 构建 → sidecar → dmg，产物复制到 `apps/desktop/dist-bundle/`
- 支持 `--skip-install` / `--sidecar-only` / `--dev-check`；根脚本 `pnpm build:mac`

**影响范围：**
- 本机 mac 打包流程（见 `docs/打包说明.md`）

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / app（新建视频 · 分片入库 · ffmpeg 封面）

**变动类型：** 新增

**变动描述：**
- 「新建视频」分步表单：标题 / 视频文件 / 描述 / 封面（本地选或 ffmpeg 抽首帧）
- 视频分片上传：`/assets/video/init|part|finish`（上限 512MB）；`/assets/video/cover` 抽帧
- `contentType=video`：assets[0]=视频、assets[1]=封面；设置摘要含 `ffmpegAvailable`

**影响范围：**
- `assets/videoStore.ts`、桌面 `VideoComposer`、内容库顶栏入口

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / app（免费图床 + 新建图文）

**变动类型：** 新增

**变动描述：**
- 第三方免费图床：`POST /assets/remote`；默认 litterbox（免密钥、有过期），可选 SM.MS / ImgBB（设置页填免费 Key）
- 内容模型 schema v3：`content_type`（article / imageText…）；「新建图文」分步表单（标题 / 描述 / 多图上传走图床）
- 设置页可配置图床提供方；列表展示「图文」标记

**影响范围：**
- `assets/imageHost.ts`、`userConfig`、`contents` migration v3、桌面 ImageTextComposer / 设置页
- SQL：`docs` 无独立 migration 文件，见 engine `migrations.ts` v3

**变动人：** Auto

---

## 2026-11-21

### 模块：app（Markdown 精致编辑器）

**变动类型：** 优化

**变动描述：**
- 内容库/发布中心 Markdown 升级为工作室：工具栏（标题/粗斜删/列表/引用/链接/代码/插图）、目录、编辑|分栏|预览、字数与阅读时长、行号、预览主题（经典/GitHub/github-dark）、字号、快捷键 ⌘B/I/K/E
- 预览增强：任务列表、引用、分割线、标题锚点跳转；分栏滚动联动
- 不做内置 AI/VIP（Non-Goals）

**影响范围：**
- `MarkdownEditor.tsx`、`markdownPreview.ts`、`mdUtils.ts`、`styles.css`

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / app（修复发行包 Load failed）

**变动类型：** 修复

**变动描述：**
- 背景：从 dmg 打开时内容库报 `Load failed`，列表为空（WKWebView Origin 为 `tauri://localhost` 等，旧 CORS 只放行 http localhost）
- 引擎 `applyCors` 放行 Tauri WebView Origin；GUI 对 Load failed 给出中文提示
- 需使用新引擎进程 / 新 dmg；旧引擎点「重新连接」若已换新引擎亦可恢复

**影响范围：**
- `http/server.ts` CORS、`App.tsx` 连接错误文案、发行 sidecar

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / desktop（M0-T13 · M1-B1 sidecar 打包）

**变动类型：** 新增

**变动描述：**
- 结论：引擎发行采用 **Bun `--compile`**（否决纯 Node SEA / Bun 作开发运行时）；见 `docs/打包说明.md`
- `pnpm sidecar` 本机产出 `seedcast-engine-<triple>`，并同步官方插件到 Tauri `resources/plugins`
- 壳：`externalBin` + Resource；发行态拉起 sidecar，开发态仍用 `node dist/cli.js`；`SEEDCAST_BUILTIN_PLUGINS` 注入内置插件路径
- Win 安装器目标改为 NSIS（去掉 MSI）；mac 仍为 dmg
- 本机已打出 `Seedcast_0.1.0_aarch64.dmg`（含 92MB sidecar + 官方插件资源）；bundle id 改为 `com.seedcast.desktop`

**影响范围：**
- `@seedcast/engine` sidecar 脚本、插件 loader、`tauri.conf.json`、`lib.rs`、打包文档

**变动人：** Auto

---

## 2026-11-21

### 模块：产品文档（TurboPush 借鉴决策 + GUI 布局）

**变动类型：** 优化

**变动描述：**
- 背景：对照 TurboPush 截图与 turbopush-mcp，明确哪些能力可进 Seedcast、哪些明确不做；界面约定学其左侧导航 + 右侧操作区
- `需求文档.md` §3.5 增补布局约定与 FR-G1a / FR-G7；§7 Non-Goals 对齐；新增附录 B 功能取舍表
- `开发计划.md` 同步 GUI 布局已定说明与不做清单（知识库工坊）

**影响范围：**
- `docs/需求文档.md`、`docs/开发计划.md`（产品行为/界面约定；尚未改 GUI 代码）

**变动人：** Auto

---

## 2026-11-21

### 模块：app / engine（FR-PL6 插件安装 · 数据目录 · 拖拽图）

**变动类型：** 新增

**变动描述：**
- 插件页：本地目录安装需勾选风险确认；`POST /plugins/install`（confirmRisk 必填）
- 设置页：可配置数据根（`~/.seedcast-config.json`），保存后需重启引擎；`PUT /settings`
- Markdown 编辑器支持拖拽图片入库（与粘贴共用上传）

**影响范围：**
- `plugins/install`、`config/userConfig`、桌面插件/设置页、MD 编辑器

**变动人：** Auto

---

## 2026-11-21

### 模块：app / engine（内容筛选 · 失败截图）

**变动类型：** 优化

**变动描述：**
- 内容库二级：全部 / 草稿 / 已发布（按是否有成功回执划分）
- 发布记录失败项展示错误码、步骤、选择器；截图经 `GET /screenshots/:taskId/:file` 可预览

**影响范围：**
- 桌面内容库/记录页、engine 截图路由

**变动人：** Auto

---

## 2026-11-21

### 模块：app / engine（FR-G7 账号库二级）

**变动类型：** 新增

**变动描述：**
- 账号库二级：平台概览 / 账号管理 / 发布配置
- 发布配置模板落库 `setting_templates`（schema v2）；API `CRUD /setting-templates`
- 发布中心可套用模板；平台概览展示插件能力与账号数

**影响范围：**
- `apps/desktop`、engine migrations/HTTP、`SCHEMA_VERSION=2`

**变动人：** Auto

---

## 2026-11-21

### 模块：app（FR-G1a 左侧导航工作台）

**变动类型：** 优化

**变动描述：**
- 对齐 PRD §3.5.1：左侧主导航 + 右侧操作区 + 底栏引擎状态
- 顶栏「创作」「快速发布」主入口；蓝强调色；内容库空状态 CTA

**影响范围：**
- `apps/desktop` 壳布局与样式

**变动人：** Auto

---

## 2026-11-21

### 模块：app / engine（内容库 · 记录 · 设置 · MD 编辑 · schema 表单 · 重试）

**变动类型：** 新增

**变动描述：**
- GUI 导航扩展：内容 / 账号 / 发布 / 记录 / 插件 / 设置
- 内容库独立页：列表、新建/保存/删除；Markdown 编辑+预览；粘贴图片经 `POST /assets` 入库
- 发布页按插件 `schema.json` 动态渲染设置；发布前可校验必填
- 发布记录页接 `GET /records`（插件/失败筛选）；「仅重试失败」复用原 target.settings
- 设置页展示数据目录与零遥测说明；`GET /settings`
- 引擎：`/plugins` 附带 schema；素材读写；records 筛选与 contentTitle

**影响范围：**
- `apps/desktop`、`engine` HTTP/assets/schema、zhihu/mock schema

**变动人：** Auto

---

## 2026-11-21

### 模块：app（发布成功链接 / 公众号能力说明）

**变动类型：** 优化

**变动描述：**
- 发布成功后在按钮下方展示可点击的预览链接；日志内 URL 亦可点开
- 选中微信公众号时展示接口能力：已接入 token/素材/draft；未接入 freepublish/群发/原创

**影响范围：**
- 桌面发布页、`plugins/wechat-mp/NOTES.md`

**变动人：** Auto

---

## 2026-11-21

### 模块：app（发布页字段顺序）

**变动类型：** 优化

**变动描述：**
- 发布页「账号」下拉移到「目标插件」正下方，先选平台再选账号

**影响范围：**
- 桌面发布页表单顺序

**变动人：** Auto

---

## 2026-11-21

### 模块：app（公众号凭证指引）

**变动类型：** 优化

**变动描述：**
- 账号页选择微信公众号时展示 AppID/AppSecret 获取步骤（公众平台 → 设置与开发 → 基本配置）及 IP 白名单提示

**影响范围：**
- 桌面账号页、`plugins/wechat-mp/NOTES.md`

**变动人：** Auto

---

## 2026-11-21

### 模块：wechat-mp / engine / app（公众号草稿）

**变动类型：** 新增

**变动描述：**
- 参考 `docs/微信公众号发布`：官方 draft API 写入草稿箱（不自动群发）
- 插件 `wechat-mp`（code 适配器）；Markdown→内联 HTML；封面上传 + draft/add + draft/get 回查
- API：`POST /accounts/bind` 绑定 AppID/AppSecret；凭证按账号目录存储，token 按 appid 分文件缓存
- GUI：账号页绑定凭证；发布页作者/摘要/封面

**影响范围：**
- `adapters/wechatMp/*`、`plugins/wechat-mp`、`runner`、HTTP、桌面账号/发布页

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / zhihu（发布设置选择器）

**变动类型：** 修复

**变动描述：**
- 背景：等待「发布设置」超时；Playwright 把 `text=…, css >> …` 解成错误链式定位
- 选择器备选改为 ` | ` + `locator.or()`；面板锚点改为「添加文章封面 / 发布设置」
- 填标题后 Tab 失焦再点发布；面板等待加长到 45s

**影响范围：**
- `interpreter.locateByExpr`、`plugins/zhihu/selectors.json|flow.json`

**变动人：** Auto

---

## 2026-11-21

### 模块：zhihu（导入后补标题与发布设置）

**变动类型：** 修复

**变动描述：**
- 背景：导入链接后只有正文，标题为空、发布设置未填导致发不出去
- 导入完成后写入 Seedcast 标题；打开发布设置；可选封面/话题；公众号写入内容来源；再确认发布
- flow 支持 `skipIfEmpty`；GUI 增加话题与封面路径

**影响范围：**
- `plugins/zhihu/flow.json|selectors|schema`、`interpreter`、`flowPublisher`、桌面发布页

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / zhihu（导入按钮 disabled / 失败保留窗口）

**变动类型：** 修复

**变动描述：**
- 背景：公众号导入填链后「开始导入」仍 disabled，且失败后 Chrome 被关掉
- `fill` 改为原生 value setter + input/change，兼容 React 受控框
- `waitFor` 支持 `state: enabled`；导入流程先等到按钮可点再点
- 有头发布失败时不主动关闭浏览器，便于排查

**影响范围：**
- `interpreter`、`flowPublisher`、`plugins/zhihu/flow.json`

**变动人：** Auto

---

## 2026-11-21

### 模块：zhihu / engine / app（文章导入）

**变动类型：** 新增

**变动描述：**
- 背景：知乎专栏编辑器支持「导入文档 / 导入链接（公众号）」
- 写文章增加 `articleImport`：`editor` / `wechatLink` / `document`
- flow：`article_wechatLink`、`article_document`；缺省文档路径时用 Markdown 生成临时 .md
- GUI：发布类型为写文章时展示导入方式与链接/路径

**影响范围：**
- `plugins/zhihu/*`、`resolvePublishSteps`、`flowPublisher`、桌面发布页

**变动人：** Auto

---

## 2026-11-21

### 模块：engine（会话池 / profile 锁）

**变动类型：** 修复

**变动描述：**
- 背景：同一知乎 profile「打开」后发布报 `正在现有的浏览器会话中打开` / `Target page, context or browser has been closed`
- 根因：Chrome persistent profile 单实例；旧窗口或孤儿进程未释放
- `openAccountContext` 启动前关闭同 profile 已管 context；失败时清理 Singleton 锁并结束占用该目录的 Chrome 后重试

**影响范围：**
- `session/pool.ts`、`accountsService`（打开/删除）

**变动人：** Auto

---

## 2026-11-21

### 模块：zhihu / engine / app（发布类型）

**变动类型：** 删除

**变动描述：**
- 背景：写回答需手工填问题 ID，用户难找；知乎站内是推荐问题列表，产品体验差
- 下线「写回答」：manifest / schema / flow / selectors / 引擎校验 / GUI 问题 ID 输入一并移除
- 保留：提问题、发想法、写文章、发视频

**影响范围：**
- `plugins/zhihu/*`、`validatePublishSettings`、桌面发布页发布类型下拉

**变动人：** Auto

---

## 2026-11-21

### 模块：zhihu / engine / app（多发布类型）

**变动类型：** 新增

**变动描述：**
- 背景：知乎「+」菜单含提问题 / 写回答 / 发想法 / 写文章 / 发视频，需按类型可选发布
- 插件：`manifest.capabilities.publishTypes`、`schema.publishType`、`flow.publishByType`、选择器按类型拆分
- 引擎：`resolvePublishSteps` 按 `settings.publishType` 分流；写回答校验 `questionId`
- GUI：发布页按插件能力渲染「发布类型」；写回答时显示问题 ID 输入

**影响范围：**
- `plugins/zhihu/*`、`resolvePublishSteps`、`flowPublisher`、`loadManifest`、桌面发布页

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / app（账号）

**变动类型：** 新增

**变动描述：**
- 账号列表增加「打开」：用该账号 Chrome profile 打开平台首页，便于人工查看登录态与页面
- API：`POST /accounts/open`；同账号重复打开会先关闭旧窗口

**影响范围：**
- `accountsService.openAccountBrowser`、HTTP、GUI 账号操作列

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / zhihu（发布）

**变动类型：** 修复

**变动描述：**
- 背景：知乎已登录但发布卡住无结果
- 根因：发布开了全新 Chrome，未复用账号 profile；知乎选择器仍为 PLACEHOLDER，`waitFor` 长时间无反馈
- 发布改为 `launchPersistentContext(account.profileDir)`；发布前登录态检测
- 知乎 selectors/flow 换成可测初稿；占位选择器快速失败；步骤超时 20s
- 真实平台有头发布便于观察

**影响范围：**
- `flowPublisher`、`runner`、`plugins/zhihu`、flow 解释器

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / app（账号登录）

**变动类型：** 修复

**变动描述：**
- 背景：关闭登录 Chrome 后 GUI 卡在「等待登录…」，检测/删除因 profile 占用无法操作
- 关闭浏览器或取消请求时立即结束等待并释放 profile
- GUI 增加「取消登录」；登录结果区分 browser_closed / cancelled / timeout

**影响范围：**
- `session/pool.ts`、`accountsService`、HTTP `/accounts/login`、GUI 账号页

**变动人：** Auto

---

## 2026-11-21

### 模块：engine（账号登录）

**变动类型：** 修复

**变动描述：**
- 背景：知乎扫码登录页被轮询逻辑反复 `goto` 刷新，二维码无法使用
- `waitForLogin` 改为只打开一次登录页，静默轮询；仅在离开登录页后再访问 checkUrl 确认
- 启动 Chrome 时忽略 `--no-sandbox` 默认参数，减少黄条告警

**影响范围：**
- `packages/engine/src/session/pool.ts`

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / app（账号会话 + Tauri 壳）

**变动类型：** 新增

**变动描述：**
- 背景：补完 M0 Tauri 壳，并启动 M1 账号能力
- 账号 API：`POST /accounts/login`、`GET /accounts`、`GET /accounts/session`、`DELETE /accounts/:id`
- Chrome persistent profile（`profiles/<plugin>/<account>`）；mock 可无头自动登录；真实平台有头扫码
- Tauri 2 壳：`com.seedcast.app`；命令 `ensure_engine` / `get_engine_meta` 探测或拉起引擎
- 知乎插件骨架（选择器占位）；GUI 账号页可添加/检测/删除
- 开发命令：`pnpm dev:tauri`

**影响范围：**
- `packages/engine` 会话模块、`apps/desktop/src-tauri`、`plugins/zhihu`、GUI 账号/发布页

**变动人：** Auto

---

## 2026-11-21

### 模块：engine / app / docs（M0 收尾）

**变动类型：** 新增

**变动描述：**
- 背景：完成 M0 剩余：串行发布队列、契约文档、GUI 三页
- `POST /publish` SSE（info/success/error/finish）+ 全局串行队列；回执写入 `receipts`
- 内容库 CRUD：`/contents`；发布记录：`GET /records`；账号列表占位 `/accounts`
- 新增 `docs/plugin-contract.md`（apiVersion=1）
- GUI：`@seedcast/app` React+Vite 三页（插件/账号/发布），开发期读取 `engine.json` 发现引擎
- 本机 GUI CORS（仅 localhost / 127.0.0.1）

**影响范围：**
- 包：`@seedcast/engine`、`@seedcast/app`
- 文档：`docs/plugin-contract.md`

**变动人：** Auto

---

## 2026-11-21

### 模块：engine（引擎）

**变动类型：** 新增

**变动描述：**
- 背景：推进 M0 骨架——本地库、HTTP API、插件加载、flow 解释器
- SQLite：`better-sqlite3` + `schema_version` 迁移，表 contents/accounts/tasks/receipts/plugins
- HTTP：仅 `127.0.0.1` 随机端口；`Authorization` Token；`GET /ping`、`GET /plugins`
- 插件加载器：扫描内置 `plugins/` 与 `~/.seedcast/plugins`，校验 apiVersion
- flow 解释器 v1（goto/waitFor/click/fill/insertText/press/upload/select/sleep/extract/currentUrl）
- mock 插件本地 HTML fixture；`pnpm --filter @seedcast/engine smoke:flow` 可跑通并取出作品 URL

**影响范围：**
- 包：`@seedcast/engine`、`plugins/mock`
- 本地数据：`~/.seedcast/db/seedcast.sqlite`、`engine.json`

**变动人：** Auto

---

## 2026-11-21

### 模块：code / docs（工程基建）

**变动类型：** 新增

**变动描述：**
- 背景：确定源码落点、开源协议与发布节奏
- 许可证定为 **Apache License 2.0**（免费开源、可商用）
- 源码目录 `code/`：pnpm monorepo 骨架（shared / engine / plugin-sdk / mock 插件 / desktop 占位）
- 远程仓库约定：`https://github.com/owlteam990/seedcast`；**第一版完成前不 push**
- `.gitignore` 排除日志、本地数据、SQLite、临时测试脚本（`scripts/local/`、`*.local.*`）、测试报告等

**影响范围：**
- 目录：`code/`、`LICENSE`、`NOTICE`、`.gitignore`、`README.md`
- 文档：需求文档 Q1、开发计划目录与 Backlog

**变动人：** Auto

---

## 2026-11-21

### 模块：docs（文档）

**变动类型：** 新增

**变动描述：**
- 背景：正式发行需支持 macOS / Windows 双平台安装包
- 需求新增 §2.4 多平台发行打包；FR-S5/FR-S6；M1 手工出包、M2 CI 矩阵正式包
- 开发计划补充 M0-T14、M1-B*、M2-B* 打包任务；开放问题 Q9/Q10（安装器形态、universal）
- Linux 发行明确为 P2

**影响范围：**
- 文档：需求文档、开发计划
- 后续实现：Tauri bundler + 引擎 sidecar 按 OS 矩阵；CI secrets 管理签名

**变动人：** Auto

---

## 2026-11-21

### 模块：docs（文档）

**变动类型：** 优化

**变动描述：**
- 背景：拍板本地持久化方案，不再经 JSON 文件过渡
- Q3 已定：业务数据统一用本地 SQLite（`~/.seedcast/db/seedcast.sqlite`）
- 更新 `docs/需求文档.md` §10 存储说明与 §12 Q3
- 更新 `docs/开发计划.md`：M0 增加 SQLite 建表/迁移任务；M1 内容库改为 SQLite CRUD；去掉 M2「JSON→SQLite 迁移评估」

**影响范围：**
- 文档：需求文档、开发计划
- 后续实现：引擎需内嵌 SQLite；profile/assets/插件包仍走文件系统

**变动人：** Auto

---

## 2026-11-21

### 模块：docs（文档）

**变动类型：** 新增

**变动描述：**
- 背景：需求文档 v0.1 已就绪，需将 M0–M3 里程碑拆解为可执行开发计划
- 新增 `docs/开发计划.md`：技术底座、monorepo 结构、各里程碑工作包/周计划/验收清单、API 落地顺序、solo 关键路径与首批 Backlog

**影响范围：**
- 文档：`docs/开发计划.md`、`docs/changelog/CHANGELOG.md`
- 无代码/接口/表结构变更

**变动人：** Auto
