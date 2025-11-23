import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { WebSocketClient as IWebSocketClient, WebSocketMessage, BindMessage } from './types';
import { XuanceModule } from '../../types/xuance-module';
import { getRedIdByWSDeviceID } from '../../utils/os';

export class WebSocketClientManager extends EventEmitter {
    private client: IWebSocketClient;
    private pingTimeout: NodeJS.Timeout | null = null;
    private stateCheckInterval: NodeJS.Timeout | null = null;
    private lastStateChangeTime: number = Date.now();
    private stateChangeCount: number = 0;
    
    constructor(id: string, socket: WebSocket) {
        super();
        this.client = {
            id,
            socket,
            lastHeartbeat: Date.now(),
            status: 'connected',
            reconnectAttempts: 0
        };
        
        // 记录初始创建
        Logger.info(
            XuanceModule.WEBSOCKET.STATE_CHANGE,
            id,
            `WebSocket客户端创建，初始状态: connected, Socket状态: ${this.getSocketStateString(socket.readyState)}`
        );
        
        this.setupSocketListeners();
        
        // 启动状态一致性检查
        this.startStateConsistencyCheck();
    }

    /**
     * 获取客户端ID
     */
    public getId(): string {
        return this.client.id;
    }

    /**
     * 获取客户端状态
     */
    public getStatus(): 'connected' | 'disconnected' {
        return this.client.status;
    }

    /**
     * 获取WebSocket实例
     */
    public getSocket(): WebSocket {
        return this.client.socket;
    }

    /**
     * 获取完整客户端对象
     */
    public getClient(): IWebSocketClient {
        return this.client;
    }

    /**
     * 更新客户端对象
     */
    public updateClient(client: Partial<IWebSocketClient>): void {
        const oldStatus = this.client.status;
        this.client = { ...this.client, ...client };
        
        // 如果状态发生变化，记录日志
        if (oldStatus !== this.client.status) {
            Logger.info(
                XuanceModule.WEBSOCKET.STATE_CHANGE,
                this.client.id,
                `WebSocket客户端状态更新: ${oldStatus} → ${this.client.status}`
            );
        }
    }

    /**
     * 设置重连定时器
     */
    public setReconnectTimer(timer: NodeJS.Timeout): void {
        this.client.reconnectTimer = timer;
    }

    /**
     * 清除重连定时器
     */
    public clearReconnectTimer(): void {
        if (this.client.reconnectTimer) {
            clearTimeout(this.client.reconnectTimer);
            this.client.reconnectTimer = undefined;
        }
    }

    /**
     * 增加重连尝试次数
     */
    public incrementReconnectAttempts(): number {
        this.client.reconnectAttempts += 1;
        return this.client.reconnectAttempts;
    }

    /**
     * 重置重连尝试次数
     */
    public resetReconnectAttempts(): void {
        this.client.reconnectAttempts = 0;
    }

    /**
     * 设置客户端状态
     */
    public setStatus(status: 'connected' | 'disconnected'): void {
        // 只有当状态确实变更时才记录日志
        if (this.client.status !== status) {
            const now = Date.now();
            const timeSinceLastChange = now - this.lastStateChangeTime;
            this.lastStateChangeTime = now;
            
            // 统计短时间内状态变化
            if (timeSinceLastChange < 5000) {
                this.stateChangeCount++;
            } else {
                this.stateChangeCount = 1;
            }
            
            // 如果短时间内状态变化频繁，记录警告
            const socketState = this.getSocketStateString(this.client.socket.readyState);
            if (this.stateChangeCount > 3) {
                Logger.warn(
                    XuanceModule.WEBSOCKET.STATE_CHANGE,
                    this.client.id,
                    `WebSocket状态频繁变化(${this.stateChangeCount}次/5秒): ${this.client.status} → ${status}, Socket状态: ${socketState}`,
                    {
                        previousState: this.client.status,
                        newState: status,
                        socketReadyState: socketState,
                        changeCount: this.stateChangeCount,
                        timeSinceLastChange
                    }
                );
            } else {
                Logger.info(
                    XuanceModule.WEBSOCKET.ON_DISCONNECT,
                    this.client.id, 
                    `客户端状态从 ${this.client.status} 变更为 ${status}, Socket状态: ${socketState}`,
                    {
                        previousState: this.client.status,
                        newState: status,
                        socketReadyState: socketState
                    }
                );
            }
            
            this.client.status = status;
            
            // 触发状态变更事件，用于可能的UI更新
            this.emit('status_change', this.client.id, status);
        }
    }

    /**
     * 获取Socket状态的字符串表示
     */
    private getSocketStateString(readyState: number): string {
        switch (readyState) {
            case WebSocket.CONNECTING: return 'CONNECTING';
            case WebSocket.OPEN: return 'OPEN';
            case WebSocket.CLOSING: return 'CLOSING';
            case WebSocket.CLOSED: return 'CLOSED';
            default: return `UNKNOWN(${readyState})`;
        }
    }

    /**
     * 启动状态一致性检查
     */
    private startStateConsistencyCheck(): void {
        // 先清除可能存在的定时器
        this.stopStateConsistencyCheck();
        
        // 创建新的定时器，从5秒改为15秒检查一次
        this.stateCheckInterval = setInterval(() => {
            this.checkStateConsistency();
        }, 15000);
        
        Logger.info(
            XuanceModule.WEBSOCKET.STATE_CHECK,
            this.client.id,
            '开始WebSocket状态一致性检查'
        );
    }

    /**
     * 停止状态一致性检查
     */
    private stopStateConsistencyCheck(): void {
        if (this.stateCheckInterval) {
            clearInterval(this.stateCheckInterval);
            this.stateCheckInterval = null;
            
            Logger.info(
                XuanceModule.WEBSOCKET.STATE_CHECK,
                this.client.id,
                '停止WebSocket状态一致性检查'
            );
        }
    }

    /**
     * 检查WebSocket状态一致性
     */
    private checkStateConsistency(): void {
        try {
            const socketState = this.client.socket.readyState;
            const clientState = this.client.status;
            const lastHeartbeatAge = Date.now() - this.client.lastHeartbeat;
            
            // 记录当前状态
            Logger.debug(
                XuanceModule.WEBSOCKET.STATE_CHECK,
                this.client.id,
                `状态检查: client=${clientState}, socket=${this.getSocketStateString(socketState)}, 上次心跳: ${lastHeartbeatAge}ms前`
            );
            
            // 检查不一致情况，但增加时间阈值，避免刚重连成功就被检测为不一致
            // 仅当上次心跳时间超过10秒，才考虑状态不一致问题
            if (clientState === 'connected' && socketState !== WebSocket.OPEN && lastHeartbeatAge > 10000) {
                Logger.warn(
                    XuanceModule.WEBSOCKET.STATE_CHECK,
                    this.client.id,
                    `状态不一致: 客户端状态为connected，但socket状态为${this.getSocketStateString(socketState)}，上次心跳: ${lastHeartbeatAge}ms前，正在修正`
                );
                
                // 修正状态
                this.setStatus('disconnected');
                
                // 触发断开连接事件，以便重连
                this.emit('disconnect', this.client.id);
            } else if (clientState === 'disconnected' && socketState === WebSocket.OPEN) {
                Logger.warn(
                    XuanceModule.WEBSOCKET.STATE_CHECK,
                    this.client.id,
                    `状态不一致: 客户端状态为disconnected，但socket状态为OPEN，正在修正`
                );
                
                // 确认socket是否真的可用，使用更严格的检查
                try {
                    // 只有当上次心跳时间不太旧时才考虑将状态改为connected
                    if (lastHeartbeatAge < 30000) {
                        // 尝试发送一个ping消息检查连接
                        this.client.socket.ping();
                        
                        // 如果ping成功，修正状态为connected
                        this.setStatus('connected');
                        this.updateHeartbeat(); // 更新心跳时间
                        Logger.info(
                            XuanceModule.WEBSOCKET.STATE_CHECK,
                            this.client.id,
                            '连接确认有效，状态已修正为connected'
                        );
                    } else {
                        // 心跳时间过旧，可能是僵尸连接，关闭它
                        Logger.warn(
                            XuanceModule.WEBSOCKET.STATE_CHECK,
                            this.client.id,
                            `连接虽然开启但心跳过旧(${lastHeartbeatAge}ms)，关闭连接`
                        );
                        this.client.socket.terminate();
                    }
                } catch (error) {
                    // ping失败，socket可能已损坏，强制关闭并重新触发断开连接
                    Logger.error(
                        XuanceModule.WEBSOCKET.STATE_CHECK,
                        this.client.id,
                        'ping测试失败，关闭损坏的socket',
                        error
                    );
                    try {
                        this.client.socket.terminate();
                    } catch (closeError) {
                        Logger.error(
                            XuanceModule.WEBSOCKET.STATE_CHECK,
                            this.client.id,
                            '关闭socket失败',
                            closeError
                        );
                    }
                    
                    // 确保状态保持为disconnected
                    this.setStatus('disconnected');
                }
            }
        } catch (error) {
            Logger.error(
                XuanceModule.WEBSOCKET.STATE_CHECK,
                this.client.id,
                '执行状态一致性检查时出错',
                error
            );
        }
    }

    /**
     * 更新心跳时间
     */
    public updateHeartbeat(): void {
        this.client.lastHeartbeat = Date.now();
        Logger.debug(
            XuanceModule.WEBSOCKET.UPDATE_HEARTBEAT, 
            this.client.id, 
            '更新心跳时间', 
            this.client.lastHeartbeat
        );
        
        // 重置ping超时定时器
        this.resetPingTimeout();
    }

    /**
     * 重置ping超时定时器
     */
    private resetPingTimeout(): void {
        // 清除之前的定时器
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = null;
        }
        
        // 如果连接已断开，不设置新的定时器
        if (this.client.status === 'disconnected') {
            return;
        }
        
        // 设置新的定时器，检测是否需要发送ping，从10秒改为20秒
        this.pingTimeout = setTimeout(() => {
            this.checkPingNeeded();
        }, 20000);
    }
    
    /**
     * 检查是否需要发送ping
     */
    private checkPingNeeded(): void {
        // 如果连接已断开，不执行任何操作
        if (this.client.status === 'disconnected') {
            return;
        }
        
        const now = Date.now();
        const lastHeartbeat = this.client.lastHeartbeat;
        
        // 从30秒改为45秒超时
        if (now - lastHeartbeat > 45000) {
            Logger.warn(
                XuanceModule.WEBSOCKET.HEARTBEAT_TIMEOUT, 
                this.client.id, 
                `心跳超时: ${now - lastHeartbeat}ms，触发断开事件`,
                {
                    now,
                    lastHeartbeat,
                    diff: now - lastHeartbeat
                }
            );
            
            this.setStatus('disconnected');
            this.emit('disconnect', this.client.id);
            return;
        }
        
        // 重置ping超时定时器
        this.resetPingTimeout();
    }

    /**
     * 更新最后一次ping时间
     */
    public updateLastPingTime(): void {
        this.client.lastPingTime = Date.now();
        Logger.debug(
            XuanceModule.WEBSOCKET.SEND_PING,
            this.client.id,
            '更新最后一次ping时间',
            this.client.lastPingTime
        );
    }

    /**
     * 获取最后一次心跳时间
     */
    public getLastHeartbeat(): number {
        return this.client.lastHeartbeat;
    }

    /**
     * 获取最后一次ping时间
     */
    public getLastPingTime(): number | undefined {
        return this.client.lastPingTime;
    }

    /**
     * 设置WebSocket监听器
     */
    private setupSocketListeners(): void {
        const { socket, id } = this.client;

        // 移除可能存在的旧事件监听器
        if (socket.listenerCount('message') > 0) {
            socket.removeAllListeners('message');
        }
        
        // 使用addEventListener而不是直接赋值，避免覆盖已有的事件处理器
        socket.on('message', (data) => {
            try {
                const message = typeof data === 'string' ? JSON.parse(data) : JSON.parse(data.toString());
                
                // 只记录详细日志用于需要关注的消息类型
                const logLevel = ['ping', 'pong', 'bind', 'unbind'].includes(message.command) 
                    ? 'debug' : 'info';
                
                if (logLevel === 'info') {
                    Logger.info(
                        XuanceModule.WEBSOCKET.ON_MESSAGE, 
                        id, 
                        `接收消息: ${message.command}`, 
                        message
                    );
                } else {
                    Logger.debug(
                        XuanceModule.WEBSOCKET.ON_MESSAGE, 
                        id, 
                        `接收消息: ${message.command}`, 
                        message
                    );
                }
                
                this.emit('message', id, message);

                // 处理pong响应
                if (message.command === 'pong') {
                    this.updateHeartbeat();
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                Logger.error(
                    XuanceModule.WEBSOCKET.HANDLE_MSG_ERROR, 
                    id, 
                    'Failed to parse message', 
                    { error: errorMsg, data: typeof data === 'string' ? data : data.toString() }
                );
            }
        });

        socket.on('close', (code, reason) => {
            Logger.info(
                XuanceModule.WEBSOCKET.ON_CLOSE, 
                id, 
                '连接关闭', 
                { code, reason: reason.toString() }
            );
            
            // 清除ping超时定时器
            if (this.pingTimeout) {
                clearTimeout(this.pingTimeout);
                this.pingTimeout = null;
            }
            
            // 清除状态检查定时器
            this.stopStateConsistencyCheck();
            
            this.setStatus('disconnected');
            this.emit('disconnect', id);
        });

        socket.on('error', (error) => {
            // 提取详细的错误信息
            let errorDetail = '未知错误';
            try {
                if (error instanceof Error) {
                    errorDetail = `${error.name}: ${error.message}`;
                } else if (typeof error === 'object') {
                    try {
                        errorDetail = JSON.stringify(error);
                    } catch (e) {
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
            
            const errorStack = error instanceof Error ? error.stack : 'No stack trace';
            
            Logger.error(
                XuanceModule.WEBSOCKET.ON_ERROR, 
                id, 
                `WebSocket error: ${errorDetail}`, 
                { error: errorDetail, stack: errorStack, originalError: error }
            );
            
            this.setStatus('disconnected');
            this.emit('error', id, error);
        });
        
        // 监听ping和pong事件，用于记录日志
        socket.on('ping', () => {
            Logger.debug(
                XuanceModule.WEBSOCKET.RECEIVE_PING,
                id,
                '收到服务器ping'
            );
        });
        
        socket.on('pong', () => {
            Logger.debug(
                XuanceModule.WEBSOCKET.RECEIVE_PONG,
                id,
                '收到服务器pong'
            );
            this.updateHeartbeat();
        });
        
        // 设置ping超时检查
        this.resetPingTimeout();
    }

    /**
     * 更新WebSocket实例
     */
    public updateSocket(newSocket: WebSocket): void {
        // 关闭旧的socket
        if (this.client.socket) {
            try {
                // 先移除旧 socket 的事件监听，避免触发额外的 onclose/onerror
                this.client.socket.removeAllListeners();
                
                if (this.client.socket.readyState === WebSocket.OPEN || this.client.socket.readyState === WebSocket.CONNECTING) {
                    try {
                        this.client.socket.terminate(); // 使用terminate强制关闭，而不是优雅关闭
                    } catch (closeError) {
                        Logger.error(
                            XuanceModule.WEBSOCKET.RECONNECT, 
                            this.client.id, 
                            'Error terminating old socket', 
                            closeError
                        );
                    }
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                Logger.error(
                    XuanceModule.WEBSOCKET.RECONNECT, 
                    this.client.id, 
                    'Error closing old socket', 
                    { error: errorMsg }
                );
            }
        }

        // 清除所有相关的定时器
        this.clearReconnectTimer();
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = null;
        }
        
        // 停止状态检查
        this.stopStateConsistencyCheck();

        // 记录旧socket和新socket状态
        Logger.info(
            XuanceModule.WEBSOCKET.STATE_CHANGE,
            this.client.id,
            `更新WebSocket: 旧Socket状态=${this.getSocketStateString(this.client.socket.readyState)}, 新Socket状态=${this.getSocketStateString(newSocket.readyState)}`
        );
        
        // 更新为新的socket
        this.client.socket = newSocket;
        this.client.status = 'connected';
        this.client.lastHeartbeat = Date.now();
        this.resetReconnectAttempts();
        
        // 设置新的事件监听器
        this.setupSocketListeners();
        
        // 启动状态一致性检查
        this.startStateConsistencyCheck();
        
        Logger.info(
            XuanceModule.WEBSOCKET.RECONNECT, 
            this.client.id, 
            '成功更新WebSocket连接'
        );
    }

    /**
     * 发送消息
     */
    public send(message: WebSocketMessage | string): boolean {
        if (this.client.status !== 'connected') {
            Logger.warn(
                XuanceModule.WEBSOCKET.SEND_MESSAGE, 
                this.client.id, 
                `无法发送消息，客户端状态: ${this.client.status}`,
                {
                    messageType: typeof message === 'string' ? 'string' : message.command
                }
            );
            return false;
        }
        
        if (this.client.socket.readyState !== WebSocket.OPEN) {
            Logger.warn(
                XuanceModule.WEBSOCKET.SEND_MESSAGE, 
                this.client.id, 
                `无法发送消息，Socket状态: ${this.getSocketStateString(this.client.socket.readyState)}`,
                {
                    messageType: typeof message === 'string' ? 'string' : message.command,
                    clientState: this.client.status
                }
            );
            
            // 如果socket状态不是OPEN，但客户端状态是connected，修正客户端状态
            if (this.client.status === 'connected') {
                this.setStatus('disconnected');
                this.emit('disconnect', this.client.id);
            }
            
            return false;
        }

        try {
            const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
            const command = typeof message === 'string' ? 'unknown' : message.command;
            
            this.client.socket.send(messageStr);
            
            // 使用不同日志级别记录不同类型的消息
            if (['ping', 'pong'].includes(command)) {
                Logger.info(
                    XuanceModule.WEBSOCKET.SEND_MESSAGE, 
                    this.client.id, 
                    `发送${command}消息`, 
                    {
                        socketState: this.getSocketStateString(this.client.socket.readyState),
                        content: messageStr
                    }
                );
            } else {
                Logger.info(
                    XuanceModule.WEBSOCKET.SEND_MESSAGE, 
                    this.client.id, 
                    `发送${command}消息`, 
                    {
                        socketState: this.getSocketStateString(this.client.socket.readyState),
                        content: messageStr
                    }
                );
            }
            
            return true;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            Logger.error(
                XuanceModule.WEBSOCKET.SEND_MESSAGE, 
                this.client.id, 
                '发送消息失败', 
                { 
                    error: errorMsg, 
                    socketState: this.getSocketStateString(this.client.socket.readyState),
                    messageType: typeof message === 'string' ? 'string' : message.command
                }
            );
            
            // 发送失败可能表明连接已经断开
            if (this.client.status === 'connected') {
                this.setStatus('disconnected');
                this.emit('disconnect', this.client.id);
            }
            
            return false;
        }
    }

    /**
     * 创建绑定消息
     */
    public createBindMessage(): BindMessage {
        return {
            command: 'bind',
            device_id: this.client.id,
            trace_id: '',
            penetrate: '',
            timestamp: Math.floor(Date.now() / 1000),
            payload: {
                user_id: getRedIdByWSDeviceID(this.client.id)
            }
        };
    }

    /**
     * 创建解绑消息
     */
    public createUnbindMessage(): BindMessage {
        return {
            command: 'unbind',
            device_id: this.client.id,
            trace_id: '',
            penetrate: '',
            timestamp: Math.floor(Date.now() / 1000),
            payload: {
                user_id: getRedIdByWSDeviceID(this.client.id)
            }
        };
    }

    /**
     * 关闭连接
     */
    public close(reason?: string): boolean {
        try {
            // 清除所有定时器
            this.clearReconnectTimer();
            if (this.pingTimeout) {
                clearTimeout(this.pingTimeout);
                this.pingTimeout = null;
            }
            
            // 停止状态检查
            this.stopStateConsistencyCheck();
            
            // 发送解绑消息
            if (this.client.status === 'connected' && this.client.socket.readyState === WebSocket.OPEN) {
                try {
                    this.send(this.createUnbindMessage());
                } catch (sendError) {
                    Logger.error(
                        XuanceModule.WEBSOCKET.REMOVE_CLIENT, 
                        this.client.id, 
                        '发送解绑消息失败', 
                        sendError
                    );
                }
            }
            
            // 关闭socket
            try {
                if (this.client.socket.readyState === WebSocket.OPEN || 
                    this.client.socket.readyState === WebSocket.CONNECTING) {
                    this.client.socket.terminate(); // 使用terminate而不是close
                }
            } catch (closeError) {
                Logger.error(
                    XuanceModule.WEBSOCKET.REMOVE_CLIENT, 
                    this.client.id, 
                    '关闭Socket失败', 
                    closeError
                );
            }
            
            // 移除所有事件监听器
            this.client.socket.removeAllListeners();
            
            this.setStatus('disconnected');
            
            Logger.info(
                XuanceModule.WEBSOCKET.REMOVE_CLIENT, 
                this.client.id, 
                `WebSocket客户端关闭: ${reason || 'not specified'}`
            );
            
            return true;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            Logger.error(
                XuanceModule.WEBSOCKET.REMOVE_CLIENT, 
                this.client.id, 
                'Error closing client', 
                { error: errorMsg }
            );
            return false;
        }
    }

    /**
     * 检查socket是否健康
     */
    public isSocketHealthy(): boolean {
        const isOpen = this.client.socket.readyState === WebSocket.OPEN;
        if (!isOpen) {
            Logger.debug(
                XuanceModule.WEBSOCKET.STATE_CHECK,
                this.client.id,
                `Socket健康检查: ${this.getSocketStateString(this.client.socket.readyState)}`
            );
        }
        return isOpen;
    }
} 