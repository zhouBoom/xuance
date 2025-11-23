import { XuanceModule } from '../types/xuance-module';
import { AccountRendererItem, transformDataToArray } from './utils';

interface Account {
    user_id: string;
    nickname: string;
    desc: string;
    gender: string;
    images: string[];
    imageb: string;
    guest: boolean;
    red_id: string;
}
export interface CookieData {
    [key: string]: any;
}

interface LocalStorageData {
    [key: string]: any;
}

interface SessionStorageData {
    [key: string]: any;
}

class EnvDataManager {
    private store: any;
    private isInitSuccess: boolean = false;
    private initPromise: Promise<void>;

    constructor() {
        this.initPromise = this.init();
    }

    private async init() {
        try {
            Logger.info(XuanceModule.ACCOUNT.ENV.INIT_STORE, '', 'init store-start');
            const Store = (await import('electron-store')).default;
            this.store = new Store({
                name: 'account-cookies',
                encryptionKey: 'e4d909c290d0fb1ca068ffaddf22cbd0' // 建议使用环境变量，这里我随便写了一个
            });
            Logger.info(XuanceModule.ACCOUNT.ENV.INIT_STORE, '', 'init store-end', this.store);
            this.isInitSuccess = true;
        } catch (error) {
            Logger.error(XuanceModule.ACCOUNT.ENV.INIT_STORE, '', 'init store-error', error);
        }
    }

    async ensureStoreReady() {
        if (!this.isInitSuccess) {
            await this.initPromise; // 等待初始化完成
        }
    }

    async savePlatformCookies(platform: string, userid: string, cookieData: any) {
        await this.ensureStoreReady();
        await this.store.set(`cookies.${platform}.${userid}`, cookieData);
        // Logger.info(XuanceModule.ACCOUNT.ENV.SAVE_COOKIES, userid, 'save cookies', cookieData);
    }

    async savePlatformLocalStorage(platform: string, userid: string, localStorageData: any) {
        await this.ensureStoreReady();
        await this.store.set(`localStorage.${platform}.${userid}`, localStorageData);
    }

    async savePlatformSessionStorage(platform: string, userid: string, sessionStorageData: any) {
        await this.ensureStoreReady();
        await this.store.set(`sessionStorage.${platform}.${userid}`, sessionStorageData);
    }

    async saveAccount(platform: string, account: Account) {
        try {
            await this.ensureStoreReady();
            await this.store.set(`account.${platform}.${account.user_id}`, account);
            const result = await this.loadAccountList();
            Logger.info(XuanceModule.ACCOUNT.ENV.SAVE_ACCOUNT, account.user_id, 'save_account', result);
        } catch (error) {
            Logger.error(XuanceModule.ACCOUNT.ENV.SAVE_ACCOUNT, account.user_id, 'save_account-error', error);
        }
    }

    async saveFingerprint(accountId: string, fingerprint: any) {
        await this.ensureStoreReady();
        await this.store.set(`fingerprint.${accountId}`, fingerprint);
    }

    async loadFingerprint(accountId: string): Promise<any> {
        await this.ensureStoreReady();
        return this.store.get(`fingerprint.${accountId}`, {}) as any;
    }

    async deleteAllAccounts() {
        await this.ensureStoreReady();
        try {
            await this.store.clear();
            Logger.info(XuanceModule.ACCOUNT.ENV.DELETE_ALL_ACCOUNT, '', 'delete all accounts-success');
        } catch (error) {
            Logger.error(XuanceModule.ACCOUNT.ENV.DELETE_ALL_ACCOUNT, '', 'delete all accounts-error', error);
        }
    }

    async loadPlatformCookies(platform: string, userid: string): Promise<CookieData[]> {
        await this.ensureStoreReady();
        return this.store.get(`cookies.${platform}.${userid}`, []) as CookieData[];
    }

    async loadPlatformLocalStorage(platform: string, userid: string): Promise<LocalStorageData> {
        await this.ensureStoreReady();
        return this.store.get(`localStorage.${platform}.${userid}`, {}) as LocalStorageData;
    }

    async loadPlatformSessionStorage(platform: string, userid: string): Promise<SessionStorageData> {
        await this.ensureStoreReady();
        return this.store.get(`sessionStorage.${platform}.${userid}`, {}) as SessionStorageData;
    }

    async loadAccountList(): Promise<Account[]> {
        await this.ensureStoreReady();
        Logger.info(XuanceModule.ACCOUNT.ENV.LOAD_ACCOUNT_LIST, '', 'loadAccountList-start', this.store);
        try {
            return this.store.get('account', []) as Account[];
        } catch (error) {
            Logger.error(XuanceModule.ACCOUNT.ENV.LOAD_ACCOUNT_LIST, '', 'loadAccountList-error', error);
            return [];
        }
    }

    async loadAccount(accountId: string): Promise<AccountRendererItem> {
        await this.ensureStoreReady();
        const resultList = transformDataToArray(await this.store.get('account', []));
        const item = resultList.find(item => item.user_id === accountId);
        return item as AccountRendererItem;
    }

    async loadAccountByRedId(redId: string): Promise<AccountRendererItem> {
        await this.ensureStoreReady();
        const resultList = transformDataToArray(await this.store.get('account', []));
        const item = resultList.find(item => item.red_id === redId);
        return item as AccountRendererItem;
    }

    async applyCookiesToSession(platformUrl: string, cookies: CookieData[], browserView: Electron.BrowserView, accountId: string) {
        await this.ensureStoreReady();
        const ses = browserView.webContents.session;
        const homeHost = new URL(platformUrl).origin;
        for (const cookie of cookies) {
            try {
                if (cookie.domain && !homeHost.includes(cookie.domain)) {
                    Logger.warn(XuanceModule.ACCOUNT.ENV.APPLY_COOKIE_TO_SESSION, accountId, 'applyCookiesToSession-skip-cookie', {cookie, homeHost});
                    continue;
                }
                await ses.cookies.set({
                    url: homeHost,
                    ...cookie
                });
            } catch (error) {
                Logger.error(XuanceModule.ACCOUNT.ENV.APPLY_COOKIE_TO_SESSION, accountId, 'applyCookiesToSession-set-cookie-error', {cookie, error});
            }
        }
    }
}

export const envDataManager = new EnvDataManager();
