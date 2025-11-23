import { BrowserWindow } from 'electron';
import { AccountStatus } from './accountStatus';
import { StateHandler } from '.';
import { updateAccountRendererItem } from '../../utils';
import { accountViewManager } from '../../accountViewManager';
import { getMainWindow } from '../../../main';
import { ACCOUNT_STATUS } from './accountStatus';
import { removeClient } from '../../../core/websocket';
import { apiRequest } from '../../../api/request';
import { envDataManager } from '../../envDataManager';
import { XuanceModule } from '../../../types/xuance-module';
import { EnvConfig } from '../../../config/env';

export class NotLoginedStateHandler implements StateHandler {
    async handle(payload: { accountId: string }) {
        const view = await accountViewManager.getView(payload.accountId);
        if(!view) {
            return
        }
        try{
            const accountList = await envDataManager.loadAccountList();
            apiRequest.sendNotice(['211513'], `${EnvConfig.IS_SANDBOX? '沙箱环境' : '线上环境'}账号ID${payload?.accountId}未登录，请赶紧处理，到毕方后台查一下是哪个业务方和小红书号，账号列表为${JSON.stringify(accountList || {})}`);
        } catch (error) {
            Logger.error(XuanceModule.ACCOUNT.STATE.NOT_LOGINED, payload?.accountId, '发送通知失败', error?.message + error?.stack);
        }
        updateAccountRendererItem(getMainWindow() as BrowserWindow, payload.accountId, ACCOUNT_STATUS.OFFLINE as AccountStatus)
        removeClient(payload.accountId);
        accountViewManager.removeView(payload.accountId);
    }
} 

