import { Message } from '../../types';
import { collectArticle, ArticleTaskInfo, ArticleTaskPayload } from './collect-article';
import { collectComment, CommentTaskInfo, CommentTaskPayload } from './collect-comment';
import { dispatch, getStateMachine } from '../../account/state';
import { LoginState } from '../../account/state/LoginStateMachine';

import { reportTaskExeFailed, reportTaskExeSuccess } from '../../core/queue/send/simple';
import { XuanceModule } from '../../types/xuance-module';
import { 
    ArticleTaskInteractionPayload,
    ArticleTaskInfo as ArticleTaskInteractionInfo,
    collectArticleInteraction
} from './collect-article-interaction';

export const processMessage = async (message: Message) => {
    const stateMachine = getStateMachine(message.account_id);
    if (!stateMachine) {
        reportTaskExeFailed(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, `未找到客户端 ${message.account_id} 的状态机`, '');
        Logger.error(XuanceModule.HANDLER.DISPATCH.COMMON, message.account_id, `processMessage:未找到客户端 ${message.account_id} 的状态机`);
        return;
    }

    // 只有在 IDLE 状态才处理消息
    if (stateMachine.getCurrentState(message.account_id) !== LoginState.IDLE) {
        reportTaskExeFailed(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, `客户端 ${message.account_id} 当前状态不是 IDLE`, '');
        Logger.warn(XuanceModule.HANDLER.DISPATCH.COMMON, message.account_id, `processMessage:客户端 ${message.account_id} 当前状态不是 IDLE`);
        return;
    }

    const isRiskTime = (hours: number) => {
        return ;
    }

    // 风控时间为23点～早上8点
    // const now = new Date();
    // const hours = now.getHours();
    // if (hours >= 23 || hours < 8) {
    //     reportTaskExeFailed(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, `当前时间不在工作时间 ${hours}`, '');
    //     Logger.warn(XuanceModule.HANDLER.DISPATCH.COMMON, message.account_id, `processMessage:当前时间不在工作时间 ${hours}`);
    //     // return;
    // }

    try {
        switch (message.command) {
            case 'collect_article':
                if (!('rule_id' in message.payload)) {
                    Logger.error(XuanceModule.HANDLER.DISPATCH.COLLECT_ARTICLE, message.account_id, 'processMessage:无效的 collect_article payload: 缺少 rule_id');
                    reportTaskExeFailed(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, '无效的 collect_article payload: 缺少 rule_id', '');
                    return;
                }
                const taskInfo: ArticleTaskInfo = {
                    red_id: message.payload.user_id,
                    account_id: message.account_id,
                    task_id:message.payload.rule_id,
                    command:message.command,
                    device_id:message.device_id,
                    trace_id:message.trace_id,
                    penetrate:message.penetrate,
                    timestamp:message.timestamp,
                    payload: message.payload as ArticleTaskPayload
                }
                await dispatch(message.account_id, LoginState.WORKING, {accountId:message.account_id});
                try{
                    await collectArticle(taskInfo);
                    reportTaskExeSuccess(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, '', '');
                } catch (error: unknown) {
                    reportTaskExeFailed(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, (error as Error).message, '');
                    Logger.error(XuanceModule.HANDLER.DISPATCH.COLLECT_ARTICLE, message.account_id, `processMessage:collectArticle error:`, error);
                }
                return;
            case 'collect_comment':
                if (!('rule_id' in message.payload)) {
                    Logger.error(XuanceModule.HANDLER.DISPATCH.COLLECT_COMMENT, message.account_id, 'processMessage:无效的 collect_comment payload: 缺少 rule_id');
                    reportTaskExeFailed(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, '无效的 collect_comment payload: 缺少 rule_id', '');
                    return;
                }
                const commentTask: CommentTaskInfo = {
                    red_id: message.payload.user_id,
                    account_id: message.account_id,
                    task_id:message.payload.rule_id,
                    command:message.command,
                    device_id:message.device_id,
                    trace_id:message.trace_id,
                    penetrate:message.penetrate,
                    timestamp:message.timestamp,
                    payload: message.payload as CommentTaskPayload
                }
                await dispatch(message.account_id, LoginState.WORKING, {accountId:message.account_id});
                try{
                    await collectComment(commentTask);
                    reportTaskExeSuccess(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, '', '');
                } catch (error: unknown) {
                    reportTaskExeFailed(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, (error as Error).message, '');
                    Logger.error(XuanceModule.HANDLER.DISPATCH.COLLECT_COMMENT, message.account_id, `processMessage:collectComment error:`, error);
                }
                return;
            // 添加其他消息类型的处理...
            case 'get_article_reading':
                {
                    if (!('rule_id' in message.payload)) {
                        Logger.error(XuanceModule.HANDLER.DISPATCH.COLLECT_ARTICLE, message.account_id, 'processMessage:无效的 get_article_reading payload: 缺少 rule_id');
                        reportTaskExeFailed(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, '无效的 get_article_reading payload: 缺少 rule_id', '');
                        return;
                    }
                    
                    // 确保使用正确的类型
                    const payload = message.payload as ArticleTaskInteractionPayload;
                    
                    const taskInfo: ArticleTaskInteractionInfo = {
                        red_id: payload.user_id,
                        account_id: message.account_id,
                        task_id: payload.rule_id,
                        command: message.command,
                        device_id: message.device_id,
                        trace_id: message.trace_id,
                        penetrate: message.penetrate,
                        timestamp: message.timestamp,
                        payload: payload
                    }
                    await dispatch(message.account_id, LoginState.WORKING, {accountId: message.account_id});
                    try {
                        await collectArticleInteraction(taskInfo);
                        reportTaskExeSuccess(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, '', '');
                    } catch (error: unknown) {
                        reportTaskExeFailed(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, (error as Error).message, '');
                        Logger.error(XuanceModule.HANDLER.DISPATCH.COLLECT_ARTICLE, message.account_id, `processMessage:collectArticleInteraction error:`, error);
                    }
                }
                
            break;
                
            default:
                Logger.warn(XuanceModule.HANDLER.DISPATCH.COMMON, message.account_id, `processMessage:未知的消息类型: ${message.command}`);
        }
    } catch (error) {
        Logger.error(XuanceModule.HANDLER.DISPATCH.COMMON, message.account_id, 'processMessage:处理消息失败:', error);
    }
}; 