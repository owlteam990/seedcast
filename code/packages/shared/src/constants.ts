/**
 * 引擎与插件契约相关常量
 *
 * @author Seedcast
 * @date 2026-11-21
 */

/** 当前引擎支持的插件 apiVersion */
export const ENGINE_API_VERSION = 1;

/** SQLite 当前目标 schema 版本（与 migrations 最新 version 对齐） */
export const SCHEMA_VERSION = 2;

/** 默认数据根目录名（位于用户 home 下） */
export const DATA_DIR_NAME = '.seedcast';

/** 相对数据根的 SQLite 库路径 */
export const DB_RELATIVE_PATH = 'db/seedcast.sqlite';

/** 引擎运行时元信息文件（端口与 Token） */
export const ENGINE_META_FILE = 'engine.json';

/** 包命名空间前缀 */
export const PACKAGE_SCOPE = '@seedcast';
