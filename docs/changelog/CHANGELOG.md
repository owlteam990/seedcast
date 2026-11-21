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
