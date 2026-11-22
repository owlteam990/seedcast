/**
 * flow.json 步骤类型（v1 最小集）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

/**
 * 支持的步骤动作
 */
export type FlowAction =
  | 'goto'
  | 'waitFor'
  | 'click'
  | 'fill'
  | 'insertText'
  | 'press'
  | 'upload'
  | 'select'
  | 'sleep'
  | 'extract'
  | 'currentUrl';

/**
 * 单步定义（选择器一律为 selectors.json 的键，禁止裸 CSS）
 */
export interface FlowStep {
  /** 动作 */
  action: FlowAction;
  /** 选择器键（引用 selectors.json） */
  selector?: string;
  /** 目标 URL 或模板 */
  url?: string;
  /** 填入值或模板 */
  value?: string;
  /** 按键名（press） */
  key?: string;
  /** 上传文件路径或模板 */
  file?: string;
  /** select 的 option 值 */
  option?: string;
  /** sleep 毫秒；waitFor 时也可作超时 */
  ms?: number;
  /**
   * waitFor 等待状态：visible（默认）/ enabled / attached / hidden
   */
  state?: 'visible' | 'enabled' | 'attached' | 'hidden';
  /**
   * 为 true 时：value/file 模板渲染后为空则跳过本步（可选话题/封面等）
   */
  skipIfEmpty?: boolean;
  /** extract 写入变量名 */
  as?: string;
  /** extract 属性名；缺省取 textContent */
  attr?: string;
}

/**
 * flow 文件结构
 */
export interface FlowFile {
  /**
   * 默认发布流程（无 publishType 或兼容旧插件时使用）
   */
  publish: FlowStep[];
  /**
   * 按发布类型分流（如知乎：article / question / pin / video）
   * key 与 schema.settings.publishType 枚举对齐
   */
  publishByType?: Record<string, FlowStep[]>;
  /** 可选：登录检测流程 */
  checkSession?: FlowStep[];
}

/**
 * 步骤失败结构化信息
 */
export interface FlowStepError {
  /** 错误码 */
  code: string;
  /** 步骤索引 */
  stepIndex: number;
  /** 动作 */
  step: FlowAction;
  /** 选择器键 */
  selector?: string;
  /** 可读消息 */
  message: string;
  /** 截图路径 */
  screenshot?: string;
}
