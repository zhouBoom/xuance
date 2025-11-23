import { transformDataToArray } from './utils';
import { envDataManager } from './envDataManager';
import { createStateMachine, dispatch } from './state';
import { LoginState } from './state/LoginStateMachine';
import { XuanceModule } from '../types/xuance-module';
import { accountViewManager } from './accountViewManager';
import { sendToRenderer } from './ipc';
import { getMainWindow } from '../main';
import schedule from 'node-schedule';
import { RecurrenceRule } from 'node-schedule';
import { app } from 'electron';

const checkAccountList = async (accountList: any[]) => {
    sendToRenderer(getMainWindow(), 'account-init-loading', true);
    
    try {
        // 确保所有账户视图都已创建
        const createViewsPromises = accountList.map(async (account) => {
            try {
                // 检查视图是否已存在
                if (!accountViewManager.getView(account.user_id)) {
                    // 如果不存在，则初始化账户视图
                    await accountViewManager.initAccountPage(account.user_id);
                    // 等待视图加载完成
                    await new Promise(r => setTimeout(r, 2000));
                }
                return account.user_id;
            } catch (error) {
                Logger.error(XuanceModule.ACCOUNT.INIT, account.user_id, '初始化视图失败', error);
                return null;
            }
        });
        
        // 等待所有视图创建完成
        const createdIds = await Promise.all(createViewsPromises);
        const validIds = createdIds.filter(id => id !== null);
        
        // 设置活跃视图
        for (const userId of validIds) {
            try {
                if (accountViewManager.getView(userId)) {
                    accountViewManager.setActiveView(userId);
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (error) {
                Logger.error(XuanceModule.ACCOUNT.INIT, userId, '设置活跃视图失败', error);
            }
        }
    } catch (error) {
        Logger.error(XuanceModule.ACCOUNT.INIT, '', '账户列表检查失败', error);
    } finally {
        // 无论如何都隐藏所有视图并结束加载
        accountViewManager.hideAllViews();
        sendToRenderer(getMainWindow(), 'account-init-loading', false);
    }
}

export const initAccountList = async () => {
    const init = async () => {
        try {
            let accountList = transformDataToArray(await envDataManager.loadAccountList());
            Logger.info(XuanceModule.ACCOUNT.INIT, '', 'initAccountList-start', accountList);
            
            if(accountList.length > 1) {
                await envDataManager.deleteAllAccounts();
                accountList = [];
            }
            // 先创建所有账户的状态机
            for (let i = 0; i < accountList.length; i++) {
                const account = accountList[i];
                if (!account.user_id) continue;
                createStateMachine(account.user_id);
                dispatch(account.user_id, LoginState.INIT, { accountId: account.user_id });
            }

            // 增加延迟，确保状态机完全初始化
            Logger.info(XuanceModule.ACCOUNT.INIT, '', '等待状态机初始化完成');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // 再检查账户列表并初始化视图
            await checkAccountList(accountList);
            
            Logger.info(XuanceModule.ACCOUNT.INIT, '', 'initAccountList-完成');
        } catch (error) {
            Logger.error(XuanceModule.ACCOUNT.INIT, '', 'initAccountList-失败', error);
        }
    }

    const scheduleRelaunch = () => {
        try {
            // 设置每日定时任务
            const rule = new RecurrenceRule();
            rule.hour = 7;
            rule.minute = 20;
            rule.tz = 'Asia/Shanghai';
    
            schedule.scheduleJob(rule, async () => {
                Logger.info(XuanceModule.ACCOUNT.INIT, '', 'Daily account initialization at 7AM Beijing time');
                // 不再执行初始化函数，而是直接重启应用
                Logger.info(XuanceModule.ACCOUNT.INIT, '', '重启应用程序以确保所有组件正常运行');
                app.relaunch();
                app.exit(0);
            });
        } catch (error) {
            Logger.error(XuanceModule.ACCOUNT.INIT, '', 'Daily account initialization at 7AM Beijing time', error.message);
        }
    }

    // 应用启动时执行初始化
    init();
    scheduleRelaunch();
}
