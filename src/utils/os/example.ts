/**
 * 使用示例：演示如何使用重构后的OS模块
 */

// 方式一：导入特定模块（推荐）
import { 
  systemInfo, 
  deviceManager, 
  systemMonitor, 
  appManager, 
  microMover, 
  antivirusManager, 
  systemInterceptor, 
  ffiManager 
} from './index';

// 方式二：导入统一管理器
import osManager from './index';

// 方式三：导入类型定义
import type { SystemChangeHandlers, OSConfig, MicroMoverConfig } from './types';

export class OSUsageExample {
  
  /**
   * 示例1：获取系统信息
   */
  static async getSystemInformation() {
    console.log('=== 系统信息示例 ===');
    
    // 获取单个信息
    const osVersion = systemInfo.getOsVersion();
    const macAddress = systemInfo.getMacAddress();
    const deviceId = systemInfo.getDeviceUniqueId();
    
    console.log('操作系统版本:', osVersion);
    console.log('MAC地址:', macAddress);
    console.log('设备唯一ID:', deviceId);
    
    // 获取完整的系统概要
    const summary = systemInfo.getSystemSummary();
    console.log('系统概要:', summary);
  }

  /**
   * 示例2：设备管理
   */
  static async deviceManagement() {
    console.log('=== 设备管理示例 ===');
    
    // 生成设备ID
    const deviceId1 = deviceManager.getWSDeviceID('user123', 'red456', 1);
    const deviceId2 = deviceManager.getWSDeviceID('user123', 'red456', 2);
    
    console.log('设备ID 1:', deviceId1);
    console.log('设备ID 2:', deviceId2);
    
    // 根据设备ID获取信息
    console.log('红包ID:', deviceManager.getRedIdByWSDeviceID(deviceId1));
    console.log('用户UID:', deviceManager.getRedUidByWSDeviceID(deviceId1));
    console.log('设备信息:', deviceManager.getDeviceInfo(deviceId1));
    
    // 设备状态
    console.log('设备数量:', deviceManager.getDeviceCount());
    console.log('所有设备:', Array.from(deviceManager.getAllDevices().keys()));
  }

  /**
   * 示例3：系统监控
   */
  static async systemMonitoring() {
    console.log('=== 系统监控示例 ===');
    
    // 定义事件处理器
    const handlers: SystemChangeHandlers = {
      onSuspend: () => {
        console.log('系统挂起事件触发');
      },
      onResume: () => {
        console.log('系统恢复事件触发');
      },
      onLock: () => {
        console.log('系统锁屏事件触发');
      },
      onUnlock: () => {
        console.log('系统解锁事件触发');
      },
      onShutdown: () => {
        console.log('系统关机事件触发');
      },
      onAcConnected: () => {
        console.log('电源连接事件触发');
      },
      onAcDisconnected: () => {
        console.log('电源断开事件触发');
      },
      onDisplaySleepState: (isSleeping: boolean) => {
        console.log(`显示器休眠状态变化: ${isSleeping ? '休眠' : '唤醒'}`);
      }
    };
    
    // 开始监控
    const cleanup = systemMonitor.monitorSystemChanges(handlers);
    
    console.log('系统监控已启动');
    console.log('活动监听器数量:', systemMonitor.getActiveListenersCount());
    console.log('电源监控可用:', systemMonitor.isPowerMonitorAvailable());
    console.log('屏幕监控可用:', systemMonitor.isScreenMonitorAvailable());
    
    // 获取显示器信息
    const displayInfo = systemMonitor.getDisplayInfo();
    console.log('显示器信息:', displayInfo);
    
    // 稍后清理（实际使用中根据需要决定何时清理）
    setTimeout(() => {
      cleanup();
      console.log('系统监控已停止');
    }, 5000);
  }

  /**
   * 示例4：应用管理
   */
  static async applicationManagement() {
    console.log('=== 应用管理示例 ===');
    
    // 获取应用信息
    const appInfo = appManager.getAppInfo();
    console.log('应用信息:', appInfo);
    
    // 检查应用状态
    console.log('应用是否就绪:', appManager.isAppReady());
    console.log('是否正在重启:', appManager.isAppRestarting());
    
    // 设置应用事件监听器
    appManager.setupAppEventListeners();
    
    // 注意：以下操作会影响应用运行，仅供演示
    // appManager.appRestart('演示重启');
    // appManager.safeQuit(0, '演示退出');
  }

  /**
   * 示例5：微移动功能
   */
  static async microMoverDemo() {
    console.log('=== 微移动功能示例 ===');
    
    // 测试微移动功能
    const testResult = await microMover.testMicroMove();
    console.log('微移动测试结果:', testResult);
    
    // 获取当前统计信息
    let stats = microMover.getStats();
    console.log('微移动统计信息:', stats);
    
    // 启用自动微移动（每30秒一次）
    microMover.enableAutoMicroMove(30000);
    console.log('自动微移动已启用');
    
    // 更新配置
    const newConfig: Partial<MicroMoverConfig> = {
      moveIntervalMs: 45000, // 改为45秒
      maxMoveDistance: 5     // 增加最大移动距离
    };
    microMover.updateConfig(newConfig);
    
    // 等待一段时间查看效果
    setTimeout(() => {
      stats = microMover.getStats();
      console.log('运行后的统计信息:', stats);
      
      // 禁用自动微移动
      microMover.disableAutoMicroMove();
      console.log('自动微移动已禁用');
    }, 10000);
  }

  /**
   * 示例6：杀毒软件管理
   */
  static async antivirusManagement() {
    console.log('=== 杀毒软件管理示例 ===');
    
    // 获取杀毒软件状态
    const status = await antivirusManager.getAntivirusStatus();
    console.log('杀毒软件状态:', status);
    
    // 生成白名单设置指南
    const guide = antivirusManager.generateWhitelistGuide();
    console.log('白名单设置指南:', guide);
    
    // 尝试设置白名单（需要管理员权限）
    try {
      const success = await antivirusManager.setupAntivirusWhitelist();
      console.log('白名单设置结果:', success);
    } catch (error) {
      console.warn('白名单设置失败:', error);
    }
    
    // 自动设置白名单（延迟执行）
    antivirusManager.autoSetupWhitelistOnStartup();
    console.log('已启动自动白名单设置');
  }

  /**
   * 示例7：系统拦截功能
   */
  static async systemInterceptionDemo() {
    console.log('=== 系统拦截功能示例 ===');
    
    // 获取当前拦截状态
    let status = systemInterceptor.getInterceptionStatus();
    console.log('拦截状态:', status);
    
    // 启用系统拦截（注意：这会影响系统行为）
    try {
      await systemInterceptor.enableSystemInterception();
      console.log('系统拦截已启用');
      
      status = systemInterceptor.getInterceptionStatus();
      console.log('启用后的拦截状态:', status);
      
      // 添加自定义热键拦截
      const customKeySuccess = systemInterceptor.addCustomKeyInterception('F12', () => {
        console.log('自定义F12热键被拦截');
      });
      console.log('自定义热键拦截设置结果:', customKeySuccess);
      
      // 等待一段时间后禁用拦截
      setTimeout(async () => {
        // 移除自定义热键拦截
        systemInterceptor.removeCustomKeyInterception('F12');
        
        // 禁用系统拦截
        const disableResult = await systemInterceptor.disableSystemInterception();
        console.log('系统拦截禁用结果:', disableResult);
        
        status = systemInterceptor.getInterceptionStatus();
        console.log('禁用后的拦截状态:', status);
      }, 15000); // 15秒后自动禁用
      
    } catch (error) {
      console.error('系统拦截操作失败:', error);
    }
  }

  /**
   * 示例8：FFI管理
   */
  static async ffiManagement() {
    console.log('=== FFI管理示例 ===');
    
    // 检查FFI状态
    console.log('FFI已初始化:', ffiManager.isFFIInitialized());
    console.log('FFI初始化失败:', ffiManager.isFFIInitializationFailed());
    console.log('Windows API可用:', ffiManager.isWindowsApiAvailable());
    
    // 异步初始化FFI
    try {
      await ffiManager.initFFIAsync();
      console.log('FFI异步初始化完成');
      
      if (ffiManager.isWindowsApiAvailable()) {
        const api = ffiManager.getWindowsAPI();
        console.log('Windows API对象:', Object.keys(api));
      }
    } catch (error) {
      console.error('FFI初始化失败:', error);
    }
  }

  /**
   * 示例9：使用统一管理器
   */
  static async unifiedManagerDemo() {
    console.log('=== 统一管理器示例 ===');
    
    // 初始化所有模块
    const initSuccess = await osManager.initialize({
      autoInitFFI: true,
      enableSystemInterception: false, // 不启用拦截以避免影响演示
      enableMicroMover: false,         // 不启用微移动以避免干扰
      setupAntivirusWhitelist: false   // 不自动设置白名单
    });
    console.log('统一管理器初始化结果:', initSuccess);
    
    // 获取所有模块状态
    const status = await osManager.getStatus();
    console.log('系统整体状态:', status);
    
    // 访问特定模块
    const summary = osManager.systemInfo.getSystemSummary();
    console.log('通过管理器获取系统概要:', summary);
    
    // 演示安全关机流程（注释掉以避免实际关机）
    // const shutdownResult = await osManager.safeShutdown();
    // console.log('安全关机结果:', shutdownResult);
  }

  /**
   * 示例10：错误处理和最佳实践
   */
  static async errorHandlingExample() {
    console.log('=== 错误处理示例 ===');
    
    try {
      // 获取设备信息，可能失败
      const deviceId = systemInfo.getDeviceUniqueId();
      console.log('成功获取设备ID:', deviceId);
      
      // 验证设备ID格式
      const isValid = deviceManager.validateDeviceID('XC1234567890ABC01');
      console.log('设备ID格式验证:', isValid);
      
      // 测试微移动功能
      const moveResult = await microMover.testMicroMove();
      console.log('微移动测试结果:', moveResult);
      
    } catch (error) {
      console.error('操作失败:', error);
    }
    
    // 清理缓存
    systemInfo.clearCache();
    antivirusManager.clearCache();
    console.log('缓存已清理');
  }

  /**
   * 运行所有示例
   */
  static async runAllExamples() {
    console.log('开始运行OS模块使用示例...\n');
    
    try {
      await this.getSystemInformation();
      console.log('\n');
      
      await this.deviceManagement();
      console.log('\n');
      
      await this.systemMonitoring();
      console.log('\n');
      
      await this.applicationManagement();
      console.log('\n');
      
      await this.microMoverDemo();
      console.log('\n');
      
      await this.antivirusManagement();
      console.log('\n');
      
      // 注意：系统拦截演示可能会影响系统行为，谨慎运行
      // await this.systemInterceptionDemo();
      // console.log('\n');
      
      await this.ffiManagement();
      console.log('\n');
      
      await this.unifiedManagerDemo();
      console.log('\n');
      
      await this.errorHandlingExample();
      console.log('\n');
      
      console.log('所有示例运行完成！');
      
    } catch (error) {
      console.error('示例运行过程中出错:', error);
    }
  }
}

// 如果直接运行此文件，则执行示例
if (require.main === module) {
  OSUsageExample.runAllExamples()
    .then(() => {
      console.log('示例执行完成');
    })
    .catch((error) => {
      console.error('示例执行失败:', error);
      process.exit(1);
    });
} 