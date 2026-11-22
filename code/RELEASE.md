# Seedcast 发版手册（GitHub Actions）

推送 `v*` tag 后，CI 在 **macOS（arm64 → `.dmg`）** 与 **Windows（x64 → NSIS `.exe`）** 上构建，并自动上传到 [GitHub Releases](https://github.com/owlteam990/seedcast/releases)。

工作流文件：仓库根 [`.github/workflows/release.yml`](../.github/workflows/release.yml)。

首版**不包含** Apple 公证、Windows 代码签名；Intel Mac 包未纳入矩阵。

---

## 发版前检查

1. `main` 已包含要发布的代码，且本地 / CI 可构建。
2. 版本号已 bump，至少更新：

   ```text
   code/apps/desktop/src-tauri/tauri.conf.json  →  "version": "x.y.z"
   ```

   建议与 tag 数字部分一致（tag `v0.1.1` ↔ version `0.1.1`）。
3. 提交并推送版本变更到 `origin/main`。

---

## 正式发版步骤

```bash
# 在仓库根目录（已 push main）
git checkout main
git pull origin main

# 打 tag（示例）
git tag v0.1.1
git push origin v0.1.1
```

然后：

1. 打开 https://github.com/owlteam990/seedcast/actions → **Release** 工作流  
2. 等待 `Build (macos-latest)` 与 `Build (windows-latest)` 成功，再跑 `Publish GitHub Release`  
3. 打开 https://github.com/owlteam990/seedcast/releases ，确认附件含：
   - `Seedcast_*.dmg`
   - `Seedcast_*-setup.exe`（或同目录 NSIS exe）
   - `SHA256SUMS.txt`

单平台构建上限约 90 分钟（冷编译 Rust + ~90MB sidecar）。

---

## 手动触发（试跑 / 补传）

Actions → Release → **Run workflow**：

- 输入已存在的 tag（如 `v0.1.0-rc.1`）
- CI 会 checkout 该 tag 对应提交再构建并更新该 tag 的 Release

含 `-` 的 tag（如 `v0.1.0-rc.1`）会标为 **prerelease**。

---

## 用户安装注意

| 平台 | 说明 |
|---|---|
| macOS | 未签名时 Gatekeeper 可能拦截 → 对 App **右键 → 打开** |
| Windows | 未签名可能触发 SmartScreen → 仍要运行 |
| 通用 | 浏览器类插件需要本机 **Google Chrome**；公众号开放接口草稿不依赖浏览器 |

校验下载文件：

```bash
shasum -a 256 -c SHA256SUMS.txt
# 或
sha256sum -c SHA256SUMS.txt
```

---

## 本机手工打包（可选）

CI 不可用时，仍可本机出包后手工挂到 Release：

```bash
cd code
./scripts/build-mac.sh          # → dist-bundle/*.dmg
# Windows：在 Win 机执行
#   pnpm install
#   pnpm --filter @seedcast/app tauri:build
# 产物在 apps/desktop/src-tauri/target/release/bundle/nsis/
```

更多细节见开发机本地文档 `docs/打包说明.md`（不随仓库发布）。

---

## 故障排查

| 现象 | 处理 |
|---|---|
| sidecar / bun 失败 | 确认 workflow 已 `setup-bun`；查看 `tauri:build` 日志中 `bun compile` |
| 找不到 `.dmg` / `.exe` | 看 `Collect installers` 步骤；确认 `bundle.targets` 含 `dmg`/`nsis` |
| Release 无权限 | 仓库 Actions 需允许 `GITHUB_TOKEN` 写 contents（workflow 已声明 `contents: write`） |
| 版本与 tag 不一致 | 仅影响安装包文件名中的版本字段；建议发版前对齐 `tauri.conf.json` |
