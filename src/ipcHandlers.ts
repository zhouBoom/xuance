import { ipcMain } from 'electron';
import { accountLoginFlow } from './account/accountLoginFlow';
import { promises as fs } from 'fs';
import path from 'path';
import './account/ipc';
import './plugins/hook/ipc'
import { getMainWindow } from './main';
import { accountViewManager } from './account/accountViewManager';
import { sendToRenderer } from './account/ipc';
import { XuanceModule } from './types/xuance-module';
import { RemoteControlManager } from './remote-control/remoteControlManager.js';

// 远程控制管理器实例
let remoteControlManager: RemoteControlManager | null = null;

ipcMain.handle('task:start', async (event, taskId) => {
    console.log(`Starting task with ID: ${taskId}`);
    // 处理任务启动逻辑
    return { success: true, taskId };
});

ipcMain.handle('task:stop', async (event, taskId) => {
    console.log(`Stopping task with ID: ${taskId}`);
    // 处理任务停止逻辑
    return { success: true, taskId };
});

ipcMain.on('open-login-window', async (event, platform) => {
    const platformUrl = getPlatformLoginUrl(platform);
    const accountData:any = await accountLoginFlow.startLogin(platformUrl);
    setTimeout(async () => {
        sendToRenderer(getMainWindow(), 'account-init-loading', true);
        try{
            accountViewManager.setActiveView(accountData.user_id);
            await new Promise(r => setTimeout(r, 1000))
            accountViewManager.setActiveView(accountData.user_id);
            await new Promise(r => setTimeout(r, 1000))
        } catch (error) {
            Logger.error(XuanceModule.ACCOUNT.LOGIN_FAILED, 'set active view failed', error);
        }
        sendToRenderer(getMainWindow(), 'account-init-loading', false);
        accountViewManager.hideAllViews();
    }, 1000);
});

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
let currentFileIndex = 1;

// ipcMain.on('send-article-data', async (event, article) => {
    
//     try {
//         const dataDir = path.join(process.cwd(), 'article_data');
//         console.log('dataDir', dataDir);
//         await fs.mkdir(dataDir, { recursive: true });
        
//         const currentFile = path.join(dataDir, `articles_${currentFileIndex}.json`);
        
//         // 检查当前文件是否存在及其大小
//         let fileExists = false;
//         try {
//             const stats = await fs.stat(currentFile);
//             fileExists = true;
            
//             // 如果文件大小超过100MB，增加文件索引
//             if (stats.size >= MAX_FILE_SIZE) {
//                 currentFileIndex++;
//             }
//         } catch (err) {
//             // 文件不存在，使用当前索引
//         }
        
//         const fileToWrite = path.join(dataDir, `articles_${currentFileIndex}.json`);
//         const articleData = JSON.stringify(article) + '\n';
        
//         // 追加写入数据
//         await fs.appendFile(fileToWrite, articleData, 'utf8');
//     } catch (error) {
//         console.error('保存文章数据时出错:', error);
//     }
// });

ipcMain.on('open-account-page', (event, accountId) => {
});

ipcMain.on('login-success', (event, data) => {
});

ipcMain.on('account-clicked', (event, account) => {
});

function getPlatformLoginUrl(platform: string): string {
    switch (platform) {
        case 'douyin':
            return 'https://login.douyin.com';
        case 'kuaishou':
            return 'https://login.kuaishou.com';
        case 'xiaohongshu':
            return 'https://www.xiaohongshu.com/explore';
        default:
            return '';
    }
}

// 远程控制相关的 IPC 处理器
export function initRemoteControlIpcHandlers(): void {
    // 初始化远程控制管理器
    const initRemoteControl = () => {
        if (!remoteControlManager) {
            remoteControlManager = new RemoteControlManager({
                signalServerUrl: process.env.SIGNAL_SERVER_URL || 'ws://localhost:8080',
                onError: (error) => {
                    Logger.error('远程控制错误:', error);
                },
                onConnectionStateChange: (state) => {
                    Logger.info('远程控制连接状态:', state);
                },
                onStarted: () => {
                    const mainWindow = getMainWindow();
                    if (mainWindow) {
                        sendToRenderer(mainWindow, 'remote-control:started', {});
                    }
                },
                onStopped: () => {
                    const mainWindow = getMainWindow();
                    if (mainWindow) {
                        sendToRenderer(mainWindow, 'remote-control:stopped', {});
                    }
                }
            });
        }
        return remoteControlManager;
    };

    // 启动远程控制
    ipcMain.handle('remote-control:start', async (event, config) => {
        try {
            const manager = initRemoteControl();
            await manager.startRemoteControl();
            return { success: true };
        } catch (error) {
            Logger.error('启动远程控制失败:', error);
            return { success: false, error: error.message };
        }
    });

    // 停止远程控制
    ipcMain.handle('remote-control:stop', async () => {
        try {
            if (remoteControlManager) {
                await remoteControlManager.stopRemoteControl();
            }
            return { success: true };
        } catch (error) {
            Logger.error('停止远程控制失败:', error);
            return { success: false, error: error.message };
        }
    });

    // 获取远程控制状态
    ipcMain.handle('remote-control:status', () => {
        try {
            return remoteControlManager?.getStatus() || { isActive: false, status: 'stopped' };
        } catch (error) {
            Logger.error('获取远程控制状态失败:', error);
            return { isActive: false, status: 'error' };
        }
    });

    // 执行鼠标操作
    ipcMain.handle('remote-control:mouse-action', async (event, action) => {
        try {
            if (remoteControlManager) {
                await remoteControlManager.executeMouseAction(action);
            }
            return { success: true };
        } catch (error) {
            Logger.error('执行鼠标操作失败:', error);
            return { success: false, error: error.message };
        }
    });

    // 获取当前鼠标位置
    ipcMain.handle('remote-control:mouse-position', async () => {
        try {
            if (remoteControlManager) {
                const position = await remoteControlManager.getCurrentMousePosition();
                return { success: true, position };
            }
            return { success: false, error: '远程控制未启动' };
        } catch (error) {
            Logger.error('获取鼠标位置失败:', error);
            return { success: false, error: error.message };
        }
    });

    // 处理来自渲染进程的鼠标事件（屏幕共享）
    ipcMain.handle('screen-share:mouse-event', async (event, mouseEvent) => {
        try {
            if (remoteControlManager) {
                // 直接通过远程控制管理器处理鼠标事件
                await remoteControlManager.executeMouseAction(mouseEvent);
                return { success: true };
            }
            return { success: false, error: '屏幕共享未启动' };
        } catch (error) {
            Logger.error('处理屏幕共享鼠标事件失败:', error);
            return { success: false, error: error.message };
        }
    });

    Logger.info('远程控制 IPC 处理器已初始化');
}

// 初始化远程控制 IPC 处理器
initRemoteControlIpcHandlers();
