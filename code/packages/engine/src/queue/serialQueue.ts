/**
 * 全局串行任务队列
 *
 * @author Seedcast
 * @date 2026-11-21
 */

/**
 * 队列任务包装
 */
interface QueueJob<T> {
  /** 执行函数 */
  run: () => Promise<T>;
  /** resolve */
  resolve: (value: T) => void;
  /** reject */
  reject: (reason?: unknown) => void;
}

/**
 * 串行队列：同一时间只跑一个 job
 */
export class SerialQueue {
  private readonly pending: Array<QueueJob<unknown>> = [];
  private running = false;

  /**
   * 入队并等待结果
   *
   * @param run 异步任务
   * @returns 任务结果
   * @author Seedcast
   * @date 2026-11-21
   */
  enqueue<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        run: run as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      void this.pump();
    });
  }

  /**
   * 当前是否有任务在跑或等待
   *
   * @returns 是否繁忙
   * @author Seedcast
   * @date 2026-11-21
   */
  isBusy(): boolean {
    return this.running || this.pending.length > 0;
  }

  /**
   * 拉动队列
   */
  private async pump(): Promise<void> {
    if (this.running) {
      return;
    }
    const next = this.pending.shift();
    if (!next) {
      return;
    }
    this.running = true;
    try {
      const value = await next.run();
      next.resolve(value);
    } catch (err) {
      next.reject(err);
    } finally {
      this.running = false;
      void this.pump();
    }
  }
}
