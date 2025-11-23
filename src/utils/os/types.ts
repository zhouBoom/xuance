import { Display } from 'electron';

// 系统信息相关类型
export interface ISystemInfo {
  getOsVersion(): string;
  getMacAddress(): string;
  getDeviceUniqueId(): string;
  clearCache(): void;
  getSystemSummary(): any;
}

// 设备管理相关类型
export interface IDeviceManager {
  getWSDeviceID(red_uid: string, red_id: string, index?: number): string;
  getRedIdByWSDeviceID(deviceID: string): string | undefined;
  getRedUidByWSDeviceID(deviceID: string): string | undefined;
  getIndexByWSDeviceID(deviceID: string): number | undefined;
  getDeviceInfo(deviceID: string): any;
  getAllDevices(): Map<string, any>;
  clearDevice(deviceID?: string): void;
  hasDevice(deviceID: string): boolean;
  getDeviceCount(): number;
  validateDeviceID(deviceID: string): boolean;
  regenerateWSDeviceID(red_uid: string, red_id: string, index?: number): string;
}

// 电源管理相关类型
export interface IPowerManager {
  enablePowerStayAwake(): Promise<boolean>;
  restorePowerSettings(): Promise<boolean>;
  isStayAwakeEnabled(): boolean;
  forcePowerStayAwake(): Promise<boolean>;
  emergencyDisableAll(): Promise<boolean>;
  getPowerStatus(): Promise<PowerStatus>;
  getSystemInterceptionStatus(): boolean;
}

export interface PowerStatus {
  isEnabled: boolean;
  monitorTimeout: string;
  diskTimeout: string;
  standbyTimeout: string;
  hibernateTimeout: string;
}

// 系统监控相关类型
export interface ISystemMonitor {
  monitorSystemChanges(handlers: SystemChangeHandlers): () => void;
  cleanupAll(): void;
  getActiveListenersCount(): number;
  isPowerMonitorAvailable(): boolean;
  isScreenMonitorAvailable(): boolean;
  getDisplayInfo(): any;
}

export interface SystemChangeHandlers {
  onSuspend?: () => void;
  onResume?: () => void;
  onLock?: () => void;
  onUnlock?: () => void;
  onShutdown?: () => void;
  onAcConnected?: () => void;
  onAcDisconnected?: () => void;
  onDisplayAdded?: (display: Display) => void;
  onDisplayRemoved?: (display: Display) => void;
  onDisplayMetricsChanged?: (display: Display, changedMetrics: string[]) => void;
  onDisplaySleepState?: (isSleeping: boolean) => void;
}

// 微移动相关类型
export interface IMicroMover {
  microMove(): Promise<void>;
  enableAutoMicroMove(intervalMs?: number): void;
  disableAutoMicroMove(): void;
  isAutoMicroMoveEnabled(): boolean;
  getStats(): MicroMoverStats;
  resetStats(): void;
  updateConfig(newConfig: Partial<MicroMoverConfig>): void;
  cleanup(): void;
  testMicroMove(): Promise<boolean>;
}

export interface MicroMoverConfig {
  moveDistance: number;
  moveIntervalMs: number;
  maxMoveDistance: number;
  restoreDelay: number;
}

export interface MicroMoverStats {
  isEnabled: boolean;
  moveCount: number;
  lastMoveTime: number;
  timeSinceLastMove: number;
  config: MicroMoverConfig;
}

// 杀毒软件白名单相关类型
export interface IAntivirusManager {
  setupAntivirusWhitelist(): Promise<boolean>;
  autoSetupWhitelistOnStartup(): Promise<void>;
  getAntivirusStatus(): Promise<AntivirusStatus>;
  clearCache(): void;
  generateWhitelistGuide(): string;
}

export interface AntivirusStatus {
  isAvailable: boolean;
  isEnterpriseManaged: boolean;
  reason?: string;
}

export interface WindowsDefenderStatus {
  isInstalled: boolean;
  isActive: boolean;
  version?: string;
}

// 系统拦截相关类型
export interface ISystemInterceptor {
  enableSystemInterception(): Promise<void>;
  disableSystemInterception(): Promise<boolean>;
  isSystemInterceptionEnabled(): boolean;
  forceAllowShutdown(): Promise<boolean>;
  addCustomKeyInterception(key: string, handler?: () => void): boolean;
  removeCustomKeyInterception(key: string): boolean;
  getInterceptionStatus(): InterceptionStatus;
  setClientClosing(closing: boolean): void;
  emergencyDisableAll(): Promise<boolean>;
}

export interface InterceptionStatus {
  isEnabled: boolean;
  interceptedKeysCount: number;
  interceptedKeys: string[];
  hasShutdownHook: boolean;
  hasPowerNotification: boolean;
  hasKeyboardHook: boolean;
  isClientClosing: boolean;
}

// FFI 相关类型
export interface IFFIManager {
  initFFI(): Promise<void>;
  initFFIAsync(): Promise<void>;
  isFFIInitialized(): boolean;
  isFFIInitializationFailed(): boolean;
  getWindowsAPI(): WindowsAPI;
  isWindowsApiAvailable(): boolean;
  reset(): void;
  getSystemInterceptionState(): any;
  setSystemInterceptionState(state: any): void;
}

// 应用程序管理相关类型
export interface IAppManager {
  appRestart(reason?: string): void;
  safeQuit(code?: number, reason?: string): void;
  isAppRestarting(): boolean;
  getRestartReason(): string;
  resetRestartState(): void;
  isAppReady(): boolean;
  getAppInfo(): AppInfo;
  setAppUserModelId(id: string): void;
  requestSingleInstanceLock(): boolean;
  releaseSingleInstanceLock(): void;
  setAsDefaultProtocolClient(protocol: string): boolean;
  removeAsDefaultProtocolClient(protocol: string): boolean;
  isDefaultProtocolClient(protocol: string): boolean;
  showAboutPanel(options?: any): void;
  hideAboutPanel(): void;
  setupAppEventListeners(): void;
}

export interface AppInfo {
  name: string;
  version: string;
  isReady: boolean;
  isPackaged: boolean;
  path: string;
  userData: string;
  isRestarting: boolean;
  restartReason: string;
}

// 事件监听器类型
export interface EventListener {
  event: string;
  handler: () => void;
}

// Windows API 相关类型
export interface WindowsAPI {
  user32?: any;
  kernel32?: any;
  powrprof?: any;
  Point?: any;
}

// 配置相关类型
export interface OSConfig {
  enableLogging?: boolean;
  autoInitFFI?: boolean;
  enableSystemInterception?: boolean;
  powerManagementEnabled?: boolean;
  microMoverConfig?: Partial<MicroMoverConfig>;
  antivirusConfig?: AntivirusConfig;
}

export interface AntivirusConfig {
  autoSetupWhitelist?: boolean;
  enableStartupSetup?: boolean;
  checkInterval?: number;
}

// 错误相关类型
export class OSError extends Error {
  constructor(message: string, public code?: string, public originalError?: Error) {
    super(message);
    this.name = 'OSError';
  }
}

// 统一管理器类型
export interface OSManagerInterface {
  systemInfo: ISystemInfo;
  deviceManager: IDeviceManager;
  systemMonitor: ISystemMonitor;
  appManager: IAppManager;
  microMover: IMicroMover;
  antivirusManager: IAntivirusManager;
  systemInterceptor: ISystemInterceptor;
  ffiManager: IFFIManager;
  getStatus(): OSManagerStatus;
  cleanup(): void;
}

export interface OSManagerStatus {
  systemInfo: any;
  deviceCount: number;
  monitoringCount: number;
  appInfo: AppInfo;
  microMoverStats: MicroMoverStats;
  antivirusStatus: AntivirusStatus;
  interceptionStatus: InterceptionStatus;
} 