import { powerMonitor, screen, Display } from "electron";
import { ISystemMonitor, SystemChangeHandlers, EventListener } from './types';

/**
 * 系统监控类
 * 负责监听系统环境变化，如息屏、锁屏等可能影响程序正常执行的事件
 */
export class SystemMonitor implements ISystemMonitor {
  private static instance: SystemMonitor;
  private activeListeners: Map<string, EventListener[]> = new Map();

  private constructor() {}

  public static getInstance(): SystemMonitor {
    if (!SystemMonitor.instance) {
      SystemMonitor.instance = new SystemMonitor();
    }
    return SystemMonitor.instance;
  }

  /**
   * 监听系统环境变化
   * @param handlers 包含各种事件处理函数的对象
   * @returns 取消监听的函数
   */
  public monitorSystemChanges(handlers: SystemChangeHandlers): () => void {
    const sessionId = this.generateSessionId();
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
          
          // 方法2: 检查显示器的工作区域是否为0
          if (displays.length > 0) {
            const primaryDisplay = displays.find(display => display.bounds.x === 0 && display.bounds.y === 0) || displays[0];
            const isDisplayOn = primaryDisplay.workAreaSize.width > 0 && primaryDisplay.workAreaSize.height > 0;
            
            if (isDisplayOn !== lastDisplayState) {
              lastDisplayState = isDisplayOn;
              handlers.onDisplaySleepState!(!isDisplayOn);
            }
          }
          
        } catch (error) {
          // 如果检测出错，不抛出异常，只记录并继续
          console.warn('检测显示器状态时出错:', error);
        }
      };
      
      // 启动定时检测
      displayCheckInterval = setInterval(checkDisplayState, 3000); // 每3秒检测一次
      
      // 立即执行一次检测
      setTimeout(checkDisplayState, 1000);
    }

    // 存储监听器
    this.activeListeners.set(sessionId, listeners);

    // 返回清理函数
    return () => {
      this.cleanup(sessionId, listeners, displayListeners, displayCheckInterval);
    };
  }

  /**
   * 清理监听器
   */
  private cleanup(
    sessionId: string,
    listeners: EventListener[],
    displayListeners: { event: string; removeHandler: Function }[],
    displayCheckInterval: NodeJS.Timeout | null
  ) {
    // 清理电源监控事件监听器
    listeners.forEach(({ event, handler }) => {
      try {
        (powerMonitor as any).removeListener(event, handler);
      } catch (error) {
        console.warn(`清理电源监听器失败: ${event}`, error);
      }
    });

    // 清理显示器事件监听器
    displayListeners.forEach(({ removeHandler }) => {
      try {
        removeHandler();
      } catch (error) {
        console.warn('清理显示器监听器失败', error);
      }
    });

    // 清理显示器状态检测定时器
    if (displayCheckInterval) {
      clearInterval(displayCheckInterval);
    }

    // 从活动监听器中移除
    this.activeListeners.delete(sessionId);
  }

  /**
   * 清理所有活动的监听器
   */
  public cleanupAll(): void {
    // 这里我们只能清理电源监听器，因为没有存储displayListeners和displayCheckInterval的引用
    this.activeListeners.forEach((listeners, sessionId) => {
      listeners.forEach(({ event, handler }) => {
        try {
          (powerMonitor as any).removeListener(event, handler);
        } catch (error) {
          console.warn(`清理电源监听器失败: ${event}`, error);
        }
      });
    });
    
    this.activeListeners.clear();
  }

  /**
   * 获取当前活动的监听器数量
   */
  public getActiveListenersCount(): number {
    return this.activeListeners.size;
  }

  /**
   * 检查电源监控是否可用
   */
  public isPowerMonitorAvailable(): boolean {
    try {
      return !!powerMonitor && typeof powerMonitor.on === 'function';
    } catch {
      return false;
    }
  }

  /**
   * 检查屏幕监控是否可用
   */
  public isScreenMonitorAvailable(): boolean {
    try {
      return !!screen && typeof screen.on === 'function';
    } catch {
      return false;
    }
  }

  /**
   * 获取当前显示器信息
   */
  public getDisplayInfo() {
    try {
      const displays = screen.getAllDisplays();
      const primaryDisplay = screen.getPrimaryDisplay();
      
      return {
        allDisplays: displays,
        primaryDisplay,
        displayCount: displays.length,
        totalWorkArea: displays.reduce((total, display) => {
          return total + (display.workAreaSize.width * display.workAreaSize.height);
        }, 0)
      };
    } catch (error) {
      console.warn('获取显示器信息失败:', error);
      return null;
    }
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `monitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 导出单例实例
export const systemMonitor = SystemMonitor.getInstance(); 