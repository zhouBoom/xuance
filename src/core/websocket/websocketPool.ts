import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { 
    WebSocketClient as IWebSocketClient, 
    WebSocketMessage 
} from './types';
import { XuanceModule } from '../../types/xuance-module';
import { 
    DEFAULT_HEARTBEAT_CONFIG, 
    DEFAULT_RECONNECT_CONFIG, 
    DEFAULT_WS_CONFIG 
} from './config';
import { WebSocketClientManager } from './WebSocketClient';
import { HeartbeatManager } from './HeartbeatManager';
import { ReconnectionManager } from './ReconnectionManager';
import { ConnectionFactory } from './ConnectionFactory';

/**
 * WebSocket连接池，管理多个WebSocket连接
 */
export class WebSocketPool extends EventEmitter {
    private static instance: WebSocketPool;
    private clients: Map<string, WebSocketClientManager>;
    private heartbeatManager: HeartbeatManager;
    private reconnectionManager: ReconnectionManager;
    private connectionFactory: ConnectionFactory;
    private reconnectingClients: Set<string> = new Set(); // 跟踪正在重连的客户端
    private static readonly MAX_CONNECTION_COUNT = 50; // 限制最大连接数
    private lastCleanupTime: number = Date.now(); // 上次清理时间
    private static readonly CLEANUP_INTERVAL = 3600000; // 1小时清理一次

    private constructor() {
        super();
        this.clients = new Map();
        
        // 初始化心跳管理器
        this.heartbeatManager = new HeartbeatManager(this.clients, DEFAULT_HEARTBEAT_CONFIG);
        
        // 初始化重连管理器
        this.reconnectionManager = new ReconnectionManager(
            this.clients, 
            DEFAULT_RECONNECT_CONFIG,
            DEFAULT_WS_CONFIG
        );
        
        // 初始化连接工厂
        this.connectionFactory = new ConnectionFactory(DEFAULT_WS_CONFIG);
        
        // 设置事件监听
        this.setupEventListeners();
        
        // 启动心跳检测
        this.heartbeatManager.start();
    }

    /**
     * 获取单例实例
     */
    public static getInstance(): WebSocketPool {
        if (!WebSocketPool.instance) {
            WebSocketPool.instance = new WebSocketPool();
        }
        return WebSocketPool.instance;
    }

    /**
     * 设置事件监听
     */
    private setupEventListeners(): void {
        // 监听心跳管理器事件
        this.heartbeatManager.on('heartbeat_timeout', (clientId: string) => {
            // 只有在当前未处于重连状态时才触发重连
            if (!this.isClientReconnecting(clientId)) {
                Logger.info(
                    XuanceModule.WEBSOCKET.HEARTBEAT_TIMEOUT, 
                    clientId, 
                    '心跳超时，触发重连'
                );
                this.reconnectionManager.handleDisconnect(clientId);
            } else {
                Logger.info(
                    XuanceModule.WEBSOCKET.HEARTBEAT_TIMEOUT, 
                    clientId, 
                    '心跳超时，但已在重连中，忽略此次触发'
                );
            }
        });
        
        this.heartbeatManager.on('ping_failed', (clientId: string) => {
            // 只有在当前未处于重连状态时才触发重连
            if (!this.isClientReconnecting(clientId)) {
                Logger.info(
                    XuanceModule.WEBSOCKET.SEND_PING, 
                    clientId, 
                    'Ping发送失败，触发重连'
                );
                this.reconnectionManager.handleDisconnect(clientId);
            } else {
                Logger.info(
                    XuanceModule.WEBSOCKET.SEND_PING, 
                    clientId, 
                    'Ping发送失败，但已在重连中，忽略此次触发'
                );
            }
        });
        
        // 监听重连管理器事件
        this.reconnectionManager.on('disconnect', (clientId: string) => {
            // 标记客户端开始重连
            this.reconnectingClients.add(clientId);
            Logger.info(
                XuanceModule.WEBSOCKET.STATE_CHANGE,
                clientId,
                `客户端开始重连过程，标记为重连中`
            );
            this.emit('disconnect', clientId);
        });
        
        this.reconnectionManager.on('reconnect', (clientId: string) => {
            // 重连成功，移除标记，延迟处理以确保状态稳定
            setTimeout(() => {
                this.reconnectingClients.delete(clientId);
                Logger.info(
                    XuanceModule.WEBSOCKET.STATE_CHANGE,
                    clientId,
                    `客户端重连成功，移除重连标记`
                );
            }, 2000); // 延迟2秒移除标记，避免状态检查立即触发重连
            
            this.emit('reconnect', clientId);
        });
        
        this.reconnectionManager.on('reconnect_failed', (clientId: string) => {
            // 重连失败，保持标记以便持久重连继续工作
            this.emit('reconnect_failed', clientId);
            
            // 重连失败时不立即移除客户端，让持久重连机制继续工作
            // 只有在明确调用removeClient时才真正移除
            Logger.warn(
                XuanceModule.WEBSOCKET.RECONNECT,
                clientId,
                '重连失败，但不立即移除客户端，等待网络恢复后继续尝试'
            );
            
            // 通知用户界面连接状态变更
            this.emit('connection_status_changed', clientId, 'waiting_for_network');
        });

        // 监听重连开始事件
        this.reconnectionManager.on('reconnect_start', (clientId: string) => {
            // 避免重复添加
            if (!this.reconnectingClients.has(clientId)) {
                this.reconnectingClients.add(clientId);
                Logger.info(
                    XuanceModule.WEBSOCKET.RECONNECT,
                    clientId,
                    '开始重连过程，标记为重连中'
                );
            }
            
            // 向外传播reconnect_start事件
            this.emit('reconnect_start', clientId);
        });

        // 监听持久重连停止事件
        this.reconnectionManager.on('persistent_reconnect_stop', (clientId: string) => {
            // 持久重连停止时，如果不是因为重连成功，需要移除重连标记
            // 增加延迟确保状态稳定
            setTimeout(() => {
                if (!this.isClientConnected(clientId)) {
                    this.reconnectingClients.delete(clientId);
                    Logger.info(
                        XuanceModule.WEBSOCKET.RECONNECT,
                        clientId,
                        '持久重连停止，移除重连标记'
                    );
                }
            }, 1000);
        });
        
        // 添加WebSocketClient的状态变化监听
        this.clients.forEach(client => {
            client.on('status_change', (clientId: string, status: 'connected' | 'disconnected') => {
                if (status === 'connected' && this.reconnectingClients.has(clientId)) {
                    // 延迟处理，确保状态稳定
                    setTimeout(() => {
                        // 再次检查状态是否仍为connected
                        const currentClient = this.clients.get(clientId);
                        if (currentClient && currentClient.getStatus() === 'connected') {
                            this.reconnectingClients.delete(clientId);
                            Logger.info(
                                XuanceModule.WEBSOCKET.STATE_CHANGE,
                                clientId,
                                '客户端状态变为connected，移除重连标记'
                            );
                        }
                    }, 2000);
                }
            });
        });
    }

    /**
     * 检查客户端是否正在重连中
     */
    public isClientReconnecting(clientId: string): boolean {
        return this.reconnectingClients.has(clientId);
    }

    /**
     * 创建WebSocket客户端
     */
    public async createWsClient(userId: string): Promise<boolean> {
        try {
            // 先生成设备ID，通过userId
            const deviceId = await this.connectionFactory.generateDeviceId(userId);
            
            // 限制最大连接数
            if (this.clients.size >= WebSocketPool.MAX_CONNECTION_COUNT && !this.clients.has(deviceId)) {
                Logger.warn(
                    XuanceModule.WEBSOCKET.CREATE_WS_CLIENT,
                    deviceId,
                    `连接池已达到最大连接数限制(${WebSocketPool.MAX_CONNECTION_COUNT})，尝试清理不活跃连接`
                );
                this.cleanupInactiveConnections();
                
                // 如果清理后仍然达到上限，拒绝创建新连接
                if (this.clients.size >= WebSocketPool.MAX_CONNECTION_COUNT) {
                    Logger.error(
                        XuanceModule.WEBSOCKET.CREATE_WS_CLIENT,
                        deviceId,
                        `清理后仍达到最大连接数限制(${WebSocketPool.MAX_CONNECTION_COUNT})，拒绝创建新连接`
                    );
                    return false;
                }
            }
            
            // 检查是否已存在相同deviceId的客户端
            if (this.clients.has(deviceId)) {
                const existingClient = this.clients.get(deviceId);
                
                // 如果已存在且连接状态是已连接，直接返回成功
                if (existingClient && existingClient.getStatus() === 'connected') {
                    Logger.info(
                        XuanceModule.WEBSOCKET.CREATE_WS_CLIENT,
                        deviceId,
                        `Client already exists and connected, reusing it`
                    );
                    return true;
                }
                
                // 检查客户端是否正在重连中，避免与重连机制冲突
                if (this.isClientReconnecting(deviceId)) {
                    Logger.info(
                        XuanceModule.WEBSOCKET.CREATE_WS_CLIENT,
                        deviceId,
                        `Client is currently reconnecting, skipping initialization`
                    );
                    return true; // 返回true以避免重复初始化
                }
                
                // 如果存在但状态为断开且没有正在重连，尝试重新连接
                if (existingClient && existingClient.getStatus() === 'disconnected') {
                    Logger.info(
                        XuanceModule.WEBSOCKET.CREATE_WS_CLIENT,
                        deviceId,
                        `Client exists but disconnected and not reconnecting, force reconnect`
                    );
                    // 在强制重连前先标记为正在重连中
                    this.reconnectingClients.add(deviceId);
                    this.reconnectionManager.forceReconnect(deviceId);
                    return true;
                }
            }
            
            // 如果不存在且先前没有重连记录，创建新的连接
            if (!this.reconnectingClients.has(deviceId)) {
                Logger.info(
                    XuanceModule.WEBSOCKET.CREATE_WS_CLIENT,
                    deviceId,
                    `Creating new WebSocket client`
                );
                
                const result = await this.connectionFactory.createWsClient(userId);
                if (!result) {
                    return false;
                }
                
                const { socket } = result;
                
                // 创建新的客户端管理器
                const clientManager = new WebSocketClientManager(deviceId, socket);
                
                // 设置客户端事件监听
                clientManager.on('message', (clientId: string, message: any) => {
                    this.emit('message', clientId, message);
                });
                
                clientManager.on('disconnect', (clientId: string) => {
                    this.reconnectionManager.handleDisconnect(clientId);
                });
                
                clientManager.on('error', (clientId: string, error: any) => {
                    Logger.error(XuanceModule.WEBSOCKET.ON_ERROR, clientId, 'WebSocket error', error);
                    this.reconnectionManager.handleDisconnect(clientId);
                });
                
                // 添加到客户端集合
                this.clients.set(deviceId, clientManager);
                
                // 发送绑定消息
                const bindMessage = clientManager.createBindMessage();
                clientManager.send(bindMessage);
                
                Logger.info(
                    XuanceModule.WEBSOCKET.ADD_CLIENT, 
                    deviceId, 
                    `WebSocket client connected`
                );
                
                // 检查是否需要清理不活跃连接
                const now = Date.now();
                if (now - this.lastCleanupTime > WebSocketPool.CLEANUP_INTERVAL) {
                    this.cleanupInactiveConnections();
                    this.lastCleanupTime = now;
                }
                
                return true;
            } else {
                // 客户端正在重连中，不需要创建新连接
                Logger.info(
                    XuanceModule.WEBSOCKET.CREATE_WS_CLIENT,
                    deviceId,
                    `Client reconnection already in progress, skipping creation`
                );
                return true;
            }
        } catch (error) {
            Logger.error(
                XuanceModule.WEBSOCKET.CREATE_WS_CLIENT,
                userId,
                'Failed to create WebSocket client',
                error?.message + ' --- ' + error?.stack
            );
            
            return false;
        }
    }

    /**
     * 清理不活跃的连接
     */
    private cleanupInactiveConnections(): void {
        const now = Date.now();
        const inactiveTimeout = 24 * 60 * 60 * 1000; // 24小时不活跃判定为可清理
        const disconnectedTimeout = 30 * 60 * 1000; // 30分钟断开状态判定为可清理
        const clientsToRemove: string[] = [];
        
        this.clients.forEach((client, id) => {
            try {
                const lastHeartbeat = client.getLastHeartbeat();
                const isDisconnected = client.getStatus() === 'disconnected';
                
                // 检查状态和最后活动时间
                if (
                    (isDisconnected && now - lastHeartbeat > disconnectedTimeout) || // 断开超过30分钟
                    (!isDisconnected && now - lastHeartbeat > inactiveTimeout)       // 连接但不活跃超过24小时
                ) {
                    clientsToRemove.push(id);
                    Logger.info(
                        XuanceModule.WEBSOCKET.REMOVE_CLIENT,
                        id,
                        `标记清理不活跃连接: 状态=${isDisconnected ? '断开' : '连接'}, 上次活动=${(now - lastHeartbeat) / 1000}秒前`
                    );
                }
            } catch (error) {
                Logger.error(
                    XuanceModule.WEBSOCKET.REMOVE_CLIENT,
                    id,
                    '检查连接状态出错',
                    error
                );
            }
        });
        
        // 批量移除不活跃连接
        if (clientsToRemove.length > 0) {
            this.removeClients(clientsToRemove, 'inactive_cleanup');
            Logger.info(
                XuanceModule.WEBSOCKET.REMOVE_CLIENT,
                'system',
                `已清理${clientsToRemove.length}个不活跃连接`
            );
        }
    }

    /**
     * 向指定客户端发送消息
     */
    public sendToClient(clientId: string, message: WebSocketMessage): boolean {
        const client = this.clients.get(clientId);
        return client ? client.send(message) : false;
    }

    /**
     * 广播消息给所有客户端
     */
    public broadcast(message: WebSocketMessage, excludeId?: string): void {
        this.clients.forEach((client, id) => {
            if (id !== excludeId && client.getStatus() === 'connected') {
                client.send(message);
            }
        });
    }

    /**
     * 获取当前连接数
     */
    public getConnectionCount(): number {
        return this.clients.size;
    }

    /**
     * 获取指定客户端
     */
    public getClient(clientId: string): IWebSocketClient | null {
        const client = this.clients.get(clientId);
        return client ? client.getClient() : null;
    }

    /**
     * 获取指定客户端状态
     */
    public getClientStatus(clientId: string): 'connected' | 'disconnected' | null {
        const client = this.clients.get(clientId);
        return client ? client.getStatus() : null;
    }

    /**
     * 移除指定客户端连接
     */
    public removeClient(clientId: string, reason?: string): boolean {
        const client = this.clients.get(clientId);
        if (!client) {
            return false;
        }
        
        // 关闭连接
        client.close(reason);
        
        // 停止所有相关的重连尝试
        if (this.reconnectionManager) {
            this.reconnectionManager.stopPersistentReconnect(clientId);
        }
        
        // 从重连跟踪集合中移除
        this.reconnectingClients.delete(clientId);
        
        // 从连接池中删除
        this.clients.delete(clientId);
        
        // 触发移除事件
        this.emit('remove', clientId, reason);
        
        Logger.info(
            XuanceModule.WEBSOCKET.REMOVE_CLIENT,
            clientId,
            `客户端已彻底移除，原因: ${reason || '未指定'}`
        );
        
        return true;
    }

    /**
     * 批量移除客户端
     */
    public removeClients(clientIds: string[], reason?: string): void {
        clientIds.forEach(clientId => {
            this.removeClient(clientId, reason);
        });
    }

    /**
     * 根据条件移除客户端
     */
    public removeClientsByCondition(predicate: (client: IWebSocketClient) => boolean): void {
        this.clients.forEach((clientManager, id) => {
            if (predicate(clientManager.getClient())) {
                this.removeClient(id, 'condition_matched');
            }
        });
    }

    /**
     * 清理资源
     */
    public destroy(): void {
        // 停止心跳检测
        this.heartbeatManager.stop();
        
        // 清理重连管理器资源
        if (this.reconnectionManager) {
            this.reconnectionManager.destroy();
        }
        
        // 关闭所有客户端连接
        this.clients.forEach((client, id) => {
            client.close('pool_destroy');
        });
        
        // 清空客户端集合和重连集合
        this.clients.clear();
        this.reconnectingClients.clear();
        
        // 移除所有事件监听
        this.removeAllListeners();
        
        Logger.info(
            XuanceModule.WEBSOCKET.REMOVE_CLIENT,
            'system',
            'WebSocket连接池已销毁'
        );
    }

    /**
     * 对外发送消息的便捷方法
     */
    public sendMessage(clientId: string, message: WebSocketMessage): void {
        this.sendToClient(clientId, message);
    }

    /**
     * 对外广播消息的便捷方法
     */
    public broadcastMessage(message: WebSocketMessage): void {
        this.broadcast(message);
    }

    /**
     * 检查客户端是否连接
     */
    public isClientConnected(clientId: string): boolean {
        const client = this.clients.get(clientId);
        return !!(client && client.getStatus() === 'connected');
    }

    /**
     * 处理网络状态变化
     */
    public handleNetworkChange(isOnline: boolean): void {
        if (isOnline) {
            Logger.info(XuanceModule.WEBSOCKET.RECONNECT, 'system', '网络恢复，开始重连所有客户端');
            
            // 创建客户端列表的副本以避免并发修改
            const clientIds = Array.from(this.clients.keys());
            
            // 限制同时重连的客户端数量，分批重连避免重连风暴
            const batchSize = 5; // 一次最多重连5个客户端
            const reconnectBatch = (startIndex: number) => {
                const endIndex = Math.min(startIndex + batchSize, clientIds.length);
                for (let i = startIndex; i < endIndex; i++) {
                    const id = clientIds[i];
                    const client = this.clients.get(id);
                    
                    if (!client) continue;
                    
                    try {
                        // 先测试连接是否真的健康
                        const isHealthy = client.isSocketHealthy();
                        
                        if (!isHealthy || client.getStatus() === 'disconnected') {
                            Logger.info(
                                XuanceModule.WEBSOCKET.RECONNECT, 
                                id, 
                                `批次${Math.floor(i/batchSize)+1}：强制重连客户端，当前状态: ${client.getStatus()}, 连接健康: ${isHealthy}`
                            );
                            
                            // 强制重置状态并开始重连
                            client.clearReconnectTimer();
                            client.resetReconnectAttempts();
                            client.setStatus('disconnected');
                            
                            // 标记为正在重连中
                            this.reconnectingClients.add(id);
                            
                            // 使用强制重连而不是普通重连
                            this.reconnectionManager.forceReconnect(id);
                        }
                    } catch (error) {
                        Logger.error(
                            XuanceModule.WEBSOCKET.RECONNECT, 
                            id, 
                            `网络恢复时重连出错: ${error}`
                        );
                        // 出错也尝试强制重连
                        this.reconnectingClients.add(id);
                        this.reconnectionManager.forceReconnect(id);
                    }
                }
                
                // 处理下一批
                if (endIndex < clientIds.length) {
                    setTimeout(() => {
                        reconnectBatch(endIndex);
                    }, 3000); // 每批之间间隔3秒
                }
            };
            
            // 开始第一批重连
            reconnectBatch(0);
        } else {
            Logger.info(XuanceModule.WEBSOCKET.ON_DISCONNECT, 'system', '网络断开，标记所有客户端为断开状态');
            
            // 网络断开，标记所有客户端为断开状态
            this.clients.forEach((client, id) => {
                if (client.getStatus() === 'connected') {
                    client.setStatus('disconnected');
                }
            });
        }
    }
}