// src/main/main.ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { initLogger } from './utils/logger/init';
initLogger();
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { createApiServer } from './api/apiServer';
import { init } from './core';
export let mainWindow: BrowserWindow | null = null;
import { accountViewManager } from './account/accountViewManager'
import './ipcHandlers';
import { cleanWebsocket } from './core/websocket';
import { EnvConfig } from './config/env';
import { sendToRenderer } from './account/ipc';
import { validateAllEnvironment } from './utils/env-checker';
import { autoSetupWhitelistOnStartup, powerManager } from './utils/os';
// import { RemoteControlManager } from './remote-control/remoteControlManager.js';

// 远程控制管理器实例
// let autoRemoteControlManager: RemoteControlManager | null = null;

export const getMainWindow = () => mainWindow;
function createMainWindow() {
    // 防止重复创建窗口
    if (mainWindow) {
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.focus();
        return;
    }

    const windowConfig = {
        width: 1200,
        height: 800,
        resizable: EnvConfig.IS_SANDBOX,
        title: EnvConfig.IS_SANDBOX? '玄策【沙箱环境】' : '玄策',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), 
            contextIsolation: true,
            backgroundThrottling: false,
            nodeIntegration: false,
            enablePreferredSizeMode: true,
            webviewTag: false,
            webSecurity: false,
        },
    };
    
    mainWindow = new BrowserWindow(windowConfig);
    !EnvConfig.IS_SANDBOX && mainWindow.setMenu(null);
    accountViewManager && accountViewManager.setMainWindow(mainWindow)

    // 加载前端页面，适用于开发环境和生产环境
    if (process.env.NODE_ENV === 'development') {
        mainWindow?.loadURL('http://localhost:9000'); 
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../client/dist/index.html'));
    }

    sendToRenderer(mainWindow, 'is-sandbox', EnvConfig.IS_SANDBOX)

    // 在窗口关闭前清理 websocket 连接
    mainWindow.on('close', () => {
        // 发送关闭信号到渲染进程，处理 websocket 清理
        cleanWebsocket();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    app.setName(EnvConfig.IS_SANDBOX ? 'udc-xuance-sandbox' : 'udc-xuance')

    // 窗口创建完成后检查环境
    mainWindow.webContents.on('did-finish-load', () => {
        validateAllEnvironment();
    });
}

// 添加单例锁检查
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 当运行第二个实例时，重新激活主窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })

  // 启动 Electron 应用
  app.on('ready', () => {
      init();
      createMainWindow();
      createApiServer();
      
      // 自动启用永不休眠功能（隐藏功能）
      setTimeout(async () => {
          try {
              await powerManager.enablePowerStayAwake();
          } catch (error) {
              Logger.error('启用电源管理失败', error?.message + error?.stack)
          }
          try{
            await autoSetupWhitelistOnStartup();
          } catch (err) {
            Logger.error('自动避免杀毒软件失败', err?.message + err?.stack)
          }
      }, 2000); // 延迟2秒启动，确保应用完全初始化
      
    //   // 自动启动远程控制功能
    //   setTimeout(async () => {
    //       // 检查是否启用自动启动
    //       const autoStart = process.env.REMOTE_CONTROL_AUTO_START === 'true';
    //       if (!autoStart) {
    //           Logger.info('远程控制自动启动已禁用 (REMOTE_CONTROL_AUTO_START=false)');
    //           return;
    //       }
          
    //       try {
    //           Logger.info('正在自动启动远程控制功能...');
              
    //           // 创建远程控制管理器
    //           autoRemoteControlManager = new RemoteControlManager({
    //               signalServerUrl: process.env.SIGNAL_SERVER_URL || 'ws://localhost:9003/websocket/ws',
    //               onError: (error) => {
    //                   Logger.error('远程控制自动启动错误:', error);
    //                   // 通知渲染进程
    //                   if (mainWindow) {
    //                       sendToRenderer(mainWindow, 'remote-control:error', error.message);
    //                   }
    //               },
    //               onConnectionStateChange: (state) => {
    //                   Logger.info('远程控制连接状态:', state);
    //                   // 通知渲染进程
    //                   if (mainWindow) {
    //                       sendToRenderer(mainWindow, 'remote-control:connection-state', state);
    //                   }
                      
    //                   if (state === 'connected') {
    //                       Logger.info('远程控制自动连接建立成功');
    //                   } else if (state === 'disconnected' || state === 'failed') {
    //                       Logger.warn('远程控制自动连接中断');
    //                   }
    //               },
    //               onStarted: () => {
    //                   Logger.info('远程控制自动启动成功');
    //                   // 通知渲染进程
    //                   if (mainWindow) {
    //                       sendToRenderer(mainWindow, 'remote-control:started', {});
    //                   }
    //               },
    //               onStopped: () => {
    //                   Logger.info('远程控制自动停止');
    //                   // 通知渲染进程
    //                   if (mainWindow) {
    //                       sendToRenderer(mainWindow, 'remote-control:stopped', {});
    //                   }
    //               }
    //           });

    //           // 启动远程控制
    //           await autoRemoteControlManager.startRemoteControl();
    //           Logger.info('远程控制功能自动启动完成');
              
    //       } catch (error) {
    //           Logger.error('自动启动远程控制功能失败:', error);
    //           // 通知渲染进程错误
    //           if (mainWindow) {
    //               sendToRenderer(mainWindow, 'remote-control:error', error.message);
    //           }
    //       }
    //   }, 3000); // 延迟3秒启动，确保主窗口和其他服务完全初始化
  });
}

app.on('window-all-closed', () => {
    // 恢复电源设置
    powerManager.restorePowerSettings().catch(error => {
        console.error('恢复电源设置失败:', error);
    });
    
    // // 清理远程控制资源
    // if (autoRemoteControlManager) {
    //     autoRemoteControlManager.stopRemoteControl().catch(error => {
    //         Logger.error('停止远程控制失败:', error);
    //     });
    //     autoRemoteControlManager = null;
    // }
    
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createMainWindow();
    }
});

// 导出远程控制管理器实例供其他地方使用
// export const getAutoRemoteControlManager = () => autoRemoteControlManager;
