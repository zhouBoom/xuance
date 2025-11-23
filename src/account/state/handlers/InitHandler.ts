import { BrowserView, BrowserWindow } from 'electron';
import { StateHandler } from '.';
import { accountViewManager } from '../../accountViewManager';
import { envDataManager } from '../../envDataManager';
import { initLoginStatusCheckScript } from '../../scripts/InitLoginChecker';
import { ACCOUNT_STATUS, AccountStatus } from './accountStatus';
import { updateAccountRendererItem } from '../../utils';
import { getMainWindow } from '../../../main';
import { XuanceModule } from '../../../types/xuance-module';
import { screenConfig } from '../../scripts/ScreenConfig';
import { FingerScript } from '../../scripts/Finger';
/**
 * 1.开启隐形的browserview
 * 2.注入初次的登录检测脚本
 * 3.显示渲染进程账号条目，并设置状态
 */
export class InitHandler implements StateHandler {
  private async loadUrlAndApplyCookies(view: BrowserView, accountId: string) {
    let cookies: any[] = await envDataManager.loadPlatformCookies('xiaohongshu', accountId);
    // console.log('apply cookies', cookies);
    envDataManager.applyCookiesToSession('https://www.xiaohongshu.com', cookies, view, accountId);
    view.webContents.loadURL('https://www.xiaohongshu.com/explore');
  }
  private async injectLoginCheckScript(view: BrowserView, accountId: string) {
    const script = initLoginStatusCheckScript(accountId);
    view.webContents.executeJavaScript(script);
    view.webContents.executeJavaScript(screenConfig)
  }
  private async injectFingerprintScript(view: BrowserView, accountId: string) {
    const script = await FingerScript(accountId);
    view.webContents.executeJavaScript(script);
  }
  async handle(payload: { accountId: string }) {
    Logger.info(XuanceModule.ACCOUNT.STATE.INIT, payload.accountId, 'InitHandler-handle-start', payload);
    const view = await accountViewManager.createInvisibleAccountView(payload.accountId);
    this.loadUrlAndApplyCookies(view, payload.accountId);
    Logger.info(XuanceModule.ACCOUNT.STATE.INIT, payload.accountId, 'InitHandler-handle-loadUrlAndApplyCookies-end', payload);
    const didFinishLoad = async () => {
      view.webContents.setBackgroundThrottling(false);
      Logger.info(XuanceModule.ACCOUNT.STATE.INIT, payload.accountId, 'InitHandler-handle-did-finish-load-start', payload);
      await this.injectLoginCheckScript(view, payload.accountId)
      Logger.info(XuanceModule.ACCOUNT.STATE.INIT, payload.accountId, 'InitHandler-handle-did-finish-load-end', payload);
      // await this.injectFingerprintScript(view, payload.accountId);
    }
    view.webContents.removeAllListeners('did-finish-load');
    view.webContents.on('did-finish-load', didFinishLoad)

    updateAccountRendererItem(getMainWindow() as BrowserWindow, payload.accountId, ACCOUNT_STATUS.INIT as AccountStatus)
    Logger.info(XuanceModule.ACCOUNT.STATE.INIT, payload.accountId, 'InitHandler-handle-updateAccountRendererItem-end', payload);
  }
} 