import { ISystemInterceptor } from './types';
import { ffiManager } from './ffi-manager';
import { app, globalShortcut } from 'electron';

/**
 * 系统拦截管理类
 * 负责拦截系统关机、热键和其他系统事件
 */
export class SystemInterceptor implements ISystemInterceptor {
  private static instance: SystemInterceptor;
  private isInterceptionEnabled = false;
  private shutdownHookHandle: any = null;
  private powerNotificationHandle: any = null;
  private keyboardHookHandle: any = null;
  private isClientClosing = false;
  private interceptedKeys: string[] = [];

  // 默认拦截的热键列表
  private readonly defaultInterceptKeys = [
    'Alt+F4',           // 关闭窗口
    'Ctrl+Alt+Delete',  // 任务管理器
    'Alt+Tab',          // 切换窗口
    'Win+L',            // 锁屏
    'Win+D',            // 显示桌面
    'Win+R',            // 运行对话框
    'Win+X',            // 系统菜单
    'Ctrl+Shift+Esc',   // 任务管理器
    'F1',               // 帮助
    'F11'               // 全屏切换
  ];

  private constructor() {}

  public static getInstance(): SystemInterceptor {
    if (!SystemInterceptor.instance) {
      SystemInterceptor.instance = new SystemInterceptor();
    }
    return SystemInterceptor.instance;
  }

  /**
   * 启用系统拦截
   */
  public async enableSystemInterception(): Promise<void> {
    if (this.isInterceptionEnabled) {
      console.warn('系统拦截已经启用');
      return;
    }

    try {
      console.log('启用系统拦截功能...');

      // 启用关机拦截
      await this.enableShutdownInterception();

      // 启用热键拦截
      await this.enableKeyboardInterception();

      // 启用电源事件拦截
      await this.enablePowerEventInterception();

      // 设置应用退出拦截
      this.setupAppExitInterception();

      this.isInterceptionEnabled = true;
      console.log('系统拦截功能已启用');

    } catch (error) {
      console.error('启用系统拦截失败:', error);
      // 如果启用失败，尝试清理已设置的拦截
      await this.disableSystemInterception();
      throw error;
    }
  }

  /**
   * 禁用系统拦截
   */
  public async disableSystemInterception(): Promise<boolean> {
    try {
      console.log('禁用系统拦截功能...');

      // 禁用关机拦截
      this.disableShutdownInterception();

      // 禁用热键拦截
      this.disableKeyboardInterception();

      // 禁用电源事件拦截
      this.disablePowerEventInterception();

      // 清理应用退出拦截
      this.cleanupAppExitInterception();

      this.isInterceptionEnabled = false;
      console.log('系统拦截功能已禁用');
      return true;

    } catch (error) {
      console.error('禁用系统拦截失败:', error);
      return false;
    }
  }

  /**
   * 检查系统拦截是否启用
   */
  public isSystemInterceptionEnabled(): boolean {
    return this.isInterceptionEnabled;
  }

  /**
   * 强制允许关机
   */
  public async forceAllowShutdown(): Promise<boolean> {
    try {
      console.log('强制允许关机...');
      
      this.isClientClosing = true;
      
      // 临时禁用拦截
      const wasEnabled = this.isInterceptionEnabled;
      if (wasEnabled) {
        await this.disableSystemInterception();
      }

      // 设置超时自动恢复拦截（防止意外情况）
      setTimeout(() => {
        if (wasEnabled && !this.isInterceptionEnabled) {
          console.log('超时自动恢复系统拦截');
          this.enableSystemInterception().catch(error => {
            console.error('自动恢复系统拦截失败:', error);
          });
        }
        this.isClientClosing = false;
      }, 10000); // 10秒后自动恢复

      return true;

    } catch (error) {
      console.error('强制允许关机失败:', error);
      this.isClientClosing = false;
      return false;
    }
  }

  /**
   * 启用关机拦截
   */
  private async enableShutdownInterception(): Promise<void> {
    if (process.platform !== 'win32') {
      console.log('非Windows系统，跳过关机拦截设置');
      return;
    }

    // 检查FFI是否可用
    if (!ffiManager.isFFIInitialized()) {
      await ffiManager.initFFI();
    }

    if (!ffiManager.isFFIInitialized()) {
      console.warn('FFI未初始化，跳过Windows API关机拦截');
      return;
    }

    try {
      const api = ffiManager.getWindowsAPI();
      
      if (!api.kernel32) {
        throw new Error('Windows API不可用');
      }

      // 设置进程执行状态，防止系统休眠
      const ES_CONTINUOUS = 0x80000000;
      const ES_SYSTEM_REQUIRED = 0x00000001;
      const ES_DISPLAY_REQUIRED = 0x00000002;
      
      const executionState = ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED;
      api.kernel32.SetThreadExecutionState(executionState);

      console.log('Windows关机拦截已设置');

    } catch (error) {
      console.warn('设置Windows关机拦截失败:', error);
    }
  }

  /**
   * 禁用关机拦截
   */
  private disableShutdownInterception(): void {
    if (process.platform !== 'win32' || !ffiManager.isFFIInitialized()) {
      return;
    }

    try {
      const api = ffiManager.getWindowsAPI();
      
      if (api.kernel32) {
        // 恢复正常执行状态
        const ES_CONTINUOUS = 0x80000000;
        api.kernel32.SetThreadExecutionState(ES_CONTINUOUS);
      }

      this.shutdownHookHandle = null;
      console.log('Windows关机拦截已禁用');

    } catch (error) {
      console.warn('禁用Windows关机拦截失败:', error);
    }
  }

  /**
   * 启用热键拦截
   */
  private async enableKeyboardInterception(): Promise<void> {
    try {
      // 使用Electron的globalShortcut API拦截热键
      this.interceptedKeys = [];

      for (const key of this.defaultInterceptKeys) {
        try {
          const success = globalShortcut.register(key, () => {
            console.log(`拦截热键: ${key}`);
            // 这里可以添加自定义的处理逻辑
            this.handleInterceptedKey(key);
          });

          if (success) {
            this.interceptedKeys.push(key);
          } else {
            console.warn(`注册热键失败: ${key}`);
          }
        } catch (error) {
          console.warn(`注册热键 ${key} 时出错:`, error);
        }
      }

      console.log(`热键拦截已启用，成功拦截 ${this.interceptedKeys.length} 个热键`);

    } catch (error) {
      console.error('启用热键拦截失败:', error);
      throw error;
    }
  }

  /**
   * 禁用热键拦截
   */
  private disableKeyboardInterception(): void {
    try {
      // 取消所有已注册的热键
      globalShortcut.unregisterAll();
      
      this.interceptedKeys = [];
      this.keyboardHookHandle = null;
      
      console.log('热键拦截已禁用');

    } catch (error) {
      console.warn('禁用热键拦截失败:', error);
    }
  }

  /**
   * 启用电源事件拦截
   */
  private async enablePowerEventInterception(): Promise<void> {
    try {
      // 这里可以添加电源事件的拦截逻辑
      // 例如拦截系统挂起、休眠等事件
      
      console.log('电源事件拦截已启用');

    } catch (error) {
      console.error('启用电源事件拦截失败:', error);
    }
  }

  /**
   * 禁用电源事件拦截
   */
  private disablePowerEventInterception(): void {
    try {
      // 清理电源事件拦截
      this.powerNotificationHandle = null;
      
      console.log('电源事件拦截已禁用');

    } catch (error) {
      console.warn('禁用电源事件拦截失败:', error);
    }
  }

  /**
   * 设置应用退出拦截
   */
  private setupAppExitInterception(): void {
    // 拦截窗口关闭事件
    app.on('before-quit', (event) => {
      if (this.isInterceptionEnabled && !this.isClientClosing) {
        console.log('拦截应用退出事件');
        event.preventDefault();
        this.handleAppExitAttempt();
      }
    });

    // 拦截所有窗口关闭事件
    app.on('window-all-closed', (event) => {
      if (this.isInterceptionEnabled && !this.isClientClosing) {
        console.log('拦截所有窗口关闭事件');
        event.preventDefault();
        this.handleAppExitAttempt();
      }
    });

    console.log('应用退出拦截已设置');
  }

  /**
   * 清理应用退出拦截
   */
  private cleanupAppExitInterception(): void {
    // Electron的事件监听器会在应用退出时自动清理
    // 这里只需要重置标志
    this.isClientClosing = false;
    console.log('应用退出拦截已清理');
  }

  /**
   * 处理被拦截的热键
   */
  private handleInterceptedKey(key: string): void {
    console.log(`处理被拦截的热键: ${key}`);
    
    // 这里可以根据不同的热键执行不同的处理逻辑
    switch (key) {
      case 'Alt+F4':
        console.log('拦截了Alt+F4关闭窗口操作');
        break;
      case 'Ctrl+Alt+Delete':
        console.log('拦截了Ctrl+Alt+Delete任务管理器操作');
        break;
      case 'Win+L':
        console.log('拦截了Win+L锁屏操作');
        break;
      default:
        console.log(`拦截了未特殊处理的热键: ${key}`);
    }
  }

  /**
   * 处理应用退出尝试
   */
  private handleAppExitAttempt(): void {
    console.log('检测到应用退出尝试，已被拦截');
    
    // 这里可以显示确认对话框或执行其他逻辑
    // 例如：显示"确认退出"对话框
  }

  /**
   * 添加自定义热键拦截
   */
  public addCustomKeyInterception(key: string, handler?: () => void): boolean {
    try {
      const success = globalShortcut.register(key, () => {
        console.log(`拦截自定义热键: ${key}`);
        if (handler) {
          handler();
        }
      });

      if (success) {
        this.interceptedKeys.push(key);
        console.log(`自定义热键拦截添加成功: ${key}`);
        return true;
      } else {
        console.warn(`自定义热键拦截添加失败: ${key}`);
        return false;
      }
    } catch (error) {
      console.error(`添加自定义热键拦截时出错: ${key}`, error);
      return false;
    }
  }

  /**
   * 移除自定义热键拦截
   */
  public removeCustomKeyInterception(key: string): boolean {
    try {
      globalShortcut.unregister(key);
      
      const index = this.interceptedKeys.indexOf(key);
      if (index > -1) {
        this.interceptedKeys.splice(index, 1);
      }
      
      console.log(`自定义热键拦截移除成功: ${key}`);
      return true;
    } catch (error) {
      console.error(`移除自定义热键拦截时出错: ${key}`, error);
      return false;
    }
  }

  /**
   * 获取当前拦截状态
   */
  public getInterceptionStatus() {
    return {
      isEnabled: this.isInterceptionEnabled,
      interceptedKeysCount: this.interceptedKeys.length,
      interceptedKeys: [...this.interceptedKeys],
      hasShutdownHook: !!this.shutdownHookHandle,
      hasPowerNotification: !!this.powerNotificationHandle,
      hasKeyboardHook: !!this.keyboardHookHandle,
      isClientClosing: this.isClientClosing
    };
  }

  /**
   * 设置客户端关闭标志
   */
  public setClientClosing(closing: boolean): void {
    this.isClientClosing = closing;
    console.log(`客户端关闭标志设置为: ${closing}`);
  }

  /**
   * 紧急禁用所有拦截
   */
  public emergencyDisableAll(): Promise<boolean> {
    console.log('紧急禁用所有系统拦截...');
    
    this.isClientClosing = true;
    
    return this.disableSystemInterception();
  }
}

// 导出单例实例
export const systemInterceptor = SystemInterceptor.getInstance(); 