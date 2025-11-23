// 操作系统工具统一导出文件
// 采用模块化设计，提供清晰的接口和良好的扩展性

// 导出类型定义
export * from './types';

// 导出各个功能模块
export { SystemInfo, systemInfo } from './system-info';
export { DeviceManager, deviceManager } from './device-manager';
export { FFIManager, ffiManager } from './ffi-manager';
export { SystemMonitor, systemMonitor } from './system-monitor';
export { AppManager, appManager } from './app-manager';
export { MicroMover, microMover } from './micro-mover';
export { AntivirusManager, antivirusManager } from './antivirus-manager';
export { SystemInterceptor, systemInterceptor } from './system-interceptor';

// 为保持向后兼容性，导出原有的函数接口
import { systemInfo } from './system-info';
import { deviceManager } from './device-manager';
import { systemMonitor } from './system-monitor';
import { appManager } from './app-manager';
import { microMover } from './micro-mover';
import { antivirusManager } from './antivirus-manager';
import { systemInterceptor } from './system-interceptor';
import { ffiManager } from './ffi-manager';

/**
 * 获取操作系统版本信息
 * @deprecated 建议使用 systemInfo.getOsVersion()
 */
export function getOsVersion(): string {
  return systemInfo.getOsVersion();
}

/**
 * 获取MAC地址
 * @deprecated 建议使用 systemInfo.getMacAddress()
 */
export function getMacAddress(): string {
  return systemInfo.getMacAddress();
}

/**
 * 获取设备唯一标识符
 * @deprecated 建议使用 systemInfo.getDeviceUniqueId()
 */
export function getDeviceUniqueId(): string {
  return systemInfo.getDeviceUniqueId();
}

/**
 * 生成WebSocket设备ID
 * @deprecated 建议使用 deviceManager.getWSDeviceID()
 */
export function getWSDeviceID(red_uid: string, red_id: string, index: number = 1): string {
  return deviceManager.getWSDeviceID(red_uid, red_id, index);
}

/**
 * 根据设备ID获取红包ID
 * @deprecated 建议使用 deviceManager.getRedIdByWSDeviceID()
 */
export function getRedIdByWSDeviceID(deviceID: string): string | undefined {
  return deviceManager.getRedIdByWSDeviceID(deviceID);
}

/**
 * 根据设备ID获取用户红包UID
 * @deprecated 建议使用 deviceManager.getRedUidByWSDeviceID()
 */
export function getRedUidByWSDeviceID(deviceID: string): string | undefined {
  return deviceManager.getRedUidByWSDeviceID(deviceID);
}

/**
 * 监听系统环境变化
 * @deprecated 建议使用 systemMonitor.monitorSystemChanges()
 */
export function monitorSystemChanges(handlers: any): () => void {
  return systemMonitor.monitorSystemChanges(handlers);
}

/**
 * 重启应用程序
 * @deprecated 建议使用 appManager.appRestart()
 */
export function appRestart(): void {
  appManager.appRestart('通过兼容接口重启');
}

/**
 * 微移动功能
 * @deprecated 建议使用 microMover.microMove()
 */
export function microMove(): Promise<void> {
  return microMover.microMove();
}

/**
 * 设置杀毒软件白名单
 * @deprecated 建议使用 antivirusManager.setupAntivirusWhitelist()
 */
export function setupAntivirusWhitelist(): Promise<boolean> {
  return antivirusManager.setupAntivirusWhitelist();
}

/**
 * 启用系统拦截
 * @deprecated 建议使用 systemInterceptor.enableSystemInterception()
 */
export function enableSystemInterception(): Promise<void> {
  return systemInterceptor.enableSystemInterception();
}

/**
 * 禁用系统拦截
 * @deprecated 建议使用 systemInterceptor.disableSystemInterception()
 */
export function disableSystemInterception(): Promise<boolean> {
  return systemInterceptor.disableSystemInterception();
}

// 注意：以下功能模块已实现，可以直接使用

/**
 * 电源管理功能 - 将在 power-manager.ts 中实现（待开发）
 */
export interface PowerManagerInterface {
  enablePowerStayAwake(): Promise<boolean>;
  restorePowerSettings(): Promise<boolean>;
  isStayAwakeEnabled(): boolean;
}

// 导出工具函数
export function createOSManager() {
  return {
    systemInfo,
    deviceManager,
    systemMonitor,
    appManager,
    microMover,
    antivirusManager,
    systemInterceptor,
    ffiManager,
    
    // 获取所有模块的状态
    async getStatus() {
      const antivirusStatus = await antivirusManager.getAntivirusStatus();
      
      return {
        systemInfo: systemInfo.getSystemSummary(),
        deviceCount: deviceManager.getDeviceCount(),
        monitoringCount: systemMonitor.getActiveListenersCount(),
        appInfo: appManager.getAppInfo(),
        microMoverStats: microMover.getStats(),
        antivirusStatus,
        interceptionStatus: systemInterceptor.getInterceptionStatus(),
        ffiStatus: {
          isInitialized: ffiManager.isFFIInitialized(),
          isAvailable: ffiManager.isWindowsApiAvailable(),
          isFailed: ffiManager.isFFIInitializationFailed()
        }
      };
    },
    
    // 清理所有资源
    cleanup() {
      systemMonitor.cleanupAll();
      deviceManager.clearDevice();
      systemInfo.clearCache();
      microMover.cleanup();
      antivirusManager.clearCache();
      systemInterceptor.emergencyDisableAll();
      ffiManager.reset();
    },

    // 初始化所有模块
    async initialize(config?: {
      autoInitFFI?: boolean;
      enableSystemInterception?: boolean;
      enableMicroMover?: boolean;
      setupAntivirusWhitelist?: boolean;
    }) {
      console.log('初始化OS管理器...');
      
      const defaultConfig = {
        autoInitFFI: true,
        enableSystemInterception: false,
        enableMicroMover: false,
        setupAntivirusWhitelist: false,
        ...config
      };

      try {
        // 初始化FFI
        if (defaultConfig.autoInitFFI) {
          await ffiManager.initFFIAsync();
        }

        // 设置杀毒软件白名单
        if (defaultConfig.setupAntivirusWhitelist) {
          await antivirusManager.autoSetupWhitelistOnStartup();
        }

        // 启用系统拦截
        if (defaultConfig.enableSystemInterception) {
          await systemInterceptor.enableSystemInterception();
        }

        // 启用微移动
        if (defaultConfig.enableMicroMover) {
          microMover.enableAutoMicroMove();
        }

        console.log('OS管理器初始化完成');
        return true;

      } catch (error) {
        console.error('OS管理器初始化失败:', error);
        return false;
      }
    },

    // 安全关机
    async safeShutdown() {
      console.log('执行安全关机流程...');
      
      try {
        // 强制允许关机
        await systemInterceptor.forceAllowShutdown();
        
        // 清理所有资源
        this.cleanup();
        
        // 退出应用
        appManager.safeQuit(0, '安全关机');
        
        return true;
      } catch (error) {
        console.error('安全关机失败:', error);
        return false;
      }
    }
  };
}

// 默认导出一个便捷的管理器实例
export default createOSManager(); 