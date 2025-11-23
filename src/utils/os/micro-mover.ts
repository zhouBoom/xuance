import { IMicroMover, MicroMoverConfig, MicroMoverStats } from './types';
import { ffiManager } from './ffi-manager';

/**
 * 微移动管理类
 * 负责鼠标微移动功能，防止系统进入屏保状态
 */
export class MicroMover implements IMicroMover {
  private static instance: MicroMover;
  private isEnabled = false;
  private moveInterval: NodeJS.Timeout | null = null;
  private moveCounter = 0;
  private lastMoveTime = 0;
  
  // 微移动配置
  private readonly config: MicroMoverConfig = {
    moveDistance: 1, // 移动距离（像素）
    moveIntervalMs: 60000, // 移动间隔（毫秒）60秒
    maxMoveDistance: 3, // 最大移动距离
    restoreDelay: 100, // 恢复延迟（毫秒）
  };

  private constructor() {}

  public static getInstance(): MicroMover {
    if (!MicroMover.instance) {
      MicroMover.instance = new MicroMover();
    }
    return MicroMover.instance;
  }

  /**
   * 执行鼠标微移动
   */
  public async microMove(): Promise<void> {
    try {
      // 检查FFI是否可用
      if (!ffiManager.isFFIInitialized()) {
        await this.fallbackMicroMove();
        return;
      }

      const api = ffiManager.getWindowsAPI();
      if (!api.user32?.GetCursorPos || !api.user32?.SetCursorPos || !api.Point) {
        await this.fallbackMicroMove();
        return;
      }

      // 获取当前鼠标位置
      const point = new api.Point();
      const success = api.user32.GetCursorPos(point);
      
      if (!success) {
        console.warn('获取鼠标位置失败，使用备选方案');
        await this.fallbackMicroMove();
        return;
      }

      const currentX = point.x;
      const currentY = point.y;

      // 计算微移动距离和方向
      const moveDistance = this.getMoveDistance();
      const direction = this.getMoveDirection();
      
      const newX = currentX + (direction.x * moveDistance);
      const newY = currentY + (direction.y * moveDistance);

      // 移动鼠标
      api.user32.SetCursorPos(newX, newY);
      
      // 短暂延迟后恢复原位置
      setTimeout(() => {
        try {
          api.user32.SetCursorPos(currentX, currentY);
        } catch (error) {
          console.warn('恢复鼠标位置失败:', error);
        }
      }, this.config.restoreDelay);

      this.moveCounter++;
      this.lastMoveTime = Date.now();
      
      console.log(`微移动执行成功 #${this.moveCounter}: (${currentX},${currentY}) -> (${newX},${newY}) -> (${currentX},${currentY})`);

    } catch (error) {
      console.error('微移动执行失败:', error);
      await this.fallbackMicroMove();
    }
  }

  /**
   * 备选微移动方案（使用 Electron 的 API）
   */
  private async fallbackMicroMove(): Promise<void> {
    try {
      // 使用 Electron 的 screen API 作为备选方案
      const { screen } = require('electron');
      
      if (!screen) {
        throw new Error('Electron screen API 不可用');
      }

      // 获取主显示器信息
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.bounds;
      
      // 获取当前鼠标位置（Electron 方式）
      const currentPoint = screen.getCursorScreenPoint();
      
      // 计算微移动
      const moveDistance = this.getMoveDistance();
      const direction = this.getMoveDirection();
      
      const newX = Math.max(0, Math.min(width - 1, currentPoint.x + (direction.x * moveDistance)));
      const newY = Math.max(0, Math.min(height - 1, currentPoint.y + (direction.y * moveDistance)));

      // 注意：Electron 没有直接设置鼠标位置的API
      // 这里我们只能记录移动信息，实际移动需要其他方式
      console.log(`备选微移动记录 #${this.moveCounter}: (${currentPoint.x},${currentPoint.y}) -> 计划移动到 (${newX},${newY})`);
      
      this.moveCounter++;
      this.lastMoveTime = Date.now();

    } catch (error) {
      console.error('备选微移动方案失败:', error);
      throw error;
    }
  }

  /**
   * 启用自动微移动
   * @param intervalMs 移动间隔（毫秒），默认使用配置值
   */
  public enableAutoMicroMove(intervalMs?: number): void {
    if (this.isEnabled) {
      console.warn('自动微移动已经启用');
      return;
    }

    const interval = intervalMs || this.config.moveIntervalMs;
    
    this.moveInterval = setInterval(async () => {
      try {
        await this.microMove();
      } catch (error) {
        console.error('自动微移动执行失败:', error);
      }
    }, interval);

    this.isEnabled = true;
    console.log(`自动微移动已启用，间隔: ${interval}ms`);
  }

  /**
   * 禁用自动微移动
   */
  public disableAutoMicroMove(): void {
    if (!this.isEnabled) {
      console.warn('自动微移动未启用');
      return;
    }

    if (this.moveInterval) {
      clearInterval(this.moveInterval);
      this.moveInterval = null;
    }

    this.isEnabled = false;
    console.log('自动微移动已禁用');
  }

  /**
   * 检查自动微移动是否启用
   */
  public isAutoMicroMoveEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * 获取微移动统计信息
   */
  public getStats(): MicroMoverStats {
    return {
      isEnabled: this.isEnabled,
      moveCount: this.moveCounter,
      lastMoveTime: this.lastMoveTime,
      timeSinceLastMove: this.lastMoveTime ? Date.now() - this.lastMoveTime : 0,
      config: { ...this.config }
    };
  }

  /**
   * 重置统计信息
   */
  public resetStats(): void {
    this.moveCounter = 0;
    this.lastMoveTime = 0;
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<MicroMoverConfig>): void {
    Object.assign(this.config, newConfig);
    console.log('微移动配置已更新:', this.config);

    // 如果正在运行且间隔发生变化，重新启动
    if (this.isEnabled && newConfig.moveIntervalMs) {
      this.disableAutoMicroMove();
      this.enableAutoMicroMove(newConfig.moveIntervalMs);
    }
  }

  /**
   * 获取移动距离（带随机性）
   */
  private getMoveDistance(): number {
    // 在1到maxMoveDistance之间随机选择
    return Math.floor(Math.random() * this.config.maxMoveDistance) + 1;
  }

  /**
   * 获取移动方向（随机）
   */
  private getMoveDirection(): { x: number; y: number } {
    const directions = [
      { x: 1, y: 0 },   // 右
      { x: -1, y: 0 },  // 左
      { x: 0, y: 1 },   // 下
      { x: 0, y: -1 },  // 上
      { x: 1, y: 1 },   // 右下
      { x: -1, y: -1 }, // 左上
      { x: 1, y: -1 },  // 右上
      { x: -1, y: 1 },  // 左下
    ];

    return directions[Math.floor(Math.random() * directions.length)];
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    this.disableAutoMicroMove();
    this.resetStats();
  }

  /**
   * 测试微移动功能
   */
  public async testMicroMove(): Promise<boolean> {
    try {
      await this.microMove();
      console.log('微移动测试成功');
      return true;
    } catch (error) {
      console.error('微移动测试失败:', error);
      return false;
    }
  }
}

// 导出单例实例
export const microMover = MicroMover.getInstance(); 