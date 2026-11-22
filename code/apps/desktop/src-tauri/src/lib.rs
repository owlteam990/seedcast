//! Seedcast Tauri 壳：发现 / 拉起本地引擎

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

/// 引擎进程句柄（壳生命周期内至多一个）
struct EngineProcess(Mutex<Option<Child>>);

/// engine.json 结构
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineMeta {
  host: String,
  port: u16,
  token: String,
  pid: u32,
  started_at: String,
}

/// 数据目录：SEEDCAST_DATA_DIR 或 ~/.seedcast
fn data_dir() -> PathBuf {
  if let Ok(dir) = std::env::var("SEEDCAST_DATA_DIR") {
    if !dir.trim().is_empty() {
      return PathBuf::from(dir);
    }
  }
  dirs_next::home_dir()
    .unwrap_or_else(|| PathBuf::from("."))
    .join(".seedcast")
}

/// 读取 engine.json
fn read_meta_file() -> Result<EngineMeta, String> {
  let path = data_dir().join("engine.json");
  let raw = fs::read_to_string(&path).map_err(|e| {
    format!("无法读取 {}: {}", path.display(), e)
  })?;
  // 文件字段为 camelCase（Node 侧 startedAt）
  #[derive(serde::Deserialize)]
  #[serde(rename_all = "camelCase")]
  struct Raw {
    host: String,
    port: u16,
    token: String,
    pid: u32,
    started_at: String,
  }
  let raw: Raw = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  Ok(EngineMeta {
    host: raw.host,
    port: raw.port,
    token: raw.token,
    pid: raw.pid,
    started_at: raw.started_at,
  })
}

/// 探测 /ping
fn ping_engine(meta: &EngineMeta) -> bool {
  let url = format!("http://{}:{}/ping", meta.host, meta.port);
  let agent = ureq::AgentBuilder::new()
    .timeout(Duration::from_secs(2))
    .build();
  match agent.get(&url).set("Authorization", &meta.token).call() {
    Ok(resp) => resp.status() == 200,
    Err(_) => false,
  }
}

/// 解析 monorepo code 根目录（开发期：相对本 crate）
fn resolve_code_root() -> Result<PathBuf, String> {
  // apps/desktop/src-tauri -> ../../..
  let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  let code_root = manifest_dir
    .join("../../..")
    .canonicalize()
    .map_err(|e| format!("无法解析 code 根目录: {e}"))?;
  Ok(code_root)
}

/// 解析发行包内 sidecar 路径（与主程序同目录）
fn resolve_sidecar_bin() -> Option<PathBuf> {
  let exe = std::env::current_exe().ok()?;
  let dir = exe.parent()?;
  let name = if cfg!(windows) {
    "seedcast-engine.exe"
  } else {
    "seedcast-engine"
  };
  let path = dir.join(name);
  if path.is_file() {
    Some(path)
  } else {
    None
  }
}

/// 解析内置插件目录（Tauri Resource + 相对主程序/sidecar）
fn resolve_builtin_plugins(app: &AppHandle) -> Option<PathBuf> {
  let mut candidates: Vec<PathBuf> = Vec::new();

  // 1. Tauri Resource（bundle.resources = "resources/plugins" → Resources/resources/plugins）
  if let Ok(resource_dir) = app.path().resource_dir() {
    candidates.push(resource_dir.join("plugins"));
    candidates.push(resource_dir.join("resources/plugins"));
  }

  // 2. 相对主程序 / sidecar（resource_dir 偶发解析失败时的回退）
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      candidates.push(dir.join("plugins"));
      candidates.push(dir.join("../Resources/plugins"));
      candidates.push(dir.join("../Resources/resources/plugins"));
      candidates.push(dir.join("resources/plugins"));
    }
  }

  for plugins in candidates {
    if plugins.is_dir() {
      return Some(plugins);
    }
  }
  None
}

/// 拉起引擎子进程：发行包优先 sidecar；开发期用 node dist/cli.js
fn spawn_engine(app: &AppHandle, state: &EngineProcess) -> Result<(), String> {
  let mut guard = state.0.lock().map_err(|e| e.to_string())?;
  if let Some(child) = guard.as_mut() {
    // 已有进程仍在跑则复用
    if child.try_wait().map_err(|e| e.to_string())?.is_none() {
      return Ok(());
    }
  }

  let builtin = resolve_builtin_plugins(app);
  let child = if let Some(sidecar) = resolve_sidecar_bin() {
    spawn_sidecar(&sidecar, builtin.as_deref())?
  } else if cfg!(debug_assertions) {
    spawn_dev_node(builtin.as_deref())?
  } else {
    return Err(
      "未找到引擎 sidecar（seedcast-engine）。请重新安装应用或检查打包产物。"
        .into(),
    );
  };

  *guard = Some(child);
  Ok(())
}

/// 发行态：执行 Bun compile 的 sidecar
fn spawn_sidecar(bin: &Path, builtin: Option<&Path>) -> Result<Child, String> {
  let mut cmd = Command::new(bin);
  cmd.stdout(Stdio::null()).stderr(Stdio::null());
  if let Some(dir) = builtin {
    cmd.env("SEEDCAST_BUILTIN_PLUGINS", dir);
  }
  cmd.spawn()
    .map_err(|e| format!("拉起引擎 sidecar 失败: {e}"))
}

/// 开发态：node packages/engine/dist/cli.js
fn spawn_dev_node(builtin: Option<&Path>) -> Result<Child, String> {
  let code_root = resolve_code_root()?;
  let cli = code_root.join("packages/engine/dist/cli.js");
  if !cli.exists() {
    return Err(format!(
      "引擎未构建：找不到 {}，请先 pnpm --filter @seedcast/engine build",
      cli.display()
    ));
  }

  let mut cmd = Command::new("node");
  cmd
    .arg(&cli)
    .current_dir(&code_root)
    .stdout(Stdio::null())
    .stderr(Stdio::null());
  if let Some(dir) = builtin {
    cmd.env("SEEDCAST_BUILTIN_PLUGINS", dir);
  }
  // 开发期也允许显式指向 monorepo plugins（loader 自身会回退）
  cmd.spawn()
    .map_err(|e| format!("拉起引擎失败: {e}"))
}

/// 读取本机引擎元信息
#[tauri::command]
fn get_engine_meta() -> Result<EngineMeta, String> {
  read_meta_file()
}

/// 确保引擎可用：已存活则返回 meta；否则拉起并轮询
#[tauri::command]
fn ensure_engine(
  app: AppHandle,
  state: State<'_, EngineProcess>,
) -> Result<EngineMeta, String> {
  if let Ok(meta) = read_meta_file() {
    if ping_engine(&meta) {
      return Ok(meta);
    }
  }

  spawn_engine(&app, &state)?;

  // 等待 engine.json 就绪
  for _ in 0..40 {
    std::thread::sleep(Duration::from_millis(250));
    if let Ok(meta) = read_meta_file() {
      if ping_engine(&meta) {
        return Ok(meta);
      }
    }
  }

  Err("引擎启动超时：请检查 Chrome / 引擎 sidecar 与数据目录权限".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(EngineProcess(Mutex::new(None)))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![get_engine_meta, ensure_engine])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
