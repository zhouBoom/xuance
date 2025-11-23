import WebSocket from 'ws';

// WebSocket客户端接口
export interface WebSocketClient {
    id: string;
    socket: WebSocket;
    lastHeartbeat: number;
    status: 'connected' | 'disconnected';
    reconnectAttempts: number;
    reconnectTimer?: NodeJS.Timeout;
    lastPingTime?: number;
}

// WebSocket连接配置接口
export interface WsConnectionConfig {
    baseUrl: string;
    appVersion: string;
    appVc: number;
    osVersion: string;
    appType: number;
    signatureVersion: string;
}

// 重连配置接口
export interface ReconnectConfig {
    maxAttempts: number;  // 最大重试次数
    maxTimeout: number;   // 最大重连间隔(ms)
    baseTimeout: number;  // 基础重连间隔(ms)
}

// 心跳检测配置接口
export interface HeartbeatConfig {
    pingInterval: number;    // 发送ping的间隔
    pongTimeout: number;     // 等待pong响应的超时时间
    reconnectDelay: number;  // 重连延迟
}

// 消息接口
export interface WebSocketMessage {
    command: string;
    device_id: string;
    trace_id: string;
    penetrate: string;
    timestamp: number;
    payload: any;
    // 扩展属性，用于处理过程中添加
    red_id?: string;
    account_id?: string;
    [key: string]: any; // 允许添加其他属性
}

// 绑定消息接口
export interface BindMessage extends WebSocketMessage {
    payload: {
        user_id: string;
    };
}

// Ping消息接口
export interface PingMessage extends WebSocketMessage {
    payload: {
        user_ids: string[];
    };
} 