import { IFFIManager, WindowsAPI } from './types';
import { ffiTypes } from './ffi-types';

/**
 * FFI (Foreign Function Interface) 管理类
 * 负责Windows API的初始化和管理
 */
export class FFIManager implements IFFIManager {
  private static instance: FFIManager;
  private ffiInitialized = false;
  private ffiInitializationFailed = false;
  private windowsAPI: WindowsAPI = {};

  // 系统拦截相关变量
  private isShutdownBlocked = false;
  private shutdownHookHandle: any = null;
  private powerNotificationHandle: any = null;
  private executionStateHandle: any = null;
  private keyboardHookHandle: any = null;
  private isClientClosing = false;

  private constructor() {}

  public static getInstance(): FFIManager {
    if (!FFIManager.instance) {
      FFIManager.instance = new FFIManager();
    }
    return FFIManager.instance;
  }

  /**
   * 初始化FFI
   */
  public async initFFI(): Promise<void> {
    // 如果已经初始化过了，直接返回
    if (this.ffiInitialized || this.ffiInitializationFailed) {
      return;
    }

    // 只在 Windows 系统上尝试初始化 FFI
    if (process.platform !== 'win32') {
      this.ffiInitializationFailed = true;
      console.log('非Windows系统，跳过FFI初始化');
      return;
    }

    try {
      // 使用 koffi 替代 ffi-napi - 更好的 Node.js 20+ 支持
      const ffi = require('koffi');
      
      // 测试 koffi 是否可用
      if (!ffi || typeof ffi.load !== 'function') {
        throw new Error('koffi 导入失败或版本不兼容');
      }

      // 初始化统一的 FFI 类型定义
      ffiTypes.init();

      // 使用 koffi 加载系统 DLL
      // const user32Lib = ffi.load('user32.dll');
      const kernel32Lib = ffi.load('kernel32.dll');
      const powrprofLib = ffi.load('powrprof.dll');

      // 使用统一的 POINT 结构体定义
      const Point = ffiTypes.POINT;

      // 定义 Windows API 函数 - 只保留核心功能
      // const GetCursorPos = user32Lib.func('bool __stdcall GetCursorPos(void* lpPoint)');
      // const SetCursorPos = user32Lib.func('bool __stdcall SetCursorPos(int X, int Y)');

      // 基本系统API
      const SetThreadExecutionState = kernel32Lib.func('uint32_t __stdcall SetThreadExecutionState(uint32_t esFlags)');
      const GetCurrentProcess = kernel32Lib.func('void* __stdcall GetCurrentProcess()');
      const GetCurrentProcessId = kernel32Lib.func('uint32_t __stdcall GetCurrentProcessId()');
      const GetCurrentThreadId = kernel32Lib.func('uint32_t __stdcall GetCurrentThreadId()');

      // 电源管理API
      const SetSuspendState = powrprofLib.func('bool __stdcall SetSuspendState(bool fHibernate, bool fForce, bool fWakeupEventsDisabled)');

      // 将函数暴露给内部变量 - 最小化版本
      // this.windowsAPI.user32 = {
      //   SetCursorPos,
      //   GetCursorPos
      // };
      
      this.windowsAPI.kernel32 = {
        GetCurrentProcess,
        SetThreadExecutionState,
        GetCurrentThreadId,
        GetCurrentProcessId
      };

      this.windowsAPI.powrprof = {
        SetSuspendState
      };

      this.windowsAPI.Point = Point;

      // 测试 API 调用是否正常工作 - 使用简单的系统调用测试
      try {
        const pid = this.windowsAPI.kernel32!.GetCurrentProcessId();
        if (!pid) {
          throw new Error('获取进程ID失败');
        }
        console.log(`FFI测试成功，当前进程ID: ${pid}`);
      } catch (testError) {
        throw new Error(`Windows API 测试调用失败: ${testError}`);
      }

      this.ffiInitialized = true;
      console.log('Koffi FFI 初始化成功，系统拦截功能已就绪');
      
    } catch (error) {
      this.ffiInitializationFailed = true;
      this.windowsAPI = {};
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Koffi FFI 初始化失败，将使用降级方案。错误: ${errorMessage}`);
      
      if (errorMessage.includes('native callback') || errorMessage.includes('electron')) {
        console.log('检测到 Electron 原生模块兼容性问题，建议运行: npm run electron:rebuild');
      }
    }
  }

  /**
   * 异步初始化函数，避免阻塞主线程
   */
  public async initFFIAsync(): Promise<void> {
    return new Promise<void>((resolve) => {
      // 使用 setTimeout 确保在下一个事件循环中执行
      setTimeout(async () => {
        try {
          await this.initFFI();
        } catch (error) {
          // 确保初始化错误不会影响应用启动
          console.warn('FFI 异步初始化出错，使用降级方案', error);
          this.ffiInitializationFailed = true;
        }
        resolve();
      }, 100); // 延迟 100ms 以确保 Electron 环境完全初始化
    });
  }

  /**
   * 检查FFI是否已初始化
   */
  public isFFIInitialized(): boolean {
    return this.ffiInitialized;
  }

  /**
   * 检查FFI初始化是否失败
   */
  public isFFIInitializationFailed(): boolean {
    return this.ffiInitializationFailed;
  }

  /**
   * 获取Windows API对象
   */
  public getWindowsAPI(): WindowsAPI {
    return this.windowsAPI;
  }

  /**
   * 检查是否支持Windows API
   */
  public isWindowsApiAvailable(): boolean {
    return this.ffiInitialized && !!this.windowsAPI.user32 && !!this.windowsAPI.kernel32;
  }

  /**
   * 重置FFI状态
   */
  public reset(): void {
    this.ffiInitialized = false;
    this.ffiInitializationFailed = false;
    this.windowsAPI = {};
    this.isShutdownBlocked = false;
    this.shutdownHookHandle = null;
    this.powerNotificationHandle = null;
    this.executionStateHandle = null;
    this.keyboardHookHandle = null;
    this.isClientClosing = false;
  }

  /**
   * 获取系统拦截状态
   */
  public getSystemInterceptionState() {
    return {
      isShutdownBlocked: this.isShutdownBlocked,
      hasShutdownHook: !!this.shutdownHookHandle,
      hasPowerNotification: !!this.powerNotificationHandle,
      hasExecutionState: !!this.executionStateHandle,
      hasKeyboardHook: !!this.keyboardHookHandle,
      isClientClosing: this.isClientClosing
    };
  }

  /**
   * 设置系统拦截状态
   */
  public setSystemInterceptionState(state: Partial<{
    isShutdownBlocked: boolean;
    shutdownHookHandle: any;
    powerNotificationHandle: any;
    executionStateHandle: any;
    keyboardHookHandle: any;
    isClientClosing: boolean;
  }>) {
    if (state.isShutdownBlocked !== undefined) this.isShutdownBlocked = state.isShutdownBlocked;
    if (state.shutdownHookHandle !== undefined) this.shutdownHookHandle = state.shutdownHookHandle;
    if (state.powerNotificationHandle !== undefined) this.powerNotificationHandle = state.powerNotificationHandle;
    if (state.executionStateHandle !== undefined) this.executionStateHandle = state.executionStateHandle;
    if (state.keyboardHookHandle !== undefined) this.keyboardHookHandle = state.keyboardHookHandle;
    if (state.isClientClosing !== undefined) this.isClientClosing = state.isClientClosing;
  }
}

// 导出单例实例
export const ffiManager = FFIManager.getInstance(); 