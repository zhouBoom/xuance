import { BrowserWindow } from 'electron';
import path from 'path';
import { envDataManager } from './envDataManager';
import { net } from 'electron';
import { XuanceModule } from '../types/xuance-module';
import { EnvConfig } from '../config/env';
import { appRestart } from '../utils/os';
class AccountLoginFlow {
    private loginWindow: BrowserWindow | null = null;
    public transformDataToArray(data: any) {
        const result: any[] = [];
        for (const platform in data) {
            for (const userId in data[platform]) {
                const userData = data[platform][userId];
                result.push({
                    platform,
                    user_id: userId,
                    nickname: userData.nickname,
                    desc: userData.desc,
                    gender: userData.gender,
                    images: userData.images,
                    imageb: userData.imageb,
                    guest: userData.guest,
                    red_id: userData.red_id
                });
            }
        }
        return result;
    }

    public async startLogin(platformUrl: string) {
        return new Promise((resolve, reject) => {
            this.openLoginWindow(platformUrl, resolve, reject);
        });
    }

    private openLoginWindow(platformUrl: string, resolve: (value: any) => void, reject: (reason?: any) => void) {
        this.loginWindow = new BrowserWindow({
            width: 600,
            height: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../preload.js'),
                partition: `persist:login_${Date.now()}`
            }
        });
        !EnvConfig.IS_SANDBOX && this.loginWindow.setMenu(null);

        this.loginWindow.loadURL(platformUrl);
        // this.loginWindow.webContents.openDevTools();
        let requestTimeout: NodeJS.Timeout | null = null;

        this.loginWindow.on('closed', () => {
            if (requestTimeout) {
                clearTimeout(requestTimeout);
            }
            reject('登录窗口已被关闭');
        });

        this.loginWindow.webContents.session.webRequest.onBeforeSendHeaders({ urls: ['*://edith.xiaohongshu.com/api/sns/web/v2/user/me'] }, (details, callback) => {
            // 检查自定义标志，避免重复处理
            if (details.requestHeaders['X-Custom-Flag'] === 'true') {
                callback({ cancel: false });
                return;
            }
            // 清除之前的定时器
            if (requestTimeout) {
                clearTimeout(requestTimeout);
            }
            // 设置新的定时器
            requestTimeout = setTimeout(() => {
                if (!this.loginWindow || this.loginWindow.isDestroyed()) {
                    console.error('Login window has been destroyed');
                    reject('Login window has been destroyed');
                    return;
                }

                const request = net.request({
                    method: details.method,
                    url: details.url,
                    session: this.loginWindow.webContents.session
                });

                // 添加请求头
                request.setHeader('User-Agent', details.requestHeaders['User-Agent']);
                Object.keys(details.requestHeaders).forEach(headerName => {
                    request.setHeader(headerName, details.requestHeaders[headerName]);
                });

                // 添加自定义标志，避免重复触发
                request.setHeader('X-Custom-Flag', 'true');
                // 检查请求体
                const uploadData = details.uploadData;
                if (uploadData && uploadData.length > 0) {
                    uploadData.forEach((data: any) => {
                        if (data.bytes) {
                            console.log('Request body:', data.bytes.toString());
                            request.write(data.bytes);
                        }
                    });
                }
                request.end();
                request.on('error', error => {
                    console.error('请求失败:', error);
                    reject(error);
                });
                request.on('response', response => {
                    let data = '';
                    response.on('data', chunk => {
                        data += chunk;
                    });

                    response.on('end', async () => {
                        try {
                            const jsonData = JSON.parse(data);
                            Logger.info(XuanceModule.ACCOUNT.LOGIN_SUCCESS, 'loginSuccess',jsonData);
                            if (jsonData.code === 0 && jsonData.data && jsonData.data.user_id && jsonData.data.nickname) {
                                const cookies = await this.loginWindow?.webContents.session.cookies.get({});
                                const localStorage = await this.loginWindow?.webContents.executeJavaScript('localStorage');
                                const sessionStorage = await this.loginWindow?.webContents.executeJavaScript('sessionStorage');
                                this.handleLoginSuccess(jsonData.data, cookies, localStorage, sessionStorage, resolve);
                            }
                        } catch (error) {
                            Logger.error(XuanceModule.ACCOUNT.LOGIN_FAILED, 'loginFailed',error);
                            reject(error);
                        }
                    });
                });
            }, 1000);

            callback({ cancel: false });
        });
    }

    private async handleLoginSuccess(accountData: any, cookies: any, localStorage: any, sessionStorage: any, resolve: (value: any) => void) {
        await envDataManager.deleteAllAccounts();
        // 保存 cookies
        await envDataManager.saveAccount('xiaohongshu', accountData);
        await envDataManager.savePlatformCookies('xiaohongshu', accountData.user_id, cookies);
        await envDataManager.savePlatformLocalStorage('xiaohongshu', accountData.user_id, localStorage);
        await envDataManager.savePlatformSessionStorage('xiaohongshu', accountData.user_id, sessionStorage);
        // 关闭登录窗口
        this.closeLoginWindow();
        resolve(accountData);
        appRestart();
    }

    private closeLoginWindow() {
        if (this.loginWindow) {
            const { session } = this.loginWindow.webContents;
            this.loginWindow.close();
            this.loginWindow = null;
            session.clearStorageData(); // 清理会话数据
        }
    }
}

export const accountLoginFlow = new AccountLoginFlow();
