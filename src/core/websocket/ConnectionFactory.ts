import WebSocket from 'ws';
import * as crypto from 'crypto';
import { WsConnectionConfig } from './types';
import { DEFAULT_WS_CONFIG } from './config';
import { XuanceModule } from '../../types/xuance-module';
import { envDataManager } from '../../account/envDataManager';
import { randomUUID } from 'crypto';
import * as os from 'os';
import { networkInterfaces } from 'os';
import { getWSDeviceID } from '../../utils/os';

export class ConnectionFactory {
    private readonly config: WsConnectionConfig;

    constructor(config: WsConnectionConfig = DEFAULT_WS_CONFIG) {
        this.config = config;
    }

    /**
     * 创建WebSocket客户端
     */
    public async createWsClient(userId: string): Promise<{ socket: WebSocket } | null> {
        try {
            const deviceId = await this.generateDeviceId(userId);
            const wsUrl = this.buildWsUrl(deviceId);
            
            Logger.info(
                XuanceModule.WEBSOCKET.CREATE_WS_CLIENT, 
                deviceId, 
                `开始创建WebSocket连接: ${wsUrl}`
            );
            
            return new Promise((resolve, reject) => {
                try {
                    const socket = new WebSocket(wsUrl, {
                        handshakeTimeout: 15000,
                        headers: {
                            'Upgrade': 'websocket',
                            'Connection': 'Upgrade',
                            'Sec-WebSocket-Version': '13',
                            'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
                            'User-Agent': 'XuanceClient/1.0'
                        },
                        followRedirects: true,
                        perMessageDeflate: false
                    });

                    // 设置连接超时
                    const connectionTimeout = setTimeout(() => {
                        socket.terminate();
                        reject(new Error('Connection timeout after 15 seconds'));
                    }, 15000);

                    socket.onopen = () => {
                        clearTimeout(connectionTimeout);
                        
                        Logger.info(
                            XuanceModule.WEBSOCKET.CREATE_WS_CLIENT, 
                            deviceId, 
                            '连接建立成功，准备初始化ping'
                        );
                        
                        // 连接成功后，立即发送一次ping消息，确保连接稳定
                        setTimeout(() => {
                            try {
                                // 尝试发送初始ping
                                const pingMessage = {
                                    command: 'ping',
                                    device_id: deviceId,
                                    trace_id: '',
                                    penetrate: '',
                                    timestamp: Date.now(),
                                    payload: {
                                        user_ids: [userId]
                                    }
                                };
                                
                                const pingData = JSON.stringify(pingMessage);
                                socket.send(pingData);
                                
                                Logger.info(
                                    XuanceModule.WEBSOCKET.SEND_PING, 
                                    deviceId, 
                                    '初始连接ping已发送'
                                );
                            } catch (error) {
                                Logger.error(
                                    XuanceModule.WEBSOCKET.SEND_PING, 
                                    deviceId, 
                                    '初始连接ping发送失败', 
                                    error
                                );
                                // 发送失败不影响解析结果，让重连机制处理
                            }
                        }, 500); // 连接成功后延迟500ms发送，确保连接已完全就绪
                        
                        resolve({ socket });
                    };

                    socket.onerror = error => {
                        clearTimeout(connectionTimeout);
                        
                        // 更详细地处理错误对象
                        let errorDetail = '';
                        if (error) {
                            errorDetail = error?.message ? (error.message + ' ' + error?.error + ' ' + error?.type + ' ' + JSON.stringify(error?.target || {})) : JSON.stringify(error);
                        }

                        errorDetail = errorDetail ? errorDetail : '未知错误';
                        
                        Logger.error(
                            XuanceModule.WEBSOCKET.CREATE_WS_CLIENT, 
                            deviceId, 
                            'Socket创建错误', 
                            { errorDetail, originalError: error }
                        );

                        reject(new Error(`WebSocket连接错误: ${errorDetail}`));
                    };

                    socket.onclose = event => {
                        clearTimeout(connectionTimeout);
                        Logger.warn(
                            XuanceModule.WEBSOCKET.CREATE_WS_CLIENT, 
                            deviceId, 
                            'Socket在建立过程中已关闭', 
                            { code: event.code, reason: event.reason, type: event.type }
                        );
                        reject(new Error(`Socket closed during creation: ${event.code} ${event.reason}`));
                    };

                } catch (error) {
                    Logger.error(
                        XuanceModule.WEBSOCKET.CREATE_WS_CLIENT, 
                        deviceId, 
                        'WebSocket创建失败', 
                        error
                    );
                    reject(error);
                }
            });
        } catch (error) {
            Logger.error(
                XuanceModule.WEBSOCKET.CREATE_WS_CLIENT, 
                userId, 
                '创建WebSocket连接失败', 
                error
            );
            return null;
        }
    }

    /**
     * 带重试的连接
     */
    private async connectWithRetry(wsUrl: string, maxRetries: number = 5): Promise<WebSocket> {
        let retryCount = 0;
        const baseDelay = 1000; // 基础延迟1秒
        const maxDelay = 10000; // 最大延迟10秒

        while (true) {
            try {
                return await this.createSocket(wsUrl);
            } catch (error) {
                if (retryCount >= maxRetries) {
                    throw error;
                }
                
                retryCount++;
                
                // 计算指数退避延迟
                const delay = Math.min(
                    baseDelay * Math.pow(2, retryCount) + Math.random() * 1000,
                    maxDelay
                );
                
                Logger.warn(
                    XuanceModule.WEBSOCKET.CREATE_WS_CLIENT,
                    'system', 
                    `Connection attempt ${retryCount} failed, retrying in ${delay}ms...`
                );
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * 创建WebSocket连接
     */
    private async createSocket(wsUrl: string): Promise<WebSocket> {
        return new Promise((resolve, reject) => {
            try {
                const socket = new WebSocket(wsUrl, {
                    handshakeTimeout: 10000, // 10秒超时
                    headers: {
                        'Upgrade': 'websocket',
                        'Connection': 'Upgrade',
                        'Sec-WebSocket-Version': '13',
                        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64')
                    }
                });

                // 设置连接超时
                const timeout = setTimeout(() => {
                    socket.close();
                    reject(new Error('Connection timeout'));
                }, 10000);

                socket.onopen = () => {
                    clearTimeout(timeout);
                    resolve(socket);
                };

                socket.onerror = error => {
                    clearTimeout(timeout);
                    reject(error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 生成设备ID
     */
    public async generateDeviceId(red_id: string): Promise<string> {
        const account = await envDataManager.loadAccountByRedId(red_id);
        return getWSDeviceID(account.user_id, red_id) // `${account.user_id}_${userId}_${macAddress}`;
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
    private buildWsUrl(deviceId: string): string {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = this.generateSignature(deviceId, timestamp);

        const params = new URLSearchParams({
            device_id: deviceId,
            signature: signature,
            signature_version: this.config.signatureVersion,
            timestamp: timestamp.toString(),
            os_version: this.config.osVersion,
            app_version: this.config.appVersion,
            app_vc: this.config.appVc.toString(),
            app_type: this.config.appType.toString()
        });

        return `${this.config.baseUrl}?${params.toString()}`;
    }

    /**
     * 更新配置
     */
    public updateConfig(config: Partial<WsConnectionConfig>): void {
        Object.assign(this.config, config);
    }
} 