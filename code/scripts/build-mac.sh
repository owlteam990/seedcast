#!/usr/bin/env bash
# Seedcast macOS 编译 / 打包脚本
# 产物：apps/desktop/dist-bundle/Seedcast_*.dmg（含引擎 sidecar）
#
# 用法：
#   ./scripts/build-mac.sh              # 完整：install → build → sidecar → dmg
#   ./scripts/build-mac.sh --skip-install
#   ./scripts/build-mac.sh --sidecar-only
#   ./scripts/build-mac.sh --dev-check   # 仅 typecheck + engine build（不出包）
#
# 前置：Node ≥20、pnpm ≥9、Rust（cargo）、Bun、Xcode CLT
# 详见：docs/打包说明.md

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_INSTALL=0
SIDECAR_ONLY=0
DEV_CHECK=0

for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=1 ;;
    --sidecar-only) SIDECAR_ONLY=1 ;;
    --dev-check) DEV_CHECK=1 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *)
      echo "未知参数: $arg（可用 --help）" >&2
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "本脚本仅支持 macOS。" >&2
  exit 1
fi

log() {
  printf '\n==> %s\n' "$*"
}

need() {
  local bin="$1"
  local hint="${2:-}"
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "缺少依赖: $bin${hint:+ — $hint}" >&2
    exit 1
  fi
}

log "检查工具链"
need node "https://nodejs.org （≥20）"
need pnpm "corepack enable && corepack prepare pnpm@latest --activate"
need cargo "https://rustup.rs （Tauri 2）"
need bun "https://bun.sh （引擎 sidecar 编译）"
need xcodebuild "xcode-select --install"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "需要 Node ≥20，当前: $(node -v)" >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) TRIPLE="aarch64-apple-darwin" ;;
  x86_64) TRIPLE="x86_64-apple-darwin" ;;
  *)
    echo "不支持的架构: $ARCH" >&2
    exit 1
    ;;
esac
echo "主机: Darwin $ARCH → sidecar triple: $TRIPLE"
echo "Node $(node -v) · pnpm $(pnpm -v) · bun $(bun --version) · rustc $(rustc --version | awk '{print $2}')"

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  log "pnpm install"
  pnpm install
else
  log "跳过 pnpm install（--skip-install）"
fi

log "构建 workspace（shared / engine / app 前端类型）"
pnpm --filter @seedcast/shared build
pnpm --filter @seedcast/engine build
pnpm --filter @seedcast/app typecheck

if [[ "$DEV_CHECK" -eq 1 ]]; then
  log "dev-check 完成（未打 sidecar / dmg）"
  exit 0
fi

log "编译引擎 sidecar（Bun --compile）"
pnpm --filter @seedcast/engine sidecar
SIDECAR="$ROOT/apps/desktop/src-tauri/binaries/seedcast-engine-${TRIPLE}"
if [[ ! -f "$SIDECAR" ]]; then
  echo "sidecar 未生成: $SIDECAR" >&2
  exit 1
fi
ls -lh "$SIDECAR"

if [[ "$SIDECAR_ONLY" -eq 1 ]]; then
  log "sidecar-only 完成"
  exit 0
fi

log "Tauri release 打包（dmg）"
# 清掉沙箱可能注入的 CARGO_TARGET_DIR，保证产物落在 src-tauri/target
unset CARGO_TARGET_DIR || true
pnpm --filter @seedcast/app tauri:build

log "收集产物到 apps/desktop/dist-bundle/"
OUT_DIR="$ROOT/apps/desktop/dist-bundle"
mkdir -p "$OUT_DIR"

DMG=""
# 1) 默认路径
CANDIDATE="$ROOT/apps/desktop/src-tauri/target/release/bundle/dmg"
if [[ -d "$CANDIDATE" ]]; then
  DMG="$(ls -t "$CANDIDATE"/Seedcast_*.dmg 2>/dev/null | head -1 || true)"
fi
# 2) 若设置过其它 target dir，再搜一层常见缓存（可选）
if [[ -z "${DMG}" ]]; then
  DMG="$(find "$ROOT/apps/desktop/src-tauri/target" -name 'Seedcast_*.dmg' 2>/dev/null | head -1 || true)"
fi

if [[ -z "${DMG}" || ! -f "${DMG}" ]]; then
  echo "未找到 Seedcast_*.dmg。请检查 tauri build 日志中的 Bundling 路径。" >&2
  exit 1
fi

cp -f "$DMG" "$OUT_DIR/"
FINAL="$OUT_DIR/$(basename "$DMG")"
ls -lh "$FINAL"

log "完成"
echo "dmg:      $FINAL"
echo "sidecar:  $SIDECAR"
echo "打开:     open \"$FINAL\""
echo "说明:     未签名时 Gatekeeper 可能拦截 → 右键打开；需本机 Chrome。"
