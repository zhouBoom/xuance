import { BrowserWindow, BrowserView, ipcMain } from 'electron';
import { dispatch, getStateMachine } from './state';
import { LoginState } from './state/LoginStateMachine';
import { accountLoginFlow } from './accountLoginFlow';
import { accountViewManager } from './accountViewManager';
import { envDataManager } from './envDataManager';
import { getMainWindow } from '../main';
import { reportException } from '../core/queue/send/simple';
import { XuanceModule } from '../types/xuance-module';
import { receivePreRouter } from '../core/router/receivePre';

// 存储渲染进程状态
let isRendererReady = false;
const messageQueue: Array<{mainWindow: BrowserWindow | BrowserView, channel: string, data: any}> = [];

// 处理渲染进程ready信号
ipcMain.on('renderer-ready', () => {
    Logger.info(XuanceModule.ACCOUNT.IPC.ON.RENDERER_READY, '', 'renderer-ready');
    isRendererReady = true;
    // 发送队列中的消息
    while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        if (msg) {
            msg.mainWindow.webContents.send(msg.channel, msg.data);
        }
    }
});

// 封装发送消息的函数
export const sendToRenderer = (mainWindow: BrowserView | BrowserWindow, channel: string, data: any) => {
    if (!isRendererReady) {
        messageQueue.push({ mainWindow, channel, data });
        return;
    }
    Logger.info(XuanceModule.ACCOUNT.IPC.SEND, '', 'sendToRenderer', channel);
    mainWindow!.webContents.send(channel, data);
};

ipcMain.on('init-login-success', async (event, accountId) => {
    Logger.info(XuanceModule.ACCOUNT.IPC.ON.INIT_LOGIN_SUCCESS, accountId, 'init-login-success');
    dispatch(accountId, LoginState.IDLE, {accountId});
});

ipcMain.on('init-login-failed', async (event, accountId) => {
    Logger.info(XuanceModule.ACCOUNT.IPC.ON.INIT_LOGIN_FAILED, accountId, 'init-login-failed');
    dispatch(accountId, LoginState.NOT_LOGINED, {accountId});
});

ipcMain.on('click-account-item', async (_event, accountId) => {
    Logger.info(XuanceModule.ACCOUNT.IPC.ON.CLICK_ACCOUNT_ITEM, accountId, 'clicked-account-item');
    
    const stateMachine = getStateMachine(accountId);
    switch(stateMachine?.getCurrentState(accountId)){
        case LoginState.IDLE:
            accountViewManager.setActiveView(accountId);
            sendToRenderer(getMainWindow() as BrowserWindow, 'open-account-view',await envDataManager.loadAccount(accountId));
            break;
        case LoginState.WORKING:
            accountViewManager.setActiveView(accountId);
            sendToRenderer(getMainWindow() as BrowserWindow, 'open-account-view',await envDataManager.loadAccount(accountId));
        case LoginState.INIT:
            break;
        case LoginState.WORKING_EXCEPTION:
        case LoginState.IDLE_EXCEPTION:
            accountViewManager.setActiveView(accountId);
            sendToRenderer(getMainWindow() as BrowserWindow, 'open-account-view',await envDataManager.loadAccount(accountId));
            break;
        case LoginState.NOT_LOGINED:
            try{
                await accountLoginFlow.startLogin('https://www.xiaohongshu.com/explore');
                await dispatch(accountId, LoginState.INIT, {accountId});
                setTimeout(async () => {
                    sendToRenderer(getMainWindow(), 'account-init-loading', true);
                    accountViewManager.setActiveView(accountId);
                    await new Promise(r => setTimeout(r, 1000))
                    accountViewManager.setActiveView(accountId);
                    await new Promise(r => setTimeout(r, 1000))
                    sendToRenderer(getMainWindow(), 'account-init-loading', false);
                    accountViewManager.hideAllViews();
                }, 3000);
            } catch (error) {
                Logger.error(XuanceModule.ACCOUNT.IPC.ON.CLICK_ACCOUNT_ITEM, accountId, 'start login failed', error);
            }

            break;
    }
});

ipcMain.on('click-add-account-button',async (_event, accountId) => {
    try{
        Logger.info(XuanceModule.ACCOUNT.IPC.ON.CLICK_ADD_ACCOUNT_BUTTON, accountId, 'click-add-account-button');
        const accountData:any = await accountLoginFlow.startLogin('https://www.xiaohongshu.com/explore');
        Logger.info(XuanceModule.ACCOUNT.IPC.ON.CLICK_ADD_ACCOUNT_BUTTON, accountId, 'click-add-account-button-startLogin-end', accountData);
        accountData && dispatch(accountData.user_id, LoginState.INIT, {accountId: accountData?.user_id});
    } catch (error) {
        Logger.error(XuanceModule.ACCOUNT.IPC.ON.CLICK_ADD_ACCOUNT_BUTTON, accountId, 'start login failed', error);
    }
});

ipcMain.on('update-cookies', (event, data) => {
});

ipcMain.on('open-debug', (event, accountId) => {
    Logger.info(XuanceModule.ACCOUNT.IPC.ON.OPEN_DEBUG, accountId, 'open-debug');
    accountViewManager.openDebugByAccountId(accountId);
});

ipcMain.on('login-status-change-to-failed', async (event, accountId) => {
    Logger.info(XuanceModule.ACCOUNT.IPC.ON.LOGIN_STATUS_CHANGE_TO_FAILED, accountId, 'login-status-change-to-failed');
    
    try {
        accountViewManager.hideViewByAccountId(accountId);
        // 1. 先处理状态和异常报告
        const account = await envDataManager.loadAccount(accountId);
        const stateMachine = getStateMachine(accountId);
        
        if (stateMachine?.getCurrentState(accountId) === LoginState.IDLE) {
            reportException(accountId, account.red_id!, `检测到您的小红书账号${account.nickname}(${account.red_id!})处于离线状态，请前往登录，否则无法执行任务`);
        } else if (stateMachine?.getCurrentState(accountId) === LoginState.WORKING) {
            reportException(accountId, account.red_id!, `检测到您的小红书账号${account.nickname}(${account.red_id!})处于离线状态，目前的任务已中止，请前往登录，为执行后续新的任务做好准备`);
        }
        // 2. 更新状态机状态
        await dispatch(accountId, LoginState.NOT_LOGINED, {accountId});
    } catch (error) {
        Logger.error(XuanceModule.ACCOUNT.IPC.ON.LOGIN_STATUS_CHANGE_TO_FAILED, accountId, 'load account failed', error);
        // 即使出错也要确保状态更新和视图移除
        dispatch(accountId, LoginState.NOT_LOGINED, {accountId});
    }
});

ipcMain.on('slide-verification-popup-detected', async(event, accountId) => {
    Logger.info(XuanceModule.ACCOUNT.IPC.ON.SLIDE_VERIFICATION_POPUP_DETECTED, accountId, 'slide-verification-popup-detected');
    const stateMachine = getStateMachine(accountId);
    if(stateMachine?.getCurrentState(accountId) === LoginState.IDLE){
        Logger.info(XuanceModule.ACCOUNT.IPC.ON.SLIDE_VERIFICATION_POPUP_DETECTED, accountId, 'slide-verification-popup-detected-idle -> idle-exception');
        dispatch(accountId, LoginState.IDLE_EXCEPTION, {accountId});
    } else if(stateMachine?.getCurrentState(accountId) === LoginState.WORKING){
        Logger.info(XuanceModule.ACCOUNT.IPC.ON.SLIDE_VERIFICATION_POPUP_DETECTED, accountId, 'slide-verification-popup-detected-working -> working-exception');
        dispatch(accountId, LoginState.WORKING_EXCEPTION, {accountId});
        await accountViewManager.notifyBrowserViews(false);
    }
    try{
        const account = await envDataManager.loadAccount(accountId);
        account &&reportException(accountId, account.red_id, `检测到您的小红书账号${account.nickname}(${account.red_id!})需要滑动验证，请前往操作，否则无法执行任务`);
    } catch (error) {
        Logger.error(XuanceModule.ACCOUNT.IPC.ON.SLIDE_VERIFICATION_POPUP_DETECTED, accountId, 'load account failed', error);
    }

});

ipcMain.on('slide-verification-popup-hidden', async (event, accountId) => {
    Logger.info(XuanceModule.ACCOUNT.IPC.ON.SLIDE_VERIFICATION_POPUP_HIDDEN, accountId, 'slide-verification-popup-hidden');
    const stateMachine = getStateMachine(accountId);
    if(stateMachine?.getCurrentState(accountId) === LoginState.IDLE_EXCEPTION){
        Logger.info(XuanceModule.ACCOUNT.IPC.ON.SLIDE_VERIFICATION_POPUP_HIDDEN, accountId, 'slide-verification-popup-hidden-idle-exception -> idle');
        dispatch(accountId, LoginState.IDLE, {accountId});
    } else if(stateMachine?.getCurrentState(accountId) === LoginState.WORKING_EXCEPTION){
        Logger.info(XuanceModule.ACCOUNT.IPC.ON.SLIDE_VERIFICATION_POPUP_HIDDEN, accountId, 'slide-verification-popup-hidden-working-exception -> working');
        dispatch(accountId, LoginState.WORKING, {accountId});
        await accountViewManager.notifyBrowserViews(true);
    }
});

ipcMain.on('hide-account-view', (event) => {
    Logger.info(XuanceModule.ACCOUNT.IPC.ON.HIDE_ACCOUNT_VIEW, '', 'hide-all-account-view');
    accountViewManager.hideAllViews();
});

ipcMain.on('renderer-log', (event, data) => {
    Logger.info(XuanceModule.ACCOUNT.IPC.ON.RENDERER_LOG, data.accountId, 'renderer-log', data);
});


