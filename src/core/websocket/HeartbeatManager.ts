import { EventEmitter } from 'events';
import { HeartbeatConfig, PingMessage } from './types';
import { WebSocketClientManager } from './WebSocketClient';
import { DEFAULT_HEARTBEAT_CONFIG } from './config';
import { XuanceModule } from '../../types/xuance-module';
import { getRedIdByWSDeviceID } from '../../utils/os';
export class HeartbeatManager extends EventEmitter {
    private clients: Map<string, WebSocketClientManager>;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private readonly config: HeartbeatConfig;
    private initialPingSent: Set<string> = new Set(); // 跟踪初始ping是否已发送

    constructor(clients: Map<string, WebSocketClientManager>, config: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG) {
        super();
        this.clients = clients;
        this.config = config;
    }

    /**
     * 启动心跳检测
     */
    public start(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        // 将心跳间隔从10秒调整为30秒，降低网络流量
        const activeHeartbeatInterval = 30 * 1000;
        
        this.heartbeatInterval = setInterval(() => {
            this.checkAllClients();
        }, activeHeartbeatInterval);

        Logger.info(XuanceModule.WEBSOCKET.SEND_PING, 'system', '启动心跳检测', {
            pingInterval: activeHeartbeatInterval,
            pongTimeout: this.config.pongTimeout
        });
    }

    /**
     * 停止心跳检测
     */
    public stop(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * 检查所有客户端
     */
    private checkAllClients(): void {
        const now = Date.now();
        
        this.clients.forEach((client, id) => {
            try {
                if (client.getStatus() === 'connected') {
                    // 检查是否发送过初始ping，没有则立即发送
                    if (!this.initialPingSent.has(id)) {
                        this.sendInitialPing(client);
                        this.initialPingSent.add(id);
                    }
                    
                    // 检查是否需要发送ping - 保持连接活跃，但不要过于频繁
                    this.sendPing(client, now);
                    
                    // 检查心跳超时
                    this.checkHeartbeatTimeout(client, now);
                }
            } catch (error) {
                Logger.error(XuanceModule.WEBSOCKET.HEARTBEAT_TIMEOUT, id, `心跳检测异常: ${error}`);
            }
        });
    }

    /**
     * 发送初始ping
     */
    private sendInitialPing(client: WebSocketClientManager): void {
        const clientId = client.getId();
        
        Logger.info(
            XuanceModule.WEBSOCKET.SEND_PING, 
            clientId, 
            '发送初始ping以确保连接活跃'
        );
        
        const pingMessage: PingMessage = {
            command: 'ping',
            device_id: clientId,
            trace_id: '',
            penetrate: '',
            timestamp: Date.now(),
            payload: {
                user_ids: [getRedIdByWSDeviceID(clientId)]
            }
        };

        const success = client.send(pingMessage);
        
        if (success) {
            client.updateLastPingTime();
        } else {
            Logger.error(XuanceModule.WEBSOCKET.SEND_PING, clientId, '初始Ping发送失败');
            this.emit('ping_failed', clientId);
        }
    }

    /**
     * 发送ping，保持活跃但降低频率
     */
    private sendPing(client: WebSocketClientManager, now: number): void {
        const lastPingTime = client.getLastPingTime();
        const clientId = client.getId();
        
        // 如果上次ping时间超过20秒，再发送新的ping（从2秒改为20秒）
        if (!lastPingTime || now - lastPingTime >= 20000) {
            Logger.debug(
                XuanceModule.WEBSOCKET.SEND_PING, 
                clientId, 
                '发送常规ping保持连接', 
                {
                    now,
                    lastPingTime,
                    sinceLastPing: lastPingTime ? now - lastPingTime : 'first ping'
                }
            );
            
            const pingMessage: PingMessage = {
                command: 'ping',
                device_id: clientId,
                trace_id: '',
                penetrate: '',
                timestamp: now,
                payload: {
                    user_ids: [getRedIdByWSDeviceID(clientId)]
                }
            };

            const success = client.send(pingMessage);
            
            if (success) {
                client.updateLastPingTime();
            } else {
                Logger.error(XuanceModule.WEBSOCKET.SEND_PING, clientId, 'Ping发送失败');
                this.emit('ping_failed', clientId);
            }
        }
    }

    /**
     * 检查心跳超时
     */
    private checkHeartbeatTimeout(client: WebSocketClientManager, now: number): void {
        const lastHeartbeat = client.getLastHeartbeat();
        const clientId = client.getId();
        
        // 添加心跳临界提醒，帮助诊断问题
        const heartbeatAge = now - lastHeartbeat;
        const timeoutThreshold = this.config.pongTimeout;
        // 减小警告阈值，更早触发预警
        const warningThreshold = timeoutThreshold * 0.7; // 70%的超时时间作为警告阈值（从50%调整）
        
        if (heartbeatAge > warningThreshold && heartbeatAge <= timeoutThreshold) {
            // 接近超时但尚未超时
            Logger.warn(
                XuanceModule.WEBSOCKET.HEARTBEAT_TIMEOUT, 
                clientId, 
                `心跳接近超时(${Math.round(heartbeatAge / 1000)}/${Math.round(timeoutThreshold / 1000)}秒)，尝试额外ping`,
                {
                    now,
                    lastHeartbeat,
                    heartbeatAge,
                    timeoutThreshold
                }
            );
            
            // 减少ping发送次数，从3次改为只发送1次
            this.sendPing(client, now);
        }
        else if (heartbeatAge > timeoutThreshold) {
            // 已经超时
            Logger.warn(
                XuanceModule.WEBSOCKET.HEARTBEAT_TIMEOUT, 
                clientId, 
                `Client ${clientId} heartbeat timeout after ${heartbeatAge}ms (threshold: ${timeoutThreshold}ms)`,
                {
                    now,
                    lastHeartbeat,
                    heartbeatAge,
                    timeoutThreshold
                }
            );
            
            // 触发心跳超时事件
            this.emit('heartbeat_timeout', clientId);
        }
    }

    /**
     * 重置客户端初始ping状态
     */
    public resetInitialPingStatus(clientId: string): void {
        this.initialPingSent.delete(clientId);
    }

    /**
     * 更新客户端集合
     */
    public updateClients(clients: Map<string, WebSocketClientManager>): void {
        this.clients = clients;
    }

    /**
     * 更新配置
     */
    public updateConfig(config: Partial<HeartbeatConfig>): void {
        Object.assign(this.config, config);
        
        // 如果更新了pingInterval，则重启心跳检测
        if (config.pingInterval && this.heartbeatInterval) {
            this.start();
        }
    }
} 