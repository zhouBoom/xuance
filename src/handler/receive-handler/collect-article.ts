import { BrowserView, ipcMain } from 'electron';
import { accountViewManager } from '../../account/accountViewManager';
import { LoginState } from '../../account/state/LoginStateMachine';
import { loginStateMachineManager } from '../../account/state/LoginStateMachineManager';
import { dispatch } from '../../account/state';
import { getTaskId } from '../../utils/utils';
import { getUserAndKeywordScript } from '../../plugins/hook/collect-article/userAndKeyword';
import { getOnlyKeywordScript } from '../../plugins/hook/collect-article/onlyKeyword';
import { slideVerificationPopupDetection } from '../../account/scripts/SlideVerifyChecker';
import { interceptLoginStatus } from '../../account/scripts/LoginStatusFailChecker';
import fs from 'fs';
import path from 'path';
import { XuanceModule } from '../../types/xuance-module';
import { screenConfig } from '../../account/scripts/ScreenConfig';
import { FingerScript } from '../../account/scripts/Finger';
import { reportTaskExeFailed, reportTaskExeSuccessNow } from '../../core/queue/send/simple';
let isSetListener = false

// 定义任务超时时间（毫秒）
const TASK_TIMEOUT = 28 * 60 * 1000; 

// Add at the top of the file with other imports
const accountSubTasksMap = new Map<string, {
    subTasks: SubTask[],
    currentIndex: number
}>();

// 在文件顶部添加一个全局缓存，用于存储每个账号对应的任务信息
const accountArticleTaskInfoMap = new Map<string, ArticleTaskInfo>();

// 添加任务超时计时器Map
const accountTimeoutMap = new Map<string, NodeJS.Timeout>();

// 定义任务相关的数据结构
export interface ArticleTaskPayload {
    user_id: string;
    rule_id: string;
    rule_name: string;
    author_ids: string[];
    keywords: string[];
    limit: number;
    comments: number;
    ai_prompt: string;
    publish_time: number;
    likes: number;
    rate: number;
}

export interface ArticleTaskInfo {
    account_id: string;
    red_id: string;
    task_id: string;
    command: string;
    device_id: string;
    trace_id: string;
    penetrate: string;
    timestamp: number;
    payload: ArticleTaskPayload;
}

// 定义子任务类型
type SubTaskType = 'author_and_keyword' | 'only_author' | 'only_keyword';

export interface SubTask {
    id: string;
    account_id: string;
    limit: number;
    likes: number;
    retry_count: number;
    publish_time: number;
    red_id: string;
    parent_id: string;
    type: SubTaskType;
    keywords?: string[];
    keyword?: string;
    comments?: number;
    ai_prompt?: string;
    authorId?: string;
    success: boolean;
    error: string;
    index?: number;
    script?: string;
}

function writeLog(message: string) {
    const logDir = path.join(__dirname, '../../../logs');
    const logFile = path.join(logDir, 'subtask-scripts.log');
    
    // 确保日志目录存在
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    // 写入日志
    const logMessage = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(logFile, logMessage);
}   

/**
 * 根据payload判断子任务类型
 */
function deriveTaskType(payload: ArticleTaskPayload): SubTaskType {
    const hasAuthors = payload.author_ids && payload.author_ids.length > 0;
    const hasKeywords = payload.keywords && payload.keywords.length > 0;
    if (hasAuthors && hasKeywords) return 'author_and_keyword';
    if (hasAuthors) return 'only_author';
    if (hasKeywords) return 'only_keyword';
    throw new Error('Invalid payload: neither author_ids nor keywords provided');
}

/**
 * 创建子任务列表
 */
function createSubTasks(taskInfo: ArticleTaskInfo): SubTask[] {
    const payload = taskInfo.payload;
    const taskType = deriveTaskType(payload);
    const parent_id = payload.rule_id;
    const account_id = taskInfo.account_id;
    const red_id = taskInfo.red_id;
    switch (taskType) {
        case 'author_and_keyword': {
            return payload.author_ids.map((authorId: string, index: number) => {
                const subTaskInfo: SubTask = {
                    id: getTaskId(),
                    account_id,
                    limit: 0,
                    likes: payload.likes,
                    retry_count: 0,
                    publish_time: payload.publish_time,
                    red_id,
                    parent_id,
                    type: taskType,
                    keywords: payload.keywords,
                    authorId,
                    comments: payload.comments,
                    ai_prompt: payload.ai_prompt,
                    index,
                    success: false,
                    error: ''
                };
                return {
                    ...subTaskInfo,
                    script: getUserAndKeywordScript(subTaskInfo)
                };
            });
        }
        case 'only_author': {
            return payload.author_ids.map(
                (authorId: string, index: number) =>{
                   const subTaskInfo = ({
                        id: getTaskId(),
                        account_id,
                        limit: 0,
                        retry_count: 0,
                        likes: payload.likes,
                        publish_time: payload.publish_time,
                        red_id,
                        parent_id,
                        keywords: [''],
                        type: taskType,
                        comments: payload.comments,
                        ai_prompt: payload.ai_prompt,
                        authorId,
                        index,
                        success: false,
                        error: ''
                    } as SubTask)
                    return {
                        ...subTaskInfo,
                        script: getUserAndKeywordScript(subTaskInfo)
                    }
                }
                    
            );
        }
        case 'only_keyword': {
            return payload.keywords.map(
                (keyword: string, index: number) =>{
                    const subTaskInfo = ({
                        id: getTaskId(),
                        account_id,
                        red_id,
                        retry_count: 0,
                        limit: 200,
                        likes: payload.likes,
                        publish_time: payload.publish_time,
                        parent_id,
                        type: taskType,
                        keywords: [keyword],
                        keyword,
                        comments: payload.comments,
                        ai_prompt: payload.ai_prompt,
                        success: false,
                        error: '',
                        index
                    } as SubTask)
                    return {
                        ...subTaskInfo,
                        script: getOnlyKeywordScript(subTaskInfo)
                    }
                }
            );
        }
    }
}

/**
 * 获取子任务的对外接口
 */
function getSubTasks(taskInfo: ArticleTaskInfo): SubTask[] {
    return createSubTasks(taskInfo);
}

/**
 * 处理任务完成逻辑
 */
function handleTaskCompletion(accountId: string, isTimeout: boolean = false) {
    // 清除超时定时器
    if (accountTimeoutMap.has(accountId)) {
        clearTimeout(accountTimeoutMap.get(accountId));
        accountTimeoutMap.delete(accountId);
    }

    // 获取任务信息
    const currentTaskInfo = accountArticleTaskInfoMap.get(accountId);
    if (!currentTaskInfo) {
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleTaskCompletion:未找到账号对应的任务信息');
        return;
    }

    const view = accountViewManager.getView(accountId);
    if (!view) {
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleTaskCompletion:未找到账号对应的视图');
        return;
    }

    // 记录任务完成原因
    if (isTimeout) {
        Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleTaskCompletion:任务执行超时,自动完成');
    } else {
        Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleTaskCompletion:所有子任务执行完毕');
    }

    // 切换到空闲状态
    dispatch(accountId, LoginState.IDLE, {accountId});
    
    // 加载首页
    view.webContents.loadURL('https://www.xiaohongshu.com/explore').catch(err => {
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleTaskCompletion:loadURL失败', err);
    }).then(() => {
        Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, '任务完成，切换到idle状态，loadURL成功');
    });
    
    // 上报任务成功
    reportTaskExeSuccessNow(
        currentTaskInfo.account_id, 
        currentTaskInfo.red_id, 
        currentTaskInfo.penetrate, 
        currentTaskInfo.trace_id, 
        currentTaskInfo.command, 
        isTimeout ? '任务执行超时，自动完成' : '', 
        ''
    );
    
    // 清理资源
    accountArticleTaskInfoMap.delete(accountId);
    accountSubTasksMap.delete(accountId);
}

/**
 * 页面加载完成时的处理逻辑
 */
async function handleFinishLoad(view: BrowserView, subTasks: SubTask[], currentSubTaskIndex: number, accountId: string) {
    Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleFinishLoad:开始执行');
    const machine = loginStateMachineManager.getMachine(accountId);
    try {
        if (!machine) {
            Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, `handleFinishLoad:No login state machine found for account ${accountId}`);
            return;
        }

        if (machine.getCurrentState(accountId) === LoginState.WORKING || machine.getCurrentState(accountId) === LoginState.WORKING_EXCEPTION) {
            const subTask = subTasks[currentSubTaskIndex];
            subTask.retry_count = subTask.retry_count + 1;
            const accountTasks = accountSubTasksMap.get(accountId);
            if (accountTasks) {
                accountTasks.subTasks[currentSubTaskIndex] = subTask;
                accountSubTasksMap.set(accountId, accountTasks);
            }
            Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, `handleFinishLoad:retry_count: ${subTask.retry_count}`);
            Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleFinishLoad:excuting subTask：', {
                ...subTask,
                script: subTask?.script?.substring(0, 100) + '...'
            });
            if (subTask?.script) {
                // 添加详细的错误处理和日志
                Promise.all([
                    view.webContents.executeJavaScript(subTask.script)
                        .catch((err: Error) => {
                            Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleFinishLoad:执行子任务脚本失败:', {
                                taskIndex: currentSubTaskIndex,
                                error: err.message,
                                script: subTask?.script?.substring(0, 100) + '...' // 只记录脚本开头部分
                            });
                            throw err;
                        }),
                    view.webContents.executeJavaScript(interceptLoginStatus(accountId))
                        .catch((err: Error) => {
                            Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleFinishLoad:执行登录状态拦截脚本失败:', {
                                accountId,
                                error: err.message
                            });
                            throw err;
                        }),
                    view.webContents.executeJavaScript(slideVerificationPopupDetection(accountId))
                        .catch((err: Error) => {
                            Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleFinishLoad:执行滑动验证检测脚本失败:', {
                                accountId,
                                error: err.message
                            });
                            throw err;
                        }),
                    view.webContents.executeJavaScript(screenConfig).catch((err: Error) => {
                        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleFinishLoad:执行屏幕配置脚本失败:', {
                            accountId,
                            error: err.message
                        });
                        throw err;
                    }),
                    view.webContents.executeJavaScript(await FingerScript(accountId)).catch((err: Error) => {
                        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleFinishLoad:执行指纹脚本失败:', {
                            accountId,
                            error: err.message
                        });
                        throw err;
                    })
                ]).catch(err => {
                    Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleFinishLoad:脚本执行过程中发生错误:', err);
                });
            } else {
                Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, `handleFinishLoad:无效的子任务或脚本缺失，索引: ${currentSubTaskIndex}`);
            }
        }else{
            Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleFinishLoad:当前状态不是working或working_exception');
        }
    }catch(err) {
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, accountId, 'handleFinishLoad:执行过程中发生错误', err);
    }
}

/**
 * 主函数：根据accountId和taskInfo执行采集任务
 */
export const collectArticle = async (taskInfo: ArticleTaskInfo): Promise<boolean> => {
    // 深拷贝任务信息
    const taskInfoCopy = JSON.parse(JSON.stringify(taskInfo));
    
    // 将当前任务信息存储到全局Map中，以账号ID为键
    accountArticleTaskInfoMap.set(taskInfoCopy.account_id, taskInfoCopy);
    
    Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, taskInfoCopy.account_id, 'collectArticle-taskInfo:', taskInfoCopy);
    const subTasks = getSubTasks(taskInfoCopy);
    accountSubTasksMap.set(taskInfoCopy.account_id, {
        subTasks,
        currentIndex: 0
    });
    const view = accountViewManager.getView(taskInfoCopy.account_id);
    if (!view || !subTasks.length) {
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, taskInfoCopy.account_id, 'collectArticle:ipc-receive-handler:view或subTasks为空');
        return false;
    };
    
    // 设置任务超时处理
    if (accountTimeoutMap.has(taskInfoCopy.account_id)) {
        clearTimeout(accountTimeoutMap.get(taskInfoCopy.account_id));
    }
    
    // 创建新的超时定时器
    const timeout = setTimeout(() => {
        // 检查任务是否仍在进行中
        if (accountArticleTaskInfoMap.has(taskInfoCopy.account_id)) {
            Logger.warn(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, taskInfoCopy.account_id, `任务执行超时(${TASK_TIMEOUT}ms)，自动完成`);
            handleTaskCompletion(taskInfoCopy.account_id, true);
        }
    }, TASK_TIMEOUT);
    
    // 存储超时定时器
    accountTimeoutMap.set(taskInfoCopy.account_id, timeout);
    
    // 先移除本模块曾添加的ipc监听，使用局部监听而不是removeAllListeners
    // ipcMain.removeAllListeners('collect-article-task-status');

    // 定义完成加载时的回调函数
    // 在添加监听器前，尝试移除之前可能存在的同名监听器（防止重复绑定）
    view.webContents.removeAllListeners('did-finish-load');
    view.webContents.on('did-finish-load', async () => {
        const url = view.webContents.getURL() || '位置URL';
        Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, taskInfoCopy.account_id, '进入did-finish-load', url);
        // 如果当前页面路径是滑动验证页面，就不执行
        if(url.includes('web-login/captcha')){
            Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, taskInfoCopy.account_id, '当前页面是滑动验证页面，不执行');
            Logger.info(XuanceModule.ACCOUNT.IPC.ON.SLIDE_VERIFICATION_POPUP_DETECTED, taskInfoCopy.account_id, 'slide-verification-popup-detected-working -> working-exception');
            dispatch(taskInfoCopy.account_id, LoginState.WORKING_EXCEPTION, {accountId:taskInfoCopy.account_id});
            await accountViewManager.notifyBrowserViews(false);
            return;
        }
        view.webContents.setBackgroundThrottling(false);
        handleFinishLoad(view, subTasks, accountSubTasksMap.get(taskInfoCopy.account_id)?.currentIndex || 0, taskInfoCopy.account_id);
    });

    const collectStatusCallback = async (
        event: any,
        data: {
            accountId: string;
            index: number;
            subTaskInfo: SubTask;
            success: boolean;
            error?: string;
            response?: string;
        }
    ) => {
        // 在回调函数中，获取当前账号对应的最新任务信息
        const currentTaskInfo = accountArticleTaskInfoMap.get(data.accountId);
        if (!currentTaskInfo) {
            Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, data.accountId, 'collectArticle:ipc-receive-handler:未找到账号对应的任务信息');
            return;
        }

        try{
            const accountTasks = accountSubTasksMap.get(data.accountId);
            const view = accountViewManager.getView(data.accountId);
            Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, data.accountId, '进入ipc:collectArticle', accountTasks);
            if (!accountTasks) {
                Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, data.accountId, 'collectArticle:ipc-receive-handler:No tasks found for account');
                return;
            }
            const { subTasks } = accountTasks;

            const { success, error, index } = data;
            if (!success && error) {
                Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, data.accountId, `collectArticle:ipc-receive-handler:SubTask failed at index ${index}: ${error}`);
            }

            if(index === undefined) {
                Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, data.accountId, 'collectArticle:ipc-receive-handler:SubTask failed at index undefined');
                return;
            };

            // 所有子任务执行完毕
            if ((success || subTasks[index].retry_count >= 3) && index === subTasks.length - 1) {
                Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, data.accountId, 'collectArticle:ipc-receive-handler:所有子任务执行完毕,切换到idle状态', {
                    success,
                    retry_count: subTasks[index].retry_count,
                    index: index,
                    subTasksLength: subTasks.length
                });
                
                // 处理任务完成
                handleTaskCompletion(data.accountId);
                return;
            }

            // 准备下一个子任务执行
            if ((subTasks[index] && subTasks[index].retry_count >= 3) || success) {
                accountSubTasksMap.set(data.accountId, {
                    subTasks,
                    currentIndex: index + 1
                });
            } else {
                Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, data.accountId, `collectArticle:ipc-receive-handler:SubTask failed at index ${index}: ${error}, retry_count: ${subTasks[index].retry_count}, next retry_count: ${subTasks[index].retry_count + 1}`);
            }
            Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, data.accountId, '即将loadURL：https://www.xiaohongshu.com/explore')
            view.webContents.loadURL('https://www.xiaohongshu.com/explore').catch(err => {
                Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, data.accountId, 'collectArticle:ipc-receive-handler:loadURL失败', err);
            }).then(() => {
                Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, data.accountId, 'collectArticle:ipc-receive-handler:loadURL成功');
            });
        }catch(err) {
            Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, data.accountId, 'collectArticle:ipc-receive-handler:执行过程中发生错误', err.message);
            
            // 使用当前任务信息上报失败
            if (currentTaskInfo) {
                reportTaskExeFailed(
                    currentTaskInfo.account_id, 
                    currentTaskInfo.red_id, 
                    currentTaskInfo.penetrate, 
                    currentTaskInfo.trace_id, 
                    currentTaskInfo.command, 
                    err.message, 
                    ''
                );
                
                // 清理超时定时器
                if (accountTimeoutMap.has(data.accountId)) {
                    clearTimeout(accountTimeoutMap.get(data.accountId));
                    accountTimeoutMap.delete(data.accountId);
                }
                
                // 清理任务信息
                accountArticleTaskInfoMap.delete(data.accountId);
            }
        }
    }
    // 监听任务状态变化
    // 同理，为防止重复绑定，先移除同名监听器（如果你确保不存在重复可以省略这步）
    if(!isSetListener){
        ipcMain.on('collect-article-task-status', collectStatusCallback);
        isSetListener = true;
    }
    // 开始任务，加载初始页面
    view.webContents.loadURL('https://www.xiaohongshu.com/explore').catch(err => {
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_ARTICLE, taskInfoCopy.account_id, 'collectArticle:ipc-receive-handler:loadURL失败', err);
    });
    return true;
};
