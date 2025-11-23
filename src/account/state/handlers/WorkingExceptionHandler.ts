import { BrowserWindow } from "electron";
import { updateAccountRendererItem } from "../../utils";
import { getMainWindow } from "../../../main";
import { StateHandler } from ".";
import { ACCOUNT_STATUS } from "./accountStatus";
import { AccountStatus } from "./accountStatus";
import { XuanceModule } from "../../../types/xuance-module";
import { apiRequest } from "../../../api/request";
import { envDataManager } from "../../envDataManager";
import { EnvConfig } from "../../../config/env";
import { reportException } from "../../../core/queue/send/simple";
export class WorkingExceptionHandler implements StateHandler {
  async handle(payload?: { accountId: string }) {
    Logger.info(XuanceModule.ACCOUNT.STATE.WORKING_EXCEPTION, payload?.accountId, '开始执行工作中异常处理，更新界面状态')
    try{
      const accountList = await envDataManager.loadAccountList();
      apiRequest.sendNotice(['211513'], `${EnvConfig.IS_SANDBOX? '沙箱环境' : '线上环境'}账号处于工作中异常状态，请赶紧处理，账号列表为${JSON.stringify(accountList || {})}，到毕方后台查一下是哪个业务方`);
      const account = await envDataManager.loadAccount(payload?.accountId);
      account && reportException(payload?.accountId, account.red_id, `检测到您的小红书账号${account.nickname}(${account.red_id!})需要滑动验证，请前往操作，否则无法执行任务`);
    } catch (error) {
      Logger.error(XuanceModule.ACCOUNT.STATE.WORKING_EXCEPTION, payload?.accountId, '发送通知失败', error?.message + error?.stack);
    }
    updateAccountRendererItem(getMainWindow() as BrowserWindow, payload!.accountId, ACCOUNT_STATUS.WORKING_EXCEPTION as AccountStatus)
  }
} 