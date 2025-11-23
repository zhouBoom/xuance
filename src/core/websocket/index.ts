import { envDataManager } from '../../account/envDataManager';
import { XuanceModule } from '../../types/xuance-module';
import { receivePreRouter } from '../router/receivePre';
import { WebSocketPool } from './websocketPool';
import { WebSocketMessage } from './types';
import { app } from 'electron';
import { getMainWindow } from '../../main';
import { DialogHelper, DialogType } from '../../utils/dialog-helper';
import { handleReceivedTask, handleTaskCompletion, handlePendingTasksOnRestart } from '../taskPersistence';
// 获取连接池实例
const wsPool = WebSocketPool.getInstance();

// 用于跟踪重连状态和超时对话框
let reconnectionStartTime: number | null = null;
let reconnectionTimeoutTimer: NodeJS.Timeout | null = null;

// 监听消息
wsPool.on('message', async (clientId: string, message: WebSocketMessage) => {
    try {
        // 处理账号在其他地方登录的情况
        if (message.command === 'logout' || message.penetrate === 'conn.device.kicked') {
            Logger.info(
                XuanceModule.WEBSOCKET.ON_MESSAGE, 
                clientId, 
                '收到logout事件，账号在其他地方登录，终止连接',
                message
            );
            
            // 从连接池中移除客户端，并禁止重连
            removeClient(clientId, 'account_logged_in_elsewhere');
            
            // 显示提示对话框
            const mainWindow = getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                DialogHelper.showNonModalDialog(
                    mainWindow,
                    {
                        title: '账号已在其他地方登录',
                        message: '您的账号已在其他地方登录',
                        detail: '您的账号已在其他地方登录，点击确认按钮重启程序重试。',
                        type: DialogType.WARNING,
                        buttons: [
                            {
                                text: '确认',
                                id: 0,
                                isDefault: true,
                                action: () => {
                                    Logger.info(XuanceModule.SYSTEM.APP.RELAUNCH, 'system', '用户点击确认按钮重启程序');
                                    app.relaunch();
                                    app.exit(0);
                                }
                            }
                        ],
                        defaultId: 0,
                        cancelId: 0
                    },
                    'account-logged-in-elsewhere'
                );
            }
            
            return; // 不继续处理消息
        }
        
        if ('user_id' in message.payload) {
            message.red_id = message.payload.user_id;
            const account = await envDataManager.loadAccountByRedId(message.payload.user_id);
            message.account_id = account.user_id;
            await handleReceivedTask(message.account_id, message);
        }
        
        const result = await receivePreRouter.route(message as any); 
        Logger.info(XuanceModule.WEBSOCKET.ON_MESSAGE, message.account_id, `Received message from ${clientId}:`, result);
    } catch (error) {
        Logger.error(XuanceModule.WEBSOCKET.ON_MESSAGE, clientId, 'Error processing message', error);
    }
});

// 监听断开连接
wsPool.on('disconnect', (clientId: string) => {
    Logger.info(XuanceModule.WEBSOCKET.ON_DISCONNECT, clientId, `Client ${clientId} disconnected`);
});

// 监听重连开始
wsPool.on('reconnect_start', (clientId: string) => {
    Logger.info(XuanceModule.WEBSOCKET.RECONNECT, clientId, `Client ${clientId} starting reconnection, reconnectionStartTime:${reconnectionStartTime}`);
    
    // 记录重连开始时间
    if (!reconnectionStartTime) {
        reconnectionStartTime = Date.now();
        
        // 设置30秒超时定时器
        if (reconnectionTimeoutTimer) {
            clearTimeout(reconnectionTimeoutTimer);
        }
        
        reconnectionTimeoutTimer = setTimeout(() => {
            Logger.info(XuanceModule.WEBSOCKET.RECONNECT, clientId, `Client ${clientId} starting reconnection timeout ${Date.now() - reconnectionStartTime}`);
            // 检查网络连接
            checkNetworkAndShowDialog(clientId);
        }, 30000);
    }
});

// 监听重连成功
wsPool.on('reconnect', (clientId: string) => {
    Logger.info(XuanceModule.WEBSOCKET.RECONNECT, clientId, `Client ${clientId} reconnected`);
    
    // 重置重连开始时间和清除超时定时器
    reconnectionStartTime = null;
    
    if (reconnectionTimeoutTimer) {
        clearTimeout(reconnectionTimeoutTimer);
        reconnectionTimeoutTimer = null;
    }
    
    // 关闭可能显示的对话框
    DialogHelper.closeDialog('ws-reconnection-timeout');
});

// 监听重连失败
wsPool.on('reconnect_failed', (clientId: string) => {
    Logger.warn(XuanceModule.WEBSOCKET.RECONNECT, clientId, `Client ${clientId} failed to reconnect`);
});

/**
 * 检查网络并显示对话框
 */
async function checkNetworkAndShowDialog(clientId: string) {
    // 获取重连开始到现在的时间
    const reconnectionTime = reconnectionStartTime ? Date.now() - reconnectionStartTime : 0;
    
    // 如果重连时间超过30秒
    if (reconnectionTime >= 30000) {
        const mainWindow = getMainWindow();
        
        if (!mainWindow || mainWindow.isDestroyed()) {
            return;
        }
        
        // 显示连接异常对话框
        DialogHelper.showNonModalDialog(
            mainWindow,
            {
                title: '连接异常',
                message: '与服务器的连接异常',
                detail: '可能是网络环境异常或者服务器暂时不可用，请重启程序重试。',
                type: DialogType.WARNING,
                buttons: [
                    {
                        text: '重启程序',
                        id: 0,
                        isDefault: true,
                        action: () => {
                            Logger.info(XuanceModule.SYSTEM.APP.RELAUNCH, 'system', '用户选择重启程序');
                            app.relaunch();
                            app.exit(0);
                        }
                    },
                    // {
                    //     text: '继续等待',
                    //     id: 1,
                    //     isCancel: true
                    // }
                ],
                defaultId: 0,
                cancelId: 1
            },
            'ws-reconnection-timeout'
        );
    }
}

// 导出公共方法
const createWsClient = async (userId: string): Promise<boolean> => {
    return await wsPool.createWsClient(userId);
};

const sendMessage = (clientId: string, message: WebSocketMessage): void => {
    wsPool.sendMessage(clientId, message);
};

const broadcastMessage = (message: WebSocketMessage): void => {
    wsPool.broadcastMessage(message);
};

const removeClient = (clientId: string, reason?: string): boolean => {
    return wsPool.removeClient(clientId, reason);
};

const cleanWebsocket = (): void => {
    wsPool.destroy();
};

const isClientConnected = (clientId: string): boolean => {
    return wsPool.isClientConnected(clientId);
};

const isClientReconnecting = (clientId: string): boolean => {
    return wsPool.isClientReconnecting(clientId);
};

const handleNetworkChange = (isOnline: boolean): void => {
    wsPool.handleNetworkChange(isOnline);
};

export { 
    createWsClient, 
    sendMessage, 
    broadcastMessage, 
    removeClient, 
    cleanWebsocket,
    isClientConnected,
    isClientReconnecting,
    handleNetworkChange,
    WebSocketPool
};

