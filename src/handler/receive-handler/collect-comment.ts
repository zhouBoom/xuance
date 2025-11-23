import { BrowserView, ipcMain } from 'electron';
import { dispatch } from '../../account/state'; // 分发状态
import { getTaskId } from '../../utils/utils'; // 获取任务id
import { accountViewManager } from '../../account/accountViewManager'; // 获取渲染进程的view
import { LoginState } from '../../account/state/LoginStateMachine'; // 获取登录状态
import { loginStateMachineManager } from '../../account/state/LoginStateMachineManager'; // 获取登录状态机
import { slideVerificationPopupDetection } from '../../account/scripts/SlideVerifyChecker'; // 滑动验证检测
import { interceptLoginStatus } from '../../account/scripts/LoginStatusFailChecker'; // 登录状态拦截
import { getAuthorCommentScript } from '../../plugins/hook/collect-comment/authorComment'; // 获取作者评论脚本
import { XuanceModule } from '../../types/xuance-module'; // 模块类型
import { screenConfig } from '../../account/scripts/ScreenConfig'; // 屏幕配置
import { FingerScript } from '../../account/scripts/Finger'; // 指纹脚本
import { reportTaskExeFailed, reportTaskExeSuccessNow } from '../../core/queue/send/simple'; // 添加任务状态上报函数


// 定义任务超时时间（毫秒）
const TASK_TIMEOUT = 13 * 60 * 1000; // 13分钟

type SubTaskType = 'only_author';

// 定义任务相关的数据结构
export interface CommentTaskPayload {
  user_id: string;
  rule_id: string;
  rule_name: string;
  author_ids: string[];
  limit: number;
}

export interface CommentTaskInfo {
  account_id: string; // 账号id
  red_id: string;
  task_id: string;
  command: string;
  device_id: string;
  trace_id: string;
  penetrate: string;
  timestamp: number;
  payload: CommentTaskPayload;
}

// 定义子任务类型

export interface SubTask {
  id: string;
  account_id: string; // 账号id
  red_id: string; // 用户id
  parent_id: string; // 策略id
  type: SubTaskType;
  limit: number; // 限制数量
  retry_count: number; // 重试次数
  authorId?: string; // 小红书用户
  success: boolean; // 是否成功
  error: string; // 错误信息
  index?: number; // 索引
  script?: string; // 脚本
  trace_id: string;
  penetrate: string;
}

let isSetListener = false // 是否设置监听器
// 存储每个账号的子任务列表和当前执行的子任务索引
const accountSubTasksMap = new Map<string, {
    subTasks: SubTask[],
    currentIndex: number
}>();

// 添加全局任务信息Map，存储每个账号对应的任务信息
const accountCommentTaskInfoMap = new Map<string, CommentTaskInfo>();

// 添加任务超时计时器Map
const accountTimeoutMap = new Map<string, NodeJS.Timeout>();

/**
 * 根据payload判断子任务类型
 */
function deriveTaskType(payload: CommentTaskPayload): SubTaskType {
  const hasAuthors = payload.author_ids && payload.author_ids.length > 0;
  if (hasAuthors) return 'only_author';
  throw new Error('Invalid payload: neither author_ids nor keywords provided');
}

/**
 * 创建子任务列表
 */
function createSubTasks(taskInfo: CommentTaskInfo): SubTask[] {
  const payload = taskInfo.payload;
  const taskType = deriveTaskType(payload);
  const parent_id = payload.rule_id;
  const account_id = taskInfo.account_id;
  const red_id = taskInfo.red_id;
  const trace_id = taskInfo.trace_id;
  const penetrate = taskInfo.penetrate;
  switch (taskType) {
    case 'only_author': {
      return payload.author_ids.map(
        (authorId: string, index: number) =>{
          const subTaskInfo = ({
            id: getTaskId(),
            index,
            red_id,
            parent_id,
            type: taskType,
            account_id,
            limit: 0,
            retry_count: 0,
            authorId,
            success: false,
            error: '',
            trace_id,
            penetrate
          } as SubTask)
          return {
          ...subTaskInfo,
          script: getAuthorCommentScript(subTaskInfo)
          }
        }
      );
    }
  }
}

/**
 * 获取子任务
 */
function getSubTasks(taskInfo: CommentTaskInfo): SubTask[] {
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
  const currentTaskInfo = accountCommentTaskInfoMap.get(accountId);
  if (!currentTaskInfo) {
    Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleTaskCompletion:未找到账号对应的任务信息');
    return;
  }

  const view = accountViewManager.getView(accountId);
  if (!view) {
    Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleTaskCompletion:未找到账号对应的视图');
    return;
  }

  // 记录任务完成原因
  if (isTimeout) {
    Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleTaskCompletion:任务执行超时,自动完成');
  } else {
    Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleTaskCompletion:所有子任务执行完毕');
  }

  // 切换到空闲状态
  dispatch(accountId, LoginState.IDLE, {accountId});
  
  // 加载首页
  view.webContents.loadURL('https://www.xiaohongshu.com/explore').catch(err => {
    Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleTaskCompletion:loadURL失败', err);
  }).then(() => {
    Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, '任务完成，切换到idle状态，loadURL成功');
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
  accountCommentTaskInfoMap.delete(accountId);
  accountSubTasksMap.delete(accountId);
}

/**
 * 页面加载完成时的处理逻辑
 */
async function handleFinishLoad(view: BrowserView, subTasks: SubTask[], currentSubTaskIndex: number, accountId: string) {
  Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleFinishLoad:开始执行');
  // 获取登录状态机
  const machine = loginStateMachineManager.getMachine(accountId);
  try {
    if (!machine) {
      Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, `handleFinishLoad:No login state machine found for account ${accountId}`);
        return;
      }
      // 判断当前状态是否是工作中或者工作中异常
      if (machine.getCurrentState(accountId) === LoginState.WORKING || machine.getCurrentState(accountId) === LoginState.WORKING_EXCEPTION) {
        // 获取当前子任务
        const subTask = subTasks[currentSubTaskIndex];
        // 重试次数加1
        subTask.retry_count = subTask.retry_count + 1;
        const accountTasks = accountSubTasksMap.get(accountId);
        if (accountTasks) {
          accountTasks.subTasks[currentSubTaskIndex] = subTask;
          accountSubTasksMap.set(accountId, accountTasks);
        }
        Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, `handleFinishLoad:retry_count: ${subTask.retry_count}`);
        Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleFinishLoad:excuting subTask：', {
          ...subTask,
          script: subTask?.script?.substring(0, 100) + '...'
        });
        if (subTask?.script) {
          // 添加详细的错误处理和日志
          Promise.all([
            view.webContents.executeJavaScript(subTask.script)
              .catch((err: Error) => {
                Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleFinishLoad:执行子任务脚本失败:', {
                  taskIndex: currentSubTaskIndex,
                  error: err.message,
                  script: subTask?.script?.substring(0, 100) + '...' // 只记录脚本开头部分
                });
                throw err;
              }),
            view.webContents.executeJavaScript(interceptLoginStatus(accountId))
              .catch((err: Error) => {
                Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleFinishLoad:执行登录状态拦截脚本失败:', {
                  accountId,
                  error: err.message
                });
                throw err;
            }),
            view.webContents.executeJavaScript(slideVerificationPopupDetection(accountId))
              .catch((err: Error) => {
                Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleFinishLoad:执行滑动验证检测脚本失败:', {
                  accountId,
                  error: err.message
                });
                throw err;
              }),
                  
            view.webContents.executeJavaScript(screenConfig).catch((err: Error) => {
              Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleFinishLoad:执行屏幕配置脚本失败:', {
                accountId,
                error: err.message
              });
              throw err;
            }),
            view.webContents.executeJavaScript(await FingerScript(accountId)).catch((err: Error) => {
              Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleFinishLoad:执行指纹脚本失败:', {
                accountId,
                error: err.message
              });
              throw err;
            })
            ]).catch(err => {
              Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleFinishLoad:脚本执行过程中发生错误:', err);
            });
          } else {
            Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, `handleFinishLoad:无效的子任务或脚本缺失，索引: ${currentSubTaskIndex}`);
          }
    }else{
      Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleFinishLoad:当前状态不是working或working_exception');
    }
  }catch(err) {
    Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, accountId, 'handleFinishLoad:执行过程中发生错误', err);
  }
}

/**
 * 主函数：根据accountId和taskInfo执行采集任务
 */
export const collectComment = async (taskInfo: CommentTaskInfo): Promise<boolean> => {
  // 深拷贝任务信息
  const taskInfoCopy = JSON.parse(JSON.stringify(taskInfo));
  
  // 将当前任务信息存储到全局Map中，以账号ID为键
  accountCommentTaskInfoMap.set(taskInfoCopy.account_id, taskInfoCopy);
  
  Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, taskInfoCopy.account_id, 'collectComment：collectComment-taskInfo:', taskInfoCopy);
  // 生成子任务
  const subTasks = getSubTasks(taskInfoCopy);
  accountSubTasksMap.set(taskInfoCopy.account_id, {
    subTasks,
    currentIndex: 0
  });
  // 获取渲染进程的view
  const view = accountViewManager.getView(taskInfoCopy.account_id);
  if (!view || !subTasks.length) {
    Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, taskInfoCopy.account_id, 'collectComment:ipc-receive-handler:view或subTasks为空');
    return false;
  };
  
  // 设置任务超时处理
  if (accountTimeoutMap.has(taskInfoCopy.account_id)) {
    clearTimeout(accountTimeoutMap.get(taskInfoCopy.account_id));
  }
  
  // 创建新的超时定时器
  const timeout = setTimeout(() => {
    // 检查任务是否仍在进行中
    if (accountCommentTaskInfoMap.has(taskInfoCopy.account_id)) {
      Logger.warn(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, taskInfoCopy.account_id, `任务执行超时(${TASK_TIMEOUT}ms)，自动完成`);
      handleTaskCompletion(taskInfoCopy.account_id, true);
    }
  }, TASK_TIMEOUT);
  
  // 存储超时定时器
  accountTimeoutMap.set(taskInfoCopy.account_id, timeout);
  
  // 定义完成加载时的回调函数
  // 在添加监听器前，尝试移除之前可能存在的同名监听器（防止重复绑定）
  view.webContents.removeAllListeners('did-finish-load');
  view.webContents.on('did-finish-load', async () => {
    Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, taskInfoCopy.account_id, '进入评论采集did-finish-load');
    const url = view.webContents.getURL() || '位置URL';
    if(url.includes('web-login/captcha')){
      Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, taskInfoCopy.account_id, '当前页面是滑动验证页面，不执行');
      Logger.info(XuanceModule.ACCOUNT.IPC.ON.SLIDE_VERIFICATION_POPUP_DETECTED, taskInfoCopy.account_id, 'slide-verification-popup-detected-working -> working-exception');
      dispatch(taskInfoCopy.account_id, LoginState.WORKING_EXCEPTION, {accountId:taskInfoCopy.account_id});
      await accountViewManager.notifyBrowserViews(false);
      return;
    }
    view.webContents.setBackgroundThrottling(false);
    handleFinishLoad(view, subTasks, accountSubTasksMap.get(taskInfoCopy.account_id)?.currentIndex || 0, taskInfoCopy.account_id);
  });
  // 定义任务状态变化的回调函数
  const collectStatusCallback = async (
    event: any,
    data: {
      accountId: string;
      index: number;
      success: boolean;
      error?: string;
    }
  ) => {
    try{
      // 在回调函数中，获取当前账号对应的最新任务信息
      const currentTaskInfo = accountCommentTaskInfoMap.get(data.accountId);
      if (!currentTaskInfo) {
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, data.accountId, 'collectComment:ipc-receive-handler:未找到账号对应的任务信息');
        return;
      }
      
      const accountTasks = accountSubTasksMap.get(data.accountId);
      const view = accountViewManager.getView(data.accountId);
      Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, data.accountId, '进入ipc:collectComment');
      if (!accountTasks) {
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, data.accountId, 'collectComment:ipc-receive-handler:No tasks found for account');
        return;
      }
      const { subTasks } = accountTasks;
      const { success, error, index } = data;
      if (!success && error) {
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, data.accountId, `collectComment:ipc-receive-handler:SubTask failed at index ${index}: ${error}`);
      }
      if(index === undefined) {
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, data.accountId, 'collectComment:ipc-receive-handler:SubTask failed at index undefined');
        return;
      };
      // 所有子任务执行完毕
      if ((success || subTasks[index].retry_count >= 3) && index === subTasks.length - 1) {
        Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, data.accountId, 'collectComment:ipc-receive-handler:所有子任务执行完毕,切换到idle状态', {
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
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, data.accountId, `collectComment:ipc-receive-handler:SubTask failed at index ${index}: ${error}, retry_count: ${subTasks[index].retry_count}, next retry_count: ${subTasks[index].retry_count + 1}`);
      }
      Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, data.accountId, '即将loadURL：https://www.xiaohongshu.com/explore')
      view.webContents.loadURL('https://www.xiaohongshu.com/explore').catch(err => {
        Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, data.accountId, 'collectComment:ipc-receive-handler:loadURL失败', err);
      }).then(() => {
        Logger.info(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, data.accountId, 'collectComment:ipc-receive-handler:loadURL成功');
      });
    }catch(err) {
      Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, data.accountId, 'collectComment:ipc-receive-handler:执行过程中发生错误', err.message);
      
      // 使用当前任务信息上报失败
      const currentTaskInfo = accountCommentTaskInfoMap.get(data.accountId);
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
        accountCommentTaskInfoMap.delete(data.accountId);
      }
    }
  }
  // 监听任务状态变化
  // 同理，为防止重复绑定，先移除同名监听器（如果你确保不存在重复可以省略这步）
  if(!isSetListener){
    ipcMain.on('collect-comment-task-status', collectStatusCallback);
    isSetListener = true;
  }
  // 开始任务，加载初始页面
  view.webContents.loadURL('https://www.xiaohongshu.com/explore').catch(err => {
    Logger.error(XuanceModule.HANDLER.RECEIVE_HANDLER.COLLECT_COMMENT, taskInfoCopy.account_id, 'collectComment:ipc-receive-handler:loadURL失败', err);
  });
  return true;
};
