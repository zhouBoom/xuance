import { BrowserWindow,  BrowserView } from 'electron';
import path from 'path';
import { envDataManager } from './envDataManager';
import { transformDataToArray } from './utils';
import { sendToRenderer } from './ipc';
import { getMainWindow } from '../main';
import { XuanceModule } from '../types/xuance-module';
import { fingerprintManager } from './fingerprintManager';

class AccountViewManager {
    private mainWindow: BrowserWindow | null = null;
    private views: Map<string, BrowserView> = new Map();

    public setMainWindow(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    public async openAccountPage(accountId: string) {
        if (!accountId) {
            return;
        }
        if (this.views.has(accountId)) {
            this.setActiveView(accountId);
            return;
        }

        const accounts = transformDataToArray(await envDataManager.loadAccountList());

        const account = accounts.find(acc => acc.user_id === accountId);
        if (!account) {
            console.error('Account not found');
            return;
        }

        const view = new BrowserView({
            webPreferences: {
                backgroundThrottling: false,
                enablePreferredSizeMode: false,
                webviewTag: false,
                webSecurity: false,
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload.js'),
                partition: `persist:account_${accountId}`
            }
        });

        // 获取并注入指纹伪装脚本
        await this.injectFingerprintSpoofScripts(accountId, view);

        this.views.set(accountId, view);
        if (this.mainWindow) {
            this.mainWindow.addBrowserView(view);
        }
        this.setActiveView(accountId);

        let cookies: any[] = await envDataManager.loadPlatformCookies('xiaohongshu', accountId);
        envDataManager.applyCookiesToSession('https://www.xiaohongshu.com', cookies, view, accountId);
        view.webContents.loadURL('https://www.xiaohongshu.com');
    }

    public async rebuildAccountPage(accountId: string = '123') {
        this.closeAccountPage(accountId);
        this.openAccountPage(accountId);
    }

    public async initAccountPage(accountId: string) {
        if (this.views.has(accountId)) {
            this.setActiveView(accountId);
            return;
        }

        const accounts = transformDataToArray(await envDataManager.loadAccountList());

        const account = accounts.find(acc => acc.user_id === accountId);
        if (!account) {
            Logger.error(XuanceModule.ACCOUNT.VIEW.INIT_ACCOUNT_PAGE, accountId, 'Account not found');
            return;
        }

        const view = new BrowserView({
            webPreferences: {
                backgroundThrottling: false,
                enablePreferredSizeMode: false,
                webviewTag: false,
                webSecurity: false,
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload.js'),
                partition: `persist:account_${accountId}`
            }
        });

        // 获取并注入指纹伪装脚本
        await this.injectFingerprintSpoofScripts(accountId, view);

        this.views.set(accountId, view);
        if (this.mainWindow) {
            const existingViews = this.mainWindow.getBrowserViews();
            if (!existingViews.includes(view)) {
                this.mainWindow.addBrowserView(view);
            }
        }
        this.setActiveView(accountId);
        this.hideAllViews();
        let cookies: any[] = await envDataManager.loadPlatformCookies('xiaohongshu', accountId);
        envDataManager.applyCookiesToSession('https://www.xiaohongshu.com', cookies, view, accountId);
        view.webContents.loadURL('https://www.xiaohongshu.com/explore');
    }

    public async createInvisibleAccountView(accountId: string): Promise<BrowserView> {
        if (this.views.has(accountId)) {
            this.closeAccountPage(accountId);
        }

        const account = await envDataManager.loadAccount(accountId)
        if (!account) {
            Logger.error(XuanceModule.ACCOUNT.VIEW.INIT_ACCOUNT_PAGE, accountId, 'Account not found');
            throw new Error('Account not found');
        }

        const view = new BrowserView({
            webPreferences: {
                backgroundThrottling: false,
                enablePreferredSizeMode: false,
                offscreen: false,
                webviewTag: false,
                webSecurity: false,
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload.js'),
                partition: `persist:account_${accountId}`
            }
        });

        // 获取并注入指纹伪装脚本
        await this.injectFingerprintSpoofScripts(accountId, view);

        this.views.set(accountId, view);
        if (this.mainWindow) {
            const existingViews = this.mainWindow.getBrowserViews();
            if (!existingViews.includes(view)) {
                this.mainWindow.addBrowserView(view);
            }
        }
        // view.setBounds({ x: 100, y: 40, width: 1000, height: 686 });
        // view.webContents.openDevTools();
        this.hideView(view);
        return view;
    }

    public setActiveView(accountId: string) {
        try{
            Logger.info(XuanceModule.ACCOUNT.VIEW.SET_ACTIVE_VIEW, accountId, 'setActiveView');
            const view = this.views.get(accountId);
            if (view) {
                // 隐藏其他视图但不影响其执行
                this.views.forEach((otherView, otherId) => {
                    if (otherId !== accountId) {
                        otherView.setBounds({ x: -10000, y: -10000, width: 800, height: 686 });
                    }
                });
                
                // 显示当前视图
                view.setBounds({ x: 365, y: 50, width: 800, height: 686 });
                this.mainWindow?.setTopBrowserView(view);
                view.webContents.invalidate();
                // view.setAutoResize({ width: true, height: true });
            } else {
                Logger.warn(XuanceModule.ACCOUNT.VIEW.SET_ACTIVE_VIEW, accountId, '视图不存在，尝试初始化');
                // 视图不存在时，尝试初始化
                // 这里使用 setTimeout 是为了避免同步调用导致的递归问题
                setTimeout(async () => {
                    try {
                        await this.initAccountPage(accountId);
                        Logger.info(XuanceModule.ACCOUNT.VIEW.SET_ACTIVE_VIEW, accountId, '视图初始化成功，正在设置为活跃');
                    } catch (err) {
                        Logger.error(XuanceModule.ACCOUNT.VIEW.SET_ACTIVE_VIEW, accountId, '视图初始化失败', err);
                    }
                }, 0);
            }
        } catch(e) {
            Logger.error(XuanceModule.ACCOUNT.VIEW.SET_ACTIVE_VIEW, accountId, 'setActiveView-error', e.message);
        }
    }

    public hideView(view: BrowserView) {
        if (this.mainWindow) {
            view.setBounds({ x: -10000, y: -10000, width: 800, height: 686 });
        }
    }

    public hideAllViews() {
        this.views.forEach((view) => {
            if (this.mainWindow) {
                // 将视图移到屏幕外，而不是改变其尺寸
                view.setBounds({ 
                    x: -10000,  // 移到屏幕外
                    y: -10000,  // 移到屏幕外
                    width: 800, // 保持原有尺寸
                    height: 686 // 保持原有保持原有尺寸
                });
            }
        });
        sendToRenderer(getMainWindow() as BrowserWindow, 'open-account-view', {});
    }

    /**
     * 注入指纹伪装脚本到浏览器视图
     * @param accountId 账户ID
     * @param view 浏览器视图
     */
    private async injectFingerprintSpoofScripts(accountId: string, view: BrowserView) {
        try {
            // 获取账户的指纹
            const fingerprint = await fingerprintManager.getOrCreateFingerprint(accountId);
            
            // 设置用户代理
            view.webContents.session.setUserAgent(fingerprint.userAgent, fingerprint.language || 'en-US');
            
            // 获取 Canvas 指纹伪装脚本
            const canvasSpoofScript = await fingerprintManager.getCanvasSpoofScript(accountId);
            if (canvasSpoofScript) {
                view.webContents.once('dom-ready', () => {
                    view.webContents.executeJavaScript(canvasSpoofScript);
                });
            }
            
            // 获取 WebGL 指纹伪装脚本
            const webglSpoofScript = await fingerprintManager.getWebglSpoofScript(accountId);
            if (webglSpoofScript) {
                view.webContents.once('dom-ready', () => {
                    view.webContents.executeJavaScript(webglSpoofScript);
                });
            }
        } catch (error) {
            console.error(`Failed to inject fingerprint spoof scripts for account ${accountId}:`, error);
        }
    }

    public showView(accountId: string) {
        const view = this.views.get(accountId);
        if (view && this.mainWindow) {
            // 显示指定视图，其他视图移到屏幕外
            this.views.forEach((otherView, otherId) => {
                if (otherId === accountId) {
                    otherView.setBounds({ x: 365, y: 40, width: 800, height: 686 });
                    
                } else {
                    otherView.setBounds({ x: -10000, y: -10000, width: 800, height: 686 });
                }
            });
            view.setAutoResize({ width: true, height: true });
            setTimeout(() => {
                view.webContents.openDevTools();
            }, 3000);
        }
    }

    public getView(accountId: string): BrowserView | undefined {
        return this.views.get(accountId);
    }

    public closeAccountPage(accountId: string) {
        const view = this.views.get(accountId);
        if (view && this.mainWindow) {
            // 在关闭前确保停止所有相关任务
            view.webContents.close(); // 关闭webContents
            this.mainWindow.removeBrowserView(view);
            this.views.delete(accountId);
        }
    }

    public getAllViews(): BrowserView[] {
        return Array.from(this.views.values());
    }

    public async notifyBrowserViews(isWorking: boolean) {
        const views = this.getAllViews();
        for (const view of views) {
            sendToRenderer(view, 'task-control', {type: isWorking ? 'resume' : 'pause'});
        }
    }
    public hideViewByAccountId(accountId: string) {
        const view = this.views.get(accountId);
        if (view && this.mainWindow) {
            this.hideView(view);
            sendToRenderer(getMainWindow() as BrowserWindow, 'hide-view-title-by-id', {user_id: accountId});
        }
    }
    public getViewByAccountId(accountId: string): BrowserView | undefined {
        return this.views.get(accountId);
    }

    public removeView(accountId: string) {
        const targetView = this.getViewByAccountId(accountId);
        if(this.mainWindow && targetView){
            targetView?.webContents?.close();
            this.mainWindow?.removeBrowserView(targetView);
            Logger.info(XuanceModule.ACCOUNT.VIEW.REMOVE_VIEW, accountId, 'removeView');
        }
        this.views.delete(accountId);
    }
    public openDebugByAccountId(accountId: string) {
        const view = this.views.get(accountId);
        if (view && this.mainWindow) {
            view.webContents.openDevTools();
        }
    }
    public async closeAllViews() {
        const views = this.getAllViews();
        for (const view of views) {
            view.webContents.close();
        }
        this.views.clear();
    }
}

export const accountViewManager = new AccountViewManager();
