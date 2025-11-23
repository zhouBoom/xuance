import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { ReconnectConfig, WsConnectionConfig } from './types';
import { WebSocketClientManager } from './WebSocketClient';
import { DEFAULT_RECONNECT_CONFIG, DEFAULT_WS_CONFIG, FALLBACK_URLS } from './config';
import { XuanceModule } from '../../types/xuance-module';
import * as crypto from 'crypto';
import * as dns from 'dns';
import * as net from 'net';

interface ReconnectHistory {
    clientId: string;
    timestamps: number[];  // 最近几次重连尝试的时间戳
    lastSuccessTime?: number; // 最后一次成功的时间
    consecutiveFailures: number; // 连续失败次数
    backoffMultiplier: number; // 退避乘数，会随着失败次数增加
}

export class ReconnectionManager extends EventEmitter {
    private clients: Map<string, WebSocketClientManager>;
    private readonly reconnectConfig: ReconnectConfig;
    private readonly wsConfig: WsConnectionConfig;
    private persistentReconnectTimers: Map<string, NodeJS.Timeout> = new Map();
    private reconnectHistory: Map<string, ReconnectHistory> = new Map();
    private static readonly MAX_RECONNECT_FREQUENCY = 5; // 从10降到5，每分钟最大重连尝试次数
    private static readonly RECONNECT_WINDOW_MS = 60000; // 重连频率窗口 (1分钟)
    private static readonly MAX_BACKOFF_MULTIPLIER = 10; // 最大退避乘数
    private static readonly MAX_HISTORY_ENTRIES = 50; // 最大历史记录条目数

    constructor(
        clients: Map<string, WebSocketClientManager>,
        reconnectConfig: ReconnectConfig = DEFAULT_RECONNECT_CONFIG,
        wsConfig: WsConnectionConfig = DEFAULT_WS_CONFIG
    ) {
        super();
        this.clients = clients;
        this.reconnectConfig = reconnectConfig;
        this.wsConfig = wsConfig;
        
        Logger.info(
            XuanceModule.WEBSOCKET.RECONNECT,
            'system',
            '初始化重连管理器',
            {
                maxAttempts: this.reconnectConfig.maxAttempts,
                baseTimeout: this.reconnectConfig.baseTimeout,
                maxTimeout: this.reconnectConfig.maxTimeout
            }
        );
    }

    /**
     * 处理断开连接
     */
    public handleDisconnect(clientId: string): void {
        const client = this.clients.get(clientId);
        if (!client) {
            Logger.info(XuanceModule.WEBSOCKET.ON_DISCONNECT, clientId, 'client不存在');
            return;
        }

        // 如果已经在重连中，不要重复触发重连流程
        if (client.getStatus() === 'disconnected') {
            // 检查是否有重连定时器，如果没有说明重连流程可能中断
            if (!client.getClient().reconnectTimer) {
                Logger.warn(
                    XuanceModule.WEBSOCKET.ON_DISCONNECT, 
                    clientId, 
                    '检测到断开状态但没有进行重连，开始重连流程'
                );
                this.scheduleReconnect(client);
                return;
            }
            
            Logger.info(XuanceModule.WEBSOCKET.ON_DISCONNECT, clientId, '已经在重连中，不要重复触发重连');
            return;
        }

        client.setStatus('disconnected');
        this.emit('disconnect', clientId);
        
        // 记录断开连接事件
        Logger.info(
            XuanceModule.WEBSOCKET.STATE_CHANGE,
            clientId,
            '客户端断开连接，准备重连',
            {
                socketReadyState: client.getSocket().readyState,
                reconnectAttempts: client.getClient().reconnectAttempts
            }
        );
        
        // 清理之前的定时器
        client.clearReconnectTimer();

        // 只有在连接真正断开时才尝试重连
        if (!client.isSocketHealthy()) {
            // 添加检测当前是否有网络连接的逻辑
            this.checkNetwork().then(isNetworkAvailable => {
                if (isNetworkAvailable) {
                    Logger.info(XuanceModule.WEBSOCKET.ON_DISCONNECT, clientId, '网络连接正常，准备进行重连');
                    this.scheduleReconnect(client);
                } else {
                    Logger.warn(XuanceModule.WEBSOCKET.ON_DISCONNECT, clientId, '当前网络不可用，等待网络恢复');
                    // 监听网络恢复，一旦恢复则尝试重连
                    // 这里可以设置一个较长的延迟，定期检查网络状态
                    setTimeout(() => {
                        this.handleDisconnect(clientId);
                    }, 30000); // 30秒后再次检查
                }
            }).catch(error => {
                // 如果网络检查失败，仍然尝试重连
                Logger.error(XuanceModule.WEBSOCKET.ON_DISCONNECT, clientId, '网络检查失败，仍尝试重连', error);
                this.scheduleReconnect(client);
            });
        }
    }

    /**
     * 检查网络连接是否可用
     */
    private async checkNetwork(): Promise<boolean> {
        try {
            // 提取域名（用于DNS检查）
            const baseUrl = this.wsConfig.baseUrl;
            const domain = new URL(baseUrl).hostname;

            // 尝试发送一个HTTP请求来检查网络连接
            Logger.info(
                XuanceModule.WEBSOCKET.RECONNECT,
                'system',
                '检查网络连接状态...',
                { checkTime: Date.now(), targetDomain: domain }
            );

            // 使用DNS查询检查域名解析
            try {
                const dnsPromises = dns.promises;
                
                // 检查域名DNS解析
                const addresses = await dnsPromises.lookup(domain);
                Logger.info(
                    XuanceModule.WEBSOCKET.RECONNECT,
                    'system',
                    `DNS解析成功: ${domain} -> ${addresses.address}`,
                    { addresses }
                );
            } catch (dnsError) {
                Logger.error(
                    XuanceModule.WEBSOCKET.RECONNECT,
                    'system',
                    `DNS解析失败: ${domain}`,
                    dnsError
                );
                return false; // DNS解析失败，网络可能有问题
            }

            // 使用HTTP请求检查网络连通性
            // 注意：这里使用https而不是wss进行检查
            const https = require('https');
            const checkUrl = baseUrl.replace('wss://', 'https://');
            
            const networkResult = await new Promise<boolean>((resolve) => {
                const req = https.get(checkUrl, { timeout: 10000 }, (res) => {
                    // 即使收到错误状态码也视为网络连接正常，因为我们只检查连通性
                    Logger.info(
                        XuanceModule.WEBSOCKET.RECONNECT,
                        'system',
                        `网络检查HTTP响应: ${res.statusCode}`,
                        { statusCode: res.statusCode, headers: res.headers }
                    );
                    resolve(true);
                });
                
                req.on('error', (error) => {
                    Logger.warn(
                        XuanceModule.WEBSOCKET.RECONNECT,
                        'system',
                        `网络检查失败: ${error.message}`,
                        error
                    );
                    resolve(false);
                });
                
                req.on('timeout', () => {
                    Logger.warn(
                        XuanceModule.WEBSOCKET.RECONNECT,
                        'system',
                        '网络检查超时'
                    );
                    req.destroy();
                    resolve(false);
                });
            });
            
            Logger.info(
                XuanceModule.WEBSOCKET.RECONNECT,
                'system',
                `网络检查结果: ${networkResult ? '可用' : '不可用'}`
            );
            
            return networkResult;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            Logger.error(
                XuanceModule.WEBSOCKET.RECONNECT,
                'system',
                `网络检查过程中出错: ${errorMsg}`,
                error
            );
            return false;
        }
    }

    /**
     * 检查重连频率是否超过限制
     */
    private isReconnectThrottled(clientId: string): boolean {
        const now = Date.now();
        
        // 获取历史记录，不存在则创建
        if (!this.reconnectHistory.has(clientId)) {
            this.reconnectHistory.set(clientId, {
                clientId,
                timestamps: [],
                consecutiveFailures: 0,
                backoffMultiplier: 1
            });
        }
        
        const history = this.reconnectHistory.get(clientId)!;
        
        // 清理一分钟之前的记录
        history.timestamps = history.timestamps.filter(time => 
            now - time < ReconnectionManager.RECONNECT_WINDOW_MS
        );
        
        // 检查是否超过频率限制
        const isThrottled = history.timestamps.length >= ReconnectionManager.MAX_RECONNECT_FREQUENCY;
        
        if (isThrottled) {
            Logger.warn(
                XuanceModule.WEBSOCKET.RECONNECT,
                clientId,
                `重连频率超过限制(${history.timestamps.length}/${ReconnectionManager.MAX_RECONNECT_FREQUENCY}次/分钟)，延迟重连`,
                {
                    reconnectCount: history.timestamps.length,
                    windowMs: ReconnectionManager.RECONNECT_WINDOW_MS,
                    consecutiveFailures: history.consecutiveFailures,
                    backoffMultiplier: history.backoffMultiplier
                }
            );
        }
        
        // 记录本次尝试
        history.timestamps.push(now);
        
        // 清理历史记录，避免无限增长
        this.cleanupReconnectHistory();
        
        return isThrottled;
    }
    
    /**
     * 清理过多的重连历史记录，避免内存泄漏
     */
    private cleanupReconnectHistory(): void {
        // 如果历史记录数量超过限制，移除最早的记录
        if (this.reconnectHistory.size > ReconnectionManager.MAX_HISTORY_ENTRIES) {
            // 获取所有条目，按最后活动时间排序
            const entries = Array.from(this.reconnectHistory.entries())
                .map(([clientId, history]) => {
                    const lastActivity = history.timestamps.length > 0 
                        ? Math.max(...history.timestamps) 
                        : 0;
                    return { clientId, lastActivity };
                })
                .sort((a, b) => a.lastActivity - b.lastActivity);
            
            // 移除最旧的 20% 的记录
            const removeCount = Math.ceil(this.reconnectHistory.size * 0.2);
            for (let i = 0; i < removeCount; i++) {
                if (i < entries.length) {
                    this.reconnectHistory.delete(entries[i].clientId);
                    Logger.info(
                        XuanceModule.WEBSOCKET.RECONNECT,
                        entries[i].clientId,
                        `清理过期重连历史记录`
                    );
                }
            }
        }
    }
    
    /**
     * 更新重连历史记录
     */
    private updateReconnectHistory(clientId: string, succeeded: boolean): void {
        if (!this.reconnectHistory.has(clientId)) {
            return;
        }
        
        const history = this.reconnectHistory.get(clientId)!;
        
        if (succeeded) {
            // 重连成功
            history.lastSuccessTime = Date.now();
            history.consecutiveFailures = 0;
            history.backoffMultiplier = 1; // 重置退避乘数
            
            Logger.info(
                XuanceModule.WEBSOCKET.RECONNECT,
                clientId,
                '重连成功，重置连接状态指标',
                {
                    lastSuccessTime: history.lastSuccessTime,
                    totalAttempts: history.timestamps.length
                }
            );
        } else {
            // 重连失败
            history.consecutiveFailures++;
            
            // 增加退避乘数，但不超过最大值
            if (history.consecutiveFailures > 3) {
                history.backoffMultiplier = Math.min(
                    history.backoffMultiplier * 1.5,
                    ReconnectionManager.MAX_BACKOFF_MULTIPLIER
                );
            }
            
            Logger.warn(
                XuanceModule.WEBSOCKET.RECONNECT,
                clientId,
                '重连失败，更新连接状态指标',
                {
                    consecutiveFailures: history.consecutiveFailures,
                    backoffMultiplier: history.backoffMultiplier,
                    totalAttempts: history.timestamps.length
                }
            );
        }
    }

    /**
     * 调度重连
     */
    private scheduleReconnect(client: WebSocketClientManager): void {
        const clientId = client.getId();
        const attempts = client.incrementReconnectAttempts();
        
        // 发射重连开始事件
        this.emit('reconnect_start', clientId);
        
        // 检查重连频率
        const isThrottled = this.isReconnectThrottled(clientId);
        const history = this.reconnectHistory.get(clientId);
        const backoffMultiplier = history ? history.backoffMultiplier : 1;
        
        if (attempts > this.reconnectConfig.maxAttempts) {
            Logger.warn(
                XuanceModule.WEBSOCKET.SCHEDULE_RECONNECT, 
                clientId, 
                `Client ${clientId} failed to reconnect after ${this.reconnectConfig.maxAttempts} attempts, checking network status for persistent reconnection`
            );
            
            // 触发重连失败事件，但不立即放弃
            this.emit('reconnect_failed', clientId);
            
            // 在重连失败后，检查网络状态，如果网络正常则启动持久重连
            this.startPersistentReconnect(clientId);
            return;
        }

        // 计算重连延迟时间，增加更多随机性和指数级增长
        const jitter = Math.floor(Math.random() * 2000); // 0-2000毫秒的随机抖动(增加抖动)
        let delay = Math.min(
            this.reconnectConfig.baseTimeout * Math.pow(2, attempts - 1) * backoffMultiplier + jitter, // 使用指数增长(2^n)而不是1.5^n
            this.reconnectConfig.maxTimeout
        );
        
        // 如果频率受限，增加额外延迟
        if (isThrottled) {
            delay += 30000 + Math.floor(Math.random() * 15000); // 额外增加30-45秒(从15-25秒增加)
        }

        // 设置重连定时器
        const timer = setTimeout(() => {
            this.attemptReconnect(client);
        }, delay);
        
        client.setReconnectTimer(timer);

        Logger.info(
            XuanceModule.WEBSOCKET.SCHEDULE_RECONNECT, 
            clientId, 
            `Scheduling reconnect attempt ${attempts} for client ${clientId} in ${delay}ms`,
            {
                attempts,
                delay,
                baseTimeout: this.reconnectConfig.baseTimeout,
                maxTimeout: this.reconnectConfig.maxTimeout,
                backoffMultiplier,
                isThrottled
            }
        );
    }

    /**
     * 启动持久重连机制
     * 在网络正常但重连失败后，周期性地尝试重连
     */
    private startPersistentReconnect(clientId: string): void {
        // 清除之前可能存在的持久重连定时器
        if (this.persistentReconnectTimers.has(clientId)) {
            clearTimeout(this.persistentReconnectTimers.get(clientId)!);
            this.persistentReconnectTimers.delete(clientId);
        }
        
        // 检查客户端是否还存在
        const client = this.clients.get(clientId);
        if (!client) {
            Logger.warn(
                XuanceModule.WEBSOCKET.RECONNECT, 
                clientId, 
                '客户端不存在，无法启动持久重连'
            );
            return;
        }
        
        // 先检查网络状态
        this.checkNetwork().then(isNetworkAvailable => {
            if (isNetworkAvailable) {
                Logger.info(
                    XuanceModule.WEBSOCKET.RECONNECT, 
                    clientId, 
                    '网络状态正常，启动持久重连机制'
                );
                
                // 获取重连历史
                const history = this.reconnectHistory.get(clientId);
                const consecutiveFailures = history ? history.consecutiveFailures : 0;
                
                // 根据连续失败次数动态调整重连间隔
                // 失败次数越多，间隔越长，但最长不超过10分钟(从5分钟增加)
                const baseInterval = 120000; // 基础间隔2分钟(从1分钟增加)
                const maxInterval = 600000; // 最大间隔10分钟(从5分钟增加)
                const interval = Math.min(
                    baseInterval * Math.pow(1.5, Math.min(consecutiveFailures, 10)), // 使用1.5指数增长(从1.2增加)
                    maxInterval
                );
                
                // 添加更多随机抖动，避免同时重连
                const jitter = Math.floor(Math.random() * 30000); // 0-30秒随机抖动(从10秒增加)
                const reconnectDelay = interval + jitter;
                
                // 重置重连尝试次数，以便下次可以进行完整的重连周期
                client.resetReconnectAttempts();
                
                // 设置下一次重连时间
                const persistentTimer = setTimeout(() => {
                    Logger.info(
                        XuanceModule.WEBSOCKET.RECONNECT, 
                        clientId, 
                        '执行持久重连尝试'
                    );
                    this.persistentReconnectTimers.delete(clientId);
                    this.attemptReconnect(client);
                }, reconnectDelay);
                
                this.persistentReconnectTimers.set(clientId, persistentTimer);
                
                // 发出日志
                Logger.info(
                    XuanceModule.WEBSOCKET.RECONNECT, 
                    clientId, 
                    `持久重连将在${Math.round(reconnectDelay/1000)}秒后启动`,
                    {
                        reconnectDelay,
                        baseInterval,
                        consecutiveFailures,
                        timestamp: Date.now()
                    }
                );
            } else {
                Logger.warn(
                    XuanceModule.WEBSOCKET.RECONNECT, 
                    clientId, 
                    '网络状态异常，暂时不启动持久重连，60秒后重新检查'
                );
                
                // 如果网络不可用，等待更长时间后再次检查(从30秒增加到60秒)
                const checkTimer = setTimeout(() => {
                    this.persistentReconnectTimers.delete(clientId);
                    this.startPersistentReconnect(clientId);
                }, 60000);
                
                this.persistentReconnectTimers.set(clientId, checkTimer);
            }
        }).catch(error => {
            Logger.error(
                XuanceModule.WEBSOCKET.RECONNECT, 
                clientId, 
                '检查网络状态时出错，60秒后重试', // 从30秒增加到60秒
                error
            );
            
            // 出错时，也等待更长时间后再次尝试
            const errorTimer = setTimeout(() => {
                this.persistentReconnectTimers.delete(clientId);
                this.startPersistentReconnect(clientId);
            }, 60000); // 从30秒增加到60秒
            
            this.persistentReconnectTimers.set(clientId, errorTimer);
        });
    }

    /**
     * 停止持久重连
     */
    public stopPersistentReconnect(clientId: string): void {
        if (this.persistentReconnectTimers.has(clientId)) {
            clearTimeout(this.persistentReconnectTimers.get(clientId)!);
            this.persistentReconnectTimers.delete(clientId);
            
            Logger.info(
                XuanceModule.WEBSOCKET.RECONNECT, 
                clientId, 
                '停止持久重连'
            );
            
            // 发射持久重连停止事件
            this.emit('persistent_reconnect_stop', clientId);
        }
    }

    /**
     * 尝试重连
     */
    private async attemptReconnect(client: WebSocketClientManager): Promise<void> {
        const clientId = client.getId();
        
        try {
            // 记录重连开始
            Logger.info(
                XuanceModule.WEBSOCKET.RECONNECT,
                clientId,
                '开始尝试重连',
                { 
                    attempts: client.getClient().reconnectAttempts,
                    timestamp: Date.now() 
                }
            );
            
            // 获取原始URL和备用URL列表
            const originalUrl = client.getSocket().url.split('?')[0];
            const urls = [originalUrl, ...FALLBACK_URLS];
            const uniqueUrls = Array.from(new Set(urls)); // 去重
            
            // 记录可用URL
            Logger.info(
                XuanceModule.WEBSOCKET.RECONNECT,
                clientId,
                `重连将尝试${uniqueUrls.length}个URL`,
                { urls: uniqueUrls }
            );
            
            let lastError: Error | null = null;
            
            for (const baseUrl of uniqueUrls) {
                try {
                    Logger.info(XuanceModule.WEBSOCKET.RECONNECT, clientId, `尝试连接到 ${baseUrl}`);
                    const config = { ...this.wsConfig, baseUrl };
                    const wsUrl = this.buildWsUrl(clientId, config);
                    
                    // 创建新的WebSocket连接
                    const newSocket = await this.createSocket(wsUrl);
                    
                    // 测试连接是否真正建立
                    const isConnected = await this.testConnection(newSocket);
                    if (!isConnected) {
                        throw new Error('连接测试失败，尽管WebSocket已打开');
                    }
                    
                    // 更新客户端socket
                    client.updateSocket(newSocket);
                    
                    // 发送绑定消息
                    const bindMessage = client.createBindMessage();
                    const sendResult = client.send(bindMessage);
                    
                    if (!sendResult) {
                        throw new Error('Failed to send bind message');
                    }
                    
                    Logger.info(
                        XuanceModule.WEBSOCKET.RECONNECT, 
                        clientId, 
                        `Successfully reconnected using URL: ${wsUrl}`,
                        { timestamp: Date.now() }
                    );
                    
                    // 更新重连历史记录 - 成功
                    this.updateReconnectHistory(clientId, true);
                    
                    // 连接成功，停止持久重连
                    this.stopPersistentReconnect(clientId);
                    
                    // 触发重连成功事件
                    this.emit('reconnect', clientId);
                    return;
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
                    
                    Logger.error(
                        XuanceModule.WEBSOCKET.RECONNECT, 
                        clientId, 
                        `Failed to connect to ${baseUrl}: ${errorMsg}`, 
                        { error: errorMsg, stack: errorStack, timestamp: Date.now() }
                    );
                    continue;
                }
            }
            
            // 如果所有URL都失败，处理重连失败
            throw lastError || new Error('All connection attempts failed');
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : 'No stack trace';
            
            Logger.error(
                XuanceModule.WEBSOCKET.RECONNECT, 
                clientId, 
                `Error during reconnection attempt`, 
                { error: errorMsg, stack: errorStack, timestamp: Date.now() }
            );
            
            // 更新重连历史记录 - 失败
            this.updateReconnectHistory(clientId, false);
            
            // 处理重连失败，是否安排下一次重连取决于尝试次数
            const attempts = client.getClient().reconnectAttempts;
            if (attempts < this.reconnectConfig.maxAttempts) {
                // 还没达到最大尝试次数，继续常规重连流程
                this.scheduleReconnect(client);
            } else {
                // 如果已经达到最大尝试次数，检查是否应该开始持久重连
                // 注意：这里不需要立即调用startPersistentReconnect，因为scheduleReconnect已经会处理这种情况
                Logger.warn(
                    XuanceModule.WEBSOCKET.RECONNECT, 
                    clientId, 
                    `已达到最大重连尝试次数(${attempts})，重连失败事件已触发`
                );
            }
        }
    }

    /**
     * 测试WebSocket连接是否正常
     */
    private async testConnection(socket: WebSocket): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            // 已经连接成功，直接返回true
            if (socket.readyState === WebSocket.OPEN) {
                resolve(true);
                return;
            }
            
            // 如果还在连接中，等待连接完成
            if (socket.readyState === WebSocket.CONNECTING) {
                const onOpen = () => {
                    cleanup();
                    resolve(true);
                };
                
                const onError = () => {
                    cleanup();
                    resolve(false);
                };
                
                const onClose = () => {
                    cleanup();
                    resolve(false);
                };
                
                const cleanup = () => {
                    socket.removeEventListener('open', onOpen);
                    socket.removeEventListener('error', onError);
                    socket.removeEventListener('close', onClose);
                };
                
                socket.addEventListener('open', onOpen);
                socket.addEventListener('error', onError);
                socket.addEventListener('close', onClose);
                
                // 设置超时
                setTimeout(() => {
                    cleanup();
                    resolve(false);
                }, 15000); // 15秒超时
            } else {
                // 已经是CLOSING或CLOSED状态
                resolve(false);
            }
        });
    }

    /**
     * 创建WebSocket连接
     */
    private async createSocket(wsUrl: string): Promise<WebSocket> {
        return new Promise((resolve, reject) => {
            try {
                const socket = new WebSocket(wsUrl, {
                    handshakeTimeout: 15000, // 15秒超时，增加了超时时间
                    headers: {
                        'Upgrade': 'websocket',
                        'Connection': 'Upgrade',
                        'Sec-WebSocket-Version': '13',
                        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
                        'User-Agent': 'XuanceClient/1.0' // 添加User-Agent头，有助于服务器识别
                    },
                    followRedirects: true, // 允许重定向
                    perMessageDeflate: false // 禁用消息压缩，减少复杂性
                });

                // 设置连接超时
                const timeout = setTimeout(() => {
                    socket.terminate(); // 使用terminate而不是close，确保立即关闭
                    reject(new Error('Connection timeout after 15 seconds'));
                }, 15000);

                // 处理连接打开事件
                socket.onopen = () => {
                    clearTimeout(timeout);
                    resolve(socket);
                };

                // 处理错误事件
                socket.onerror = error => {
                    clearTimeout(timeout);
                    
                    // 提取和处理详细的错误信息
                    let errorDetail = '未知错误';
                    try {
                        if (error instanceof Error) {
                            errorDetail = error.message;
                        } else if (typeof error === 'object') {
                            try {
                                errorDetail = JSON.stringify(error);
                            } catch {
                                // 如果JSON序列化失败，尝试提取重要属性
                                errorDetail = Object.getOwnPropertyNames(error)
                                    .filter(key => typeof error[key] !== 'function')
                                    .map(key => `${key}: ${String(error[key])}`)
                                    .join(', ');
                                
                                if (!errorDetail) {
                                    errorDetail = Object.prototype.toString.call(error);
                                }
                            }
                        } else {
                            errorDetail = String(error);
                        }
                    } catch (e) {
                        errorDetail = '错误处理过程中发生异常: ' + (e instanceof Error ? e.message : String(e));
                    }
                    
                    const errorObj = {
                        message: errorDetail,
                        type: 'WebSocket Error',
                        url: wsUrl
                    };
                    
                    // 记录详细日志
                    Logger.error(
                        XuanceModule.WEBSOCKET.RECONNECT,
                        'system',
                        `详细WebSocket错误信息: ${errorDetail}`,
                        { originalError: error, parsedError: errorObj }
                    );
                    
                    reject(new Error(`WebSocket连接错误: ${JSON.stringify(errorObj)}`));
                };
                
                // 处理关闭事件
                socket.onclose = (closeEvent) => {
                    clearTimeout(timeout);
                    const closeInfo = {
                        code: closeEvent.code,
                        reason: closeEvent.reason,
                        wasClean: closeEvent.wasClean
                    };
                    reject(new Error(`WebSocket连接关闭: ${JSON.stringify(closeInfo)}`));
                };
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                reject(new Error(`WebSocket创建失败: ${errorMsg}`));
            }
        });
    }

    /**
     * 生成签名
     */
    private generateSignature(deviceId: string, timestamp: number): string {
        const lastFourChars = deviceId.slice(-4);
        const buf = Buffer.from(`${lastFourChars}&${deviceId}&${timestamp}`);
        const h = crypto.createHash('md5');
        h.update(buf);
        return h.digest('hex');
    }

    /**
     * 构建WebSocket URL
     */
    private buildWsUrl(deviceId: string, config: WsConnectionConfig): string {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = this.generateSignature(deviceId, timestamp);

        const params = new URLSearchParams({
            device_id: deviceId,
            signature: signature,
            signature_version: config.signatureVersion,
            timestamp: timestamp.toString(),
            os_version: config.osVersion,
            app_version: config.appVersion,
            app_vc: config.appVc.toString(),
            app_type: config.appType.toString()
        });

        return `${config.baseUrl}?${params.toString()}`;
    }

    /**
     * 更新客户端集合
     */
    public updateClients(clients: Map<string, WebSocketClientManager>): void {
        this.clients = clients;
    }

    /**
     * 更新重连配置
     */
    public updateReconnectConfig(config: Partial<ReconnectConfig>): void {
        Object.assign(this.reconnectConfig, config);
    }

    /**
     * 更新WebSocket连接配置
     */
    public updateWsConfig(config: Partial<WsConnectionConfig>): void {
        Object.assign(this.wsConfig, config);
    }

    /**
     * 强制重连客户端
     */
    public forceReconnect(clientId: string): void {
        const client = this.clients.get(clientId);
        if (!client) {
            Logger.info(XuanceModule.WEBSOCKET.RECONNECT, clientId, '客户端不存在，无法强制重连');
            return;
        }
        
        // 清理之前的定时器
        client.clearReconnectTimer();
        this.stopPersistentReconnect(clientId);
        
        // 重置重连次数
        client.resetReconnectAttempts();
        
        // 发射重连开始事件
        this.emit('reconnect_start', clientId);
        
        // 记录强制重连
        Logger.info(
            XuanceModule.WEBSOCKET.RECONNECT, 
            clientId, 
            '触发强制重连',
            { 
                timestamp: Date.now(),
                isManualReconnect: true
            }
        );
        
        // 直接开始重连
        this.attemptReconnect(client);
    }

    /**
     * 清理资源
     */
    public destroy(): void {
        // 停止所有持久重连定时器
        for (const [clientId, timer] of this.persistentReconnectTimers.entries()) {
            clearTimeout(timer);
            Logger.info(XuanceModule.WEBSOCKET.RECONNECT, clientId, '清除持久重连定时器');
        }
        this.persistentReconnectTimers.clear();
        
        // 清理重连历史记录
        this.reconnectHistory.clear();
        
        // 移除所有事件监听
        this.removeAllListeners();
        
        Logger.info(
            XuanceModule.WEBSOCKET.RECONNECT,
            'system',
            '重连管理器资源已清理'
        );
    }
} 