# scripts

- **可提交**：仓库内可复用的正式脚本（若有）放本目录非 `local/` 路径。
- **不可提交**：一次性测试、冒烟、本地调试脚本请放 `scripts/local/`（已被 `.gitignore` 忽略），或使用 `*.local.sh` / `*.local.ts` 命名。

日志请写到 `logs/` 或 `~/.seedcast/logs/`，本地数据写到 `local-data/` 或 `~/.seedcast/`——均不进入版本库。
