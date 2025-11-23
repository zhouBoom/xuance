import { BrowserWindow, Display, ipcMain } from "electron";
import { sendToRenderer } from "../account/ipc";
import { getMainWindow } from "../main";
import { networkChecker } from "../utils/net-checker";
import { monitorSystemChanges } from "../utils/os";

export const initGlobalEvent = () => {
    networkChecker.on('network-status-change', (isOnline) => {
        console.log('network-status-change', isOnline);
        sendToRenderer(getMainWindow() as BrowserWindow, 'network-status-change', isOnline);
    });

    monitorSystemChanges({
        onSuspend: () => {
            Logger.info('系统挂起');
        },
        onResume: () => {
            Logger.info('系统恢复');
        },
        onLock: () => {
            Logger.info('系统锁屏');
        },
        onUnlock: () => {
            Logger.info('系统解锁');
        },
        onShutdown: () => {
            Logger.info('系统关机');
        },
        onAcConnected: () => {
            Logger.info('接通电源');
        },
        onAcDisconnected: () => {
            Logger.info('断开电源');
        },
        onDisplayAdded: (display: Display) => {
            Logger.info('新显示器连接', display);
        },
        onDisplayRemoved: () => {
            Logger.info('显示器断开');
        },
        onDisplayMetricsChanged: () => {
            Logger.info('显示器设置变化');
        },
        onDisplaySleepState: () => {
            Logger.info('显示器休眠状态变化');
        },  
        
    });
}   