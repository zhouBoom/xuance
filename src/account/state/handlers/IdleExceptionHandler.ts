import { BrowserView, BrowserWindow } from "electron";
import { StateHandler } from ".";
import { getMainWindow } from "../../../main";
import { updateAccountRendererItem } from "../../utils";
import { accountViewManager } from "../../accountViewManager";
import { ACCOUNT_STATUS, AccountStatus} from "./accountStatus";
import { XuanceModule } from "../../../types/xuance-module";
import { loginStatusFailChecker } from "../../scripts/LoginStatusFailChecker";
import { slideVerificationPopupDetection } from "../../scripts/SlideVerifyChecker";
import { screenConfig } from "../../scripts/ScreenConfig";
import { envDataManager } from "../../envDataManager";
import { apiRequest } from "../../../api/request";
import { EnvConfig } from "../../../config/env";
import { reportException } from "../../../core/queue/send/simple";
export class IdleExceptionHandler implements StateHandler {
    private async injectIdleExceptionScript(view: BrowserView, accountId: string) {
      if (!accountId || !view) return;
      const verificationScript = slideVerificationPopupDetection(accountId);
      const loginStatusFailScript = loginStatusFailChecker(accountId);
      try {
          await view.webContents.executeJavaScript(verificationScript)
          await view.webContents.executeJavaScript(loginStatusFailScript)
          await view.webContents.executeJavaScript(screenConfig)
      } catch (err) {
          console.error('注入空闲异常脚本失败:', err);
      }
    }
    async handle(payload: { accountId: string }) {
      const view = await accountViewManager.getView(payload.accountId);
      if(!view) {
          Logger.error(XuanceModule.ACCOUNT.STATE.IDLE_EXCEPTION, payload.accountId, 'view-not-found');
          return
      }
      try{
        const accountList = await envDataManager.loadAccountList();
        apiRequest.sendNotice(['211513'], `${EnvConfig.IS_SANDBOX? '沙箱环境' : '线上环境'}账号处于空闲异常状态，请赶紧处理，账号列表为${JSON.stringify(accountList || {})}，到毕方后台查一下是哪个业务方`);
        const account = await envDataManager.loadAccount(payload?.accountId);
        account && reportException(payload?.accountId, account.red_id, `检测到您的小红书账号${account.nickname}(${account.red_id!})需要滑动验证，请前往操作，否则无法执行任务`);
      } catch (error) {
        Logger.error(XuanceModule.ACCOUNT.STATE.IDLE_EXCEPTION, payload?.accountId, '发送通知失败', error?.message + error?.stack);
      }
      Logger.info(XuanceModule.ACCOUNT.STATE.IDLE_EXCEPTION, payload!.accountId, '开始执行空闲异常处理，更新界面状态')
      view.webContents.removeAllListeners('did-finish-load');
      view.webContents.on('did-finish-load', async () => {
        view.webContents.setBackgroundThrottling(false);
        Logger.info(XuanceModule.ACCOUNT.STATE.IDLE_EXCEPTION, payload!.accountId, 'did-finish-load');
        this.injectIdleExceptionScript(view, payload!.accountId);
        view.webContents.removeAllListeners('did-finish-load');
      })
      updateAccountRendererItem(getMainWindow() as BrowserWindow, payload.accountId, ACCOUNT_STATUS.IDLE_EXCEPTION as AccountStatus)
    }  
}