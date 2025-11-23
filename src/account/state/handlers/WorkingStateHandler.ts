import { StateHandler } from ".";
import { updateAccountRendererItem } from '../../utils';
import { getMainWindow } from '../../../main';
import { ACCOUNT_STATUS, AccountStatus } from './accountStatus';
import { BrowserWindow } from 'electron';
import { XuanceModule } from "../../../types/xuance-module";

export class WorkingStateHandler implements StateHandler {
  handle(payload?: { accountId: string }) {
    Logger.info(XuanceModule.ACCOUNT.STATE.WORKING, payload?.accountId, '开始工作');
    // 启动任务
    // 监控任务状态
    updateAccountRendererItem(getMainWindow() as BrowserWindow, payload?.accountId, ACCOUNT_STATUS.WORKING as AccountStatus)
  }
} 