import { EventEmitter } from 'events';
import { accountViewManager } from '../account/accountViewManager';
import { WebSocketPool } from '../core/websocket/websocketPool';
import { XuanceModule } from '../types/xuance-module';
import * as dns from 'dns';
import * as os from 'os';

// 网络状态枚举：增加不稳定状态
enum NetworkStatus {
  ONLINE = 'online',
  UNSTABLE = 'unstable',
  OFFLINE = 'offline'
}

export class NetworkChecker extends EventEmitter {
  private static instance: NetworkChecker;
  private currentStatus: NetworkStatus = NetworkStatus.ONLINE;
  private isOnline: boolean = true; // 兼容现有代码的状态
  private checkInterval: NodeJS.Timeout | null = null;
  // 将检测间隔延长到8秒，减少过于频繁的检测
  private readonly CHECK_INTERVAL = 8000;
  // 两种检测模式：完整检测和轻量检测
  private readonly FULL_CHECK_INTERVAL = 60000; // 完整检测间隔延长到60秒
  private lastFullCheckTime: number = 0;
  
  // 增加故障计数器和冷却期
  private consecutiveFailures: number = 0;
  private lastStateChangeTime: number = Date.now();
  private inCooldown: boolean = false;
  private cooldownTimer: NodeJS.Timeout | null = null;
  // 最大失败次数
  private readonly MAX_FAILURES = 3;
  // 冷却期基础时间
  private readonly BASE_COOLDOWN_MS = 120000; // 增加到2分钟
  // 记录检测结果历史
  private checkResultHistory: boolean[] = [];
  private readonly HISTORY_SIZE = 10; // 增加历史记录数量
  // 状态变更阈值
  private readonly STABILITY_THRESHOLD = 0.7; // 70%的一致性才变更状态
  private readonly UNSTABLE_THRESHOLD = 0.5; // 50%一致性视为不稳定
  // 本地DNS服务器IP (从系统获取)
  private dnsServers: string[] = [];
  // 上次触发网络变更的时间
  private lastNotificationTime: number = 0;
  // 通知静默期（至少30秒才会再次通知同类型变更）
  private readonly NOTIFICATION_SILENCE_PERIOD = 30000;

  private constructor() {
    super();
    // 获取系统DNS服务器
    this.initDnsServers();
    this.startChecking();
  }

  private initDnsServers() {
    try {
      // 从系统获取DNS服务器地址
      const dnsResolvers = dns.getServers();
      if (dnsResolvers && dnsResolvers.length > 0) {
        this.dnsServers = dnsResolvers.filter(ip => 
          ip && (ip.includes('.') || ip.includes(':'))
        ).slice(0, 2); // 最多使用2个DNS服务器
      }
      
      // 如果没有获取到有效的DNS服务器，使用默认值
      if (this.dnsServers.length === 0) {
        this.dnsServers = ['8.8.8.8', '114.114.114.114'];
      }
      
      Logger.info(
        XuanceModule.COMMON.NETWORK,
        'system',
        `使用DNS服务器: ${this.dnsServers.join(', ')}`
      );
    } catch (error) {
      Logger.error(
        XuanceModule.COMMON.NETWORK,
        'system',
        '获取DNS服务器失败，使用默认值',
        error
      );
      this.dnsServers = ['8.8.8.8', '114.114.114.114'];
    }
  }

  public static getInstance(): NetworkChecker {
    if (!NetworkChecker.instance) {
      NetworkChecker.instance = new NetworkChecker();
    }
    return NetworkChecker.instance;
  }

  private async checkConnection(useFullCheck: boolean = false): Promise<boolean> {
    // 如果是轻量检测，优先使用DNS和默认网关检测
    if (!useFullCheck) {
      // 先进行DNS查询检测 - 比HTTP更轻量
      const dnsResult = await this.checkDns();
      if (dnsResult) {
        // DNS检测成功则认为网络正常
        return true;
      }
      
      // DNS检测失败，尝试检测默认网关
      const gatewayResult = await this.checkDefaultGateway();
      if (gatewayResult) {
        // 网关检测成功则认为网络正常
        return true;
      }
      
      // 如果历史结果中有多次失败，再进行HTTP检测确认
      if (this.shouldDoHttpCheck()) {
        // 进行HTTP检测
        return await this.checkHttpEndpoints();
      }
      
      // 轻量检测都失败，网络可能断开
      return false;
    }
    
    // 完整检测模式：DNS + 网关 + HTTP 多重检测
    const [dnsResult, gatewayResult, httpResult] = await Promise.all([
      this.checkDns(),
      this.checkDefaultGateway(),
      this.checkHttpEndpoints()
    ]);
    
    // 只要有一种检测方法成功，就认为网络正常
    return dnsResult || gatewayResult || httpResult;
  }
  
  // DNS查询检测 - 非常轻量
  private async checkDns(): Promise<boolean> {
    if (this.dnsServers.length === 0) return false;
    
    // 使用Promise.race尝试查询多个DNS服务器
    try {
      const results = await Promise.race(
        this.dnsServers.map(server => this.singleDnsCheck(server))
      );
      return results;
    } catch (error) {
      return false;
    }
  }
  
  private singleDnsCheck(dnsServer: string): Promise<boolean> {
    return new Promise((resolve) => {
      const resolver = new dns.Resolver();
      resolver.setServers([dnsServer]);
      
      // 延长DNS超时时间到2秒
      const timeoutId = setTimeout(() => resolve(false), 2000);
      
      resolver.resolve4('www.baidu.com', (err, addresses) => {
        clearTimeout(timeoutId);
        resolve(!err && addresses && addresses.length > 0);
      });
    });
  }
  
  // 默认网关检测
  private async checkDefaultGateway(): Promise<boolean> {
    try {
      // 使用ping检测默认网关
      const gateway = this.getDefaultGateway();
      if (!gateway) return false;
      
      return new Promise((resolve) => {
        const { exec } = require('child_process');
        // 设置超时为2秒的ping命令
        const cmd = process.platform === 'win32' 
          ? `ping -n 1 -w 2000 ${gateway}` 
          : `ping -c 1 -W 2 ${gateway}`;
        
        // 延长超时时间到2.5秒
        const timeoutId = setTimeout(() => resolve(false), 2500);
        
        exec(cmd, (error: any, stdout: string) => {
          clearTimeout(timeoutId);
          // 检查ping输出是否包含成功信息
          resolve(!error && (
            stdout.includes('TTL=') || 
            stdout.includes('ttl=') || 
            stdout.includes('time=')
          ));
        });
      });
    } catch (error) {
      return false;
    }
  }
  
  // 获取默认网关
  private getDefaultGateway(): string | null {
    try {
      const interfaces = os.networkInterfaces();
      // 查找活跃的网络接口
      for (const [name, netInterface] of Object.entries(interfaces)) {
        if (!netInterface) continue;
        
        // 查找IPv4接口
        const ipv4Interface = netInterface.find(
          iface => iface.family === 'IPv4' && !iface.internal
        );
        
        if (ipv4Interface) {
          // 简单估计网关：通常是IP地址的前三段 + .1
          const ipParts = ipv4Interface.address.split('.');
          if (ipParts.length === 4) {
            return `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.1`;
          }
        }
      }
      
      // 如果无法确定网关，使用常见的默认网关地址
      return '192.168.1.1';
    } catch (error) {
      return null;
    }
  }
  
  // 判断是否需要执行HTTP检测
  private shouldDoHttpCheck(): boolean {
    // 如果历史结果中有多次连续失败，才执行HTTP检测
    if (this.checkResultHistory.length < 3) return true;
    
    // 计算最近的失败次数
    const recentFailures = this.checkResultHistory
      .slice(-4) // 取最近4次结果
      .filter(result => !result) // 只看失败结果
      .length;
      
    // 如果最近有2次以上失败，执行HTTP检测
    return recentFailures >= 2;
  }
  
  // HTTP端点检测
  private async checkHttpEndpoints(): Promise<boolean> {
    // 减少检测端点数量，只使用两个最稳定的
    const endpoints = [
      'https://www.baidu.com',
      'https://www.qq.com'
    ];
    
    // 设置超时时间为3秒
    const timeoutMs = 3000;
    
    // 使用Promise.race包装fetch请求，增加超时控制
    const fetchWithTimeout = async (url: string): Promise<boolean> => {
      return new Promise(resolve => {
        let isResolved = false;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          if (!isResolved) {
            controller.abort();
            isResolved = true;
            resolve(false);
          }
        }, timeoutMs);
        
        fetch(url, {
          method: 'HEAD', // 使用HEAD请求代替GET，减少数据传输
          cache: 'no-store',
          signal: controller.signal,
        })
        .then(response => {
          if (!isResolved) {
            clearTimeout(timeoutId);
            isResolved = true;
            resolve(response.ok);
          }
        })
        .catch(() => {
          if (!isResolved) {
            clearTimeout(timeoutId);
            isResolved = true;
            resolve(false);
          }
        });
      });
    };
    
    // 只检测一个端点，成功即返回
    for (const url of endpoints) {
      try {
        if (await fetchWithTimeout(url)) {
          return true;
        }
      } catch (error) {
        continue;
      }
    }
    
    return false;
  }

  // 使用滑动窗口算法评估网络状态
  private evaluateNetworkStatus(): NetworkStatus {
    if (this.checkResultHistory.length === 0) {
      return NetworkStatus.ONLINE; // 默认为在线状态
    }
    
    // 计算在线率
    const onlineRatio = this.checkResultHistory.filter(result => result).length / 
                         this.checkResultHistory.length;
    
    // 根据阈值确定状态
    if (onlineRatio >= this.STABILITY_THRESHOLD) {
      return NetworkStatus.ONLINE;
    } else if (onlineRatio <= (1 - this.STABILITY_THRESHOLD)) {
      return NetworkStatus.OFFLINE;
    } else {
      return NetworkStatus.UNSTABLE;
    }
  }

  private async handleNetworkChange(currentCheckResult: boolean) {
    // 更新检测结果历史
    this.checkResultHistory.push(currentCheckResult);
    if (this.checkResultHistory.length > this.HISTORY_SIZE) {
      this.checkResultHistory.shift(); // 移除最旧的结果
    }
    
    // 使用滑动窗口算法评估当前网络状态
    const newStatus = this.evaluateNetworkStatus();
    
    // 如果处于不稳定状态，减少通知频率
    if (newStatus === NetworkStatus.UNSTABLE) {
      // 只有从在线变为不稳定或从离线变为不稳定时才通知一次
      if (this.currentStatus !== NetworkStatus.UNSTABLE) {
        Logger.info(
          XuanceModule.COMMON.NETWORK, 
          'system', 
          `网络状态不稳定，正在监控...`
        );
      }
      this.currentStatus = NetworkStatus.UNSTABLE;
      return; // 不触发外部事件
    }
    
    // 状态没有变化，不需要处理
    if (this.currentStatus === newStatus) {
      return;
    }
    
    // 从不稳定变为稳定状态
    const now = Date.now();
    const timeSinceLastNotification = now - this.lastNotificationTime;
    
    // 检查是否在通知静默期内
    if (timeSinceLastNotification < this.NOTIFICATION_SILENCE_PERIOD) {
      Logger.debug(
        XuanceModule.COMMON.NETWORK,
        'system',
        `网络状态变更在静默期内，跳过通知`
      );
      this.currentStatus = newStatus; // 仍然更新内部状态
      return;
    }
    
    // 状态变化太频繁，可能需要进入冷却期
    const timeSinceLastChange = now - this.lastStateChangeTime;
    if (timeSinceLastChange < 20000) { // 20秒内状态频繁变化
      this.consecutiveFailures++;
      
      // 如果连续失败次数过多，进入冷却期
      if (this.consecutiveFailures >= this.MAX_FAILURES && !this.inCooldown) {
        this.enterCooldownMode();
        return;
      }
    } else {
      // 状态变化间隔正常，重置失败计数
      this.consecutiveFailures = Math.max(0, this.consecutiveFailures - 1);
    }
    
    // 更新状态
    this.currentStatus = newStatus;
    this.lastStateChangeTime = now;
    this.lastNotificationTime = now;
    
    // 更新兼容现有代码的状态
    const isOnlineNow = newStatus === NetworkStatus.ONLINE;
    this.isOnline = isOnlineNow;
    
    Logger.info(
      XuanceModule.COMMON.NETWORK, 
      'system', 
      `网络状态变更: ${isOnlineNow ? '在线' : '离线'}`
    );

    // 通知所有BrowserView
    await accountViewManager.notifyBrowserViews(isOnlineNow);

    // 触发事件
    this.emit('network-status-change', isOnlineNow);

    // 网络状态变化，直接通知WebSocketPool
    try {
      const wsPool = WebSocketPool.getInstance();
      Logger.info(
        XuanceModule.COMMON.NETWORK, 
        'system', 
        `通知WebSocketPool网络状态变化: ${isOnlineNow}`
      );
      
      // 直接调用WebSocketPool的方法
      wsPool.handleNetworkChange(isOnlineNow);
    } catch (error) {
      Logger.error(
        XuanceModule.COMMON.NETWORK, 
        'system', 
        `通知WebSocketPool网络状态变化失败:`, 
        error
      );
      
      // 如果上面的方法失败，只在网络恢复时使用备份方法
      if (isOnlineNow) {
        this.reconnectWebSockets();
      }
    }
  }
  
  // 进入冷却模式
  private enterCooldownMode() {
    if (this.inCooldown) return;
    
    this.inCooldown = true;
    
    // 冷却时间随失败次数指数增长，但不超过30分钟
    const cooldownTime = Math.min(
      this.BASE_COOLDOWN_MS * Math.pow(1.5, Math.min(this.consecutiveFailures - this.MAX_FAILURES, 5)),
      30 * 60 * 1000
    );
    
    Logger.warn(
      XuanceModule.COMMON.NETWORK, 
      'system', 
      `网络状态检测过于频繁，进入冷却期 ${cooldownTime/1000} 秒`
    );
    
    // 停止常规检测
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    // 启动冷却定时器
    this.cooldownTimer = setTimeout(() => {
      this.exitCooldownMode();
    }, cooldownTime);
  }
  
  // 退出冷却模式
  private exitCooldownMode() {
    if (!this.inCooldown) return;
    
    this.inCooldown = false;
    this.consecutiveFailures = 0;
    
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    
    Logger.info(
      XuanceModule.COMMON.NETWORK, 
      'system', 
      '冷却期结束，恢复网络状态检测'
    );
    
    // 重置历史记录
    this.checkResultHistory = [];
    
    // 立即检测一次网络状态
    this.checkConnectionAndUpdateState(true);
    
    // 恢复常规检测
    this.startChecking();
  }
  
  // 备份重连方法，简化实现以减少资源消耗
  private reconnectWebSockets() {
    try {
      const wsPool = WebSocketPool.getInstance();
      // 只选择最重要的客户端进行重连，而不是全部重连
      const clients = Array.from(wsPool['clients'].keys()).slice(0, 3);
      
      for (const clientId of clients) {
        try {
          const client = wsPool.getClient(clientId);
          if (client && client.status === 'disconnected') {
            Logger.info(XuanceModule.COMMON.NETWORK, clientId, `尝试使用备份方法重连WebSocket`);
            wsPool['reconnectionManager'].forceReconnect(clientId);
          }
        } catch (error) {
          Logger.error(XuanceModule.COMMON.NETWORK, clientId, `备份方法重连WebSocket失败:`, error);
        }
      }
    } catch (error) {
      Logger.error(XuanceModule.COMMON.NETWORK, 'system', `备份重连方法失败:`, error);
    }
  }

  // 单次检测网络状态并更新
  private async checkConnectionAndUpdateState(forceFullCheck: boolean = false) {
    try {
      const now = Date.now();
      // 判断是否需要进行完整检测
      const needFullCheck = forceFullCheck || (now - this.lastFullCheckTime >= this.FULL_CHECK_INTERVAL);
      
      if (needFullCheck) {
        this.lastFullCheckTime = now;
      }
      
      const currentCheckResult = await this.checkConnection(needFullCheck);
      await this.handleNetworkChange(currentCheckResult);
    } catch (error) {
      Logger.error(XuanceModule.COMMON.NETWORK, 'system', `网络状态检测出错:`, error);
    }
  }

  private startChecking() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      // 如果在冷却期，不执行检测
      if (this.inCooldown) return;
      
      this.checkConnectionAndUpdateState();
    }, this.CHECK_INTERVAL);
  }

  // 兼容旧API
  public getCurrentStatus(): boolean {
    return this.isOnline;
  }
  
  // 新API - 获取详细状态
  public getDetailedStatus(): NetworkStatus {
    return this.currentStatus;
  }

  public destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
    
    this.removeAllListeners();
  }
}

// 导出单例实例
export const networkChecker = NetworkChecker.getInstance();
