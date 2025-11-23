import { BrowserWindow } from 'electron';
import { AccountStatus } from './accountStatus';
import { BrowserView } from 'electron';
import { StateHandler } from '.';
import { accountViewManager } from '../../accountViewManager';
import { updateAccountRendererItem } from '../../utils';
import { ACCOUNT_STATUS } from './accountStatus';
import { getMainWindow } from '../../../main';
import { loginStatusFailChecker } from '../../scripts/LoginStatusFailChecker';
import { slideVerificationPopupDetection } from '../../scripts/SlideVerifyChecker';
import { envDataManager } from '../../envDataManager';
import { loginStateMachineManager } from '../LoginStateMachineManager';
import { LoginState } from '../LoginStateMachine';
import { createWsClient } from '../../../core/websocket';
import { sendToRenderer } from '../../ipc';
import { XuanceModule } from '../../../types/xuance-module';
import { screenConfig } from '../../scripts/ScreenConfig';
import { FingerScript } from '../../scripts/Finger';

export class IdleStateHandler implements StateHandler {
    private intervalIds: Map<string, NodeJS.Timeout> = new Map();
    private async injectIdleScript(view: BrowserView, accountId: string) {
        if (!accountId || !view) return;
        const verificationScript = slideVerificationPopupDetection(accountId);
        const loginStatusFailScript = loginStatusFailChecker(accountId);
        try {
            await view.webContents.executeJavaScript(verificationScript)
            await view.webContents.executeJavaScript(loginStatusFailScript)
            await view.webContents.executeJavaScript(screenConfig)
        } catch (err) {
            console.error('注入空闲脚本失败:', err);
        }
    }

    private async injectFingerprintScript(view: BrowserView, accountId: string) {
        const script = await FingerScript(accountId);
        view.webContents.executeJavaScript(script);
    }

    private async reloadAndReInjectWhenLoad(view: BrowserView, accountId: string) {
        // 拦截所有新窗口请求，强制在当前 view 中打开
        view.webContents.setWindowOpenHandler(({ url }) => {
            Logger.info(XuanceModule.ACCOUNT.STATE.IDLE, accountId, '准备加载新URL', url);
            // 在当前 view 中打开链接
            view && view.webContents.loadURL(url);
            return { action: 'deny' }; // 始终阻止创建新窗口
        });
        view.webContents.removeAllListeners('did-finish-load');
        view.webContents.on('did-finish-load', async () => {
            view.webContents.setBackgroundThrottling(false);
            Logger.info(XuanceModule.ACCOUNT.STATE.IDLE, accountId, 'did-finish-load');
            const machine = loginStateMachineManager.getMachine(accountId);
            if (machine?.getCurrentState(accountId) == LoginState.IDLE) {
                Logger.info(XuanceModule.ACCOUNT.STATE.IDLE, accountId, 'did-finish-load, 开始注入空闲脚本');
                this.injectIdleScript(view, accountId);
            }
        });
        this.injectFingerprintScript(view, accountId);
    }
    private async updateCookies(view: BrowserView, accountId: string) {
        if (!accountId || !view) return;

        try {
            if (this.intervalIds.has(accountId)) {
                clearInterval(this.intervalIds.get(accountId));
                this.intervalIds.delete(accountId);
            }

            const intervalId = setInterval(async () => {
                try {
                    const cookies = await view.webContents.session.cookies.get({});
                    const localStorage = await view.webContents.executeJavaScript('localStorage');
                    const sessionStorage = await view.webContents.executeJavaScript('sessionStorage');

                    await Promise.all([envDataManager.savePlatformCookies('xiaohongshu', accountId, cookies), envDataManager.savePlatformLocalStorage('xiaohongshu', accountId, localStorage), envDataManager.savePlatformSessionStorage('xiaohongshu', accountId, sessionStorage)]);
                } catch (err) {
                    Logger.error(XuanceModule.ACCOUNT.STATE.IDLE, accountId, '更新cookies失败:', err);
                    // 可能需要清理interval
                    clearInterval(intervalId);
                    this.intervalIds.delete(accountId);
                }
            }, 10 * 60 * 1000);

            this.intervalIds.set(accountId, intervalId);
        } catch (err) {
            Logger.error(XuanceModule.ACCOUNT.STATE.IDLE, accountId, '设置cookie更新定时器失败:', err);
        }
    }
    private async initWebSocket(accountId: string) {
        createWsClient((await envDataManager.loadAccount(accountId)).red_id as string);
    }
    async handle(payload: { accountId: string }) {
        Logger.info(XuanceModule.ACCOUNT.STATE.IDLE, payload.accountId, 'IdleStateHandler-handle-start', payload);
        const view = await accountViewManager.getView(payload.accountId);
        if (!view) {
            return;
        }
        this.injectIdleScript(view, payload.accountId);
        this.updateCookies(view, payload.accountId);
        updateAccountRendererItem(getMainWindow() as BrowserWindow, payload.accountId, ACCOUNT_STATUS.IDLE as AccountStatus);
        this.reloadAndReInjectWhenLoad(view, payload.accountId);
        this.initWebSocket(payload.accountId);
        accountViewManager.hideView(view);
        sendToRenderer(getMainWindow() as BrowserWindow, 'hide-view-title-by-id', {user_id: payload.accountId});
        Logger.info(XuanceModule.ACCOUNT.STATE.IDLE, payload.accountId, 'IdleStateHandler-handle-end', payload);
        view.webContents.loadURL('https://www.xiaohongshu.com/explore');
    }
}


