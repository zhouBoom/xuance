import { app } from "electron";
import { IAppManager } from './types';

/**
 * 应用程序管理类
 * 负责应用程序的重启、退出等生命周期管理
 */
export class AppManager implements IAppManager {
  private static instance: AppManager;
  private isRestarting = false;
  private restartReason = '';

  private constructor() {}

  public static getInstance(): AppManager {
    if (!AppManager.instance) {
      AppManager.instance = new AppManager();
    }
    return AppManager.instance;
  }

  /**
   * 重启应用程序
   * @param reason 重启原因（用于日志记录）
   */
  public appRestart(reason: string = '用户手动重启'): void {
    if (this.isRestarting) {
      console.warn('应用程序已经在重启中，忽略重复的重启请求');
      return;
    }

    try {
      this.isRestarting = true;
      this.restartReason = reason;
      
      console.log(`应用程序重启中，原因: ${reason}`);
      
      // 重新启动应用程序
      app.relaunch();
      
      // 退出当前实例
      app.quit();
      
    } catch (error) {
      console.error('应用程序重启失败:', error);
      this.isRestarting = false;
      this.restartReason = '';
      throw error;
    }
  }

  /**
   * 安全退出应用程序
   * @param code 退出代码，默认为0
   * @param reason 退出原因
   */
  public safeQuit(code: number = 0, reason: string = '正常退出'): void {
    try {
      console.log(`应用程序退出中，原因: ${reason}，退出代码: ${code}`);
      
      // 可以在这里添加清理逻辑
      this.cleanup();
      
      app.exit(code);
    } catch (error) {
      console.error('应用程序退出失败:', error);
      // 强制退出
      process.exit(code);
    }
  }

  /**
   * 检查是否正在重启
   */
  public isAppRestarting(): boolean {
    return this.isRestarting;
  }

  /**
   * 获取重启原因
   */
  public getRestartReason(): string {
    return this.restartReason;
  }

  /**
   * 重置重启状态
   */
  public resetRestartState(): void {
    this.isRestarting = false;
    this.restartReason = '';
  }

  /**
   * 检查应用是否准备就绪
   */
  public isAppReady(): boolean {
    return app.isReady();
  }

  /**
   * 获取应用信息
   */
  public getAppInfo() {
    return {
      name: app.getName(),
      version: app.getVersion(),
      isReady: app.isReady(),
      isPackaged: app.isPackaged,
      path: app.getAppPath(),
      userData: app.getPath('userData'),
      isRestarting: this.isRestarting,
      restartReason: this.restartReason
    };
  }

  /**
   * 设置应用用户模型ID（Windows）
   * @param id 用户模型ID
   */
  public setAppUserModelId(id: string): void {
    if (process.platform === 'win32') {
      app.setAppUserModelId(id);
    }
  }

  /**
   * 请求单实例锁
   * @returns 是否成功获取锁
   */
  public requestSingleInstanceLock(): boolean {
    return app.requestSingleInstanceLock();
  }

  /**
   * 释放单实例锁
   */
  public releaseSingleInstanceLock(): void {
    app.releaseSingleInstanceLock();
  }

  /**
   * 设置为默认应用
   * @param protocol 协议名称
   * @returns 是否设置成功
   */
  public setAsDefaultProtocolClient(protocol: string): boolean {
    return app.setAsDefaultProtocolClient(protocol);
  }

  /**
   * 移除默认应用设置
   * @param protocol 协议名称
   * @returns 是否移除成功
   */
  public removeAsDefaultProtocolClient(protocol: string): boolean {
    return app.removeAsDefaultProtocolClient(protocol);
  }

  /**
   * 检查是否为默认应用
   * @param protocol 协议名称
   * @returns 是否为默认应用
   */
  public isDefaultProtocolClient(protocol: string): boolean {
    return app.isDefaultProtocolClient(protocol);
  }

  /**
   * 显示关于面板（macOS）
   * @param options 关于面板选项
   */
  public showAboutPanel(options?: any): void {
    if (process.platform === 'darwin') {
      if (options) {
        app.setAboutPanelOptions(options);
      }
      app.showAboutPanel();
    }
  }

  /**
   * 隐藏关于面板（macOS）
   */
  public hideAboutPanel(): void {
    if (process.platform === 'darwin') {
      app.hide();
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    try {
      // 在这里可以添加应用退出前的清理逻辑
      // 例如：清理定时器、关闭数据库连接、保存状态等
      console.log('应用程序清理中...');
      
      // 清理定时器等资源的示例
      // 实际使用时可以根据需要扩展
      
    } catch (error) {
      console.error('应用程序清理失败:', error);
    }
  }

  /**
   * 添加应用事件监听器
   */
  public setupAppEventListeners(): void {
    // 当所有窗口关闭时
    app.on('window-all-closed', () => {
      // 在macOS上，通常应用会保持活跃状态，即使没有打开的窗口
      if (process.platform !== 'darwin') {
        this.safeQuit(0, '所有窗口已关闭');
      }
    });

    // 应用激活时（macOS）
    app.on('activate', () => {
      // 在macOS上，当应用图标被点击且没有其他窗口打开时，通常会重新创建窗口
      console.log('应用程序被激活');
    });

    // 应用即将退出
    app.on('before-quit', (event) => {
      if (this.isRestarting) {
        console.log('应用程序重启中，跳过退出确认');
        return;
      }
      
      console.log('应用程序即将退出');
      // 在这里可以添加退出前的确认逻辑
    });

    // 应用退出时
    app.on('will-quit', (event) => {
      console.log('应用程序正在退出');
      // 在这里可以添加最后的清理逻辑
    });

    // 第二个实例启动时
    app.on('second-instance', () => {
      console.log('检测到第二个实例启动，聚焦到当前实例');
      // 可以在这里处理多实例的逻辑
    });
  }
}

// 导出单例实例
export const appManager = AppManager.getInstance(); 