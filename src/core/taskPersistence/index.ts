import path from 'path';
import { app } from 'electron';
import { TaskPersistenceManager } from './TaskPersistenceManager';
import { TaskStatus } from './types';
import { XuanceModule } from '../../types/xuance-module';
import { WebSocketPool } from '../websocket/websocketPool';
import { WebSocketMessage } from '../websocket/types';
import { reportTaskExeFailed } from '../queue/send/simple';

// Logger已经在全局定义，不需要导入
// global.d.ts中已定义：var Logger: LoggerInterface;

let taskManager: TaskPersistenceManager | null = null;
let persistenceEnabled = true; // 标记持久化功能是否可用

/**
 * 初始化任务持久化管理器
 */
export const initTaskPersistence = async (): Promise<void> => {
  try {
    // 创建数据库路径 (在应用数据目录中)
    const dbPath = path.join(app.getPath('userData'), 'task-persistence.db');
    
    // 获取任务持久化管理器实例
    taskManager = TaskPersistenceManager.getInstance({
      dbPath,
      tableName: 'ws_tasks',
      maxRetryAttempts: 3,
      checkIntervalMs: 60000 // 每分钟检查一次
    });
    
    // 初始化数据库
    await taskManager.init();
    
    // 如果能执行到这里，说明初始化成功
    if (taskManager) {
      // 注册任务过期事件处理
      taskManager.on('expiredTasks', handleExpiredTasks);
      
      // 注册应用关闭事件处理
      app.on('will-quit', async () => {
        if (taskManager) {
          await taskManager.close();
          taskManager = null;
        }
      });
      
      Logger.info(XuanceModule.TASK.PERSISTENCE, 'system', '任务持久化服务初始化成功');
    } else {
      // taskManager存在但初始化失败
      persistenceEnabled = false;
      Logger.warn(
        XuanceModule.TASK.PERSISTENCE, 
        'system', 
        '任务持久化服务初始化失败，将以降级模式运行'
      );
    }
    handlePendingTasksOnRestart();
  } catch (error) {
    // 记录错误，但不抛出异常使应用继续运行
    Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', '任务持久化管理器初始化失败', error);
    
    // 禁用持久化功能
    persistenceEnabled = false;
    taskManager = null;
    
    // 记录详细的错误信息以帮助诊断
    if (error instanceof Error) {
      Logger.error(
        XuanceModule.TASK.PERSISTENCE, 
        'system', 
        `错误类型: ${error.name}, 错误信息: ${error.message}, 堆栈: ${error.stack}`
      );
    }
    
    // 不再抛出异常，让应用继续运行
    Logger.warn(
      XuanceModule.TASK.PERSISTENCE, 
      'system', 
      '应用将在没有任务持久化功能的情况下继续运行'
    );
  }
};

/**
 * 处理收到的WebSocket任务
 * @param accountId 账号ID
 * @param message WebSocket消息
 */
export const handleReceivedTask = async (accountId: string, message: WebSocketMessage): Promise<void> => {
  if (!persistenceEnabled || !taskManager) {
    Logger.warn(XuanceModule.TASK.PERSISTENCE, accountId, '任务持久化服务未初始化或已禁用，无法保存任务');
    return;
  }
  
  try {
    // 判断消息是否需要持久化 (可以根据实际需求过滤)
    if (!shouldPersistTask(message)) {
      return;
    }
    
    // 计算任务超时时间 (根据具体业务定义，这里假设5分钟)
    const delayTime = {
      'collect_article': 30 * 60 * 1000,
    }[message.command] || 15 * 60 * 1000;
    const timeoutAt = Date.now() + delayTime;
    
    // 保存任务
    await taskManager.saveTask({
      id: message.trace_id,
      command: message.command,
      content: JSON.stringify(message),
      accountId: accountId,
      device_id: message.device_id,
      received_at: message.timestamp || Date.now(),
      timeout_at: timeoutAt
    });
    
    Logger.info(XuanceModule.TASK.PERSISTENCE, accountId, `已保存WebSocket任务 [${message.command}]`);
  } catch (error) {
    Logger.error(XuanceModule.TASK.PERSISTENCE, accountId, '保存WebSocket任务失败', error);
  }
};

/**
 * 处理任务完成
 * @param taskId 任务ID
 * @param accountId 账号ID
 * @param success 是否成功
 */
export const handleTaskCompletion = async (taskId: string, accountId: string, success: boolean): Promise<void> => {
  if (!persistenceEnabled || !taskManager) {
    Logger.warn(XuanceModule.TASK.PERSISTENCE, accountId, '任务持久化服务未初始化或已禁用，无法更新任务状态');
    return;
  }
  
  try {
    // 获取任务信息
    const task = await taskManager.getTaskById(taskId);
    if (!task) {
      Logger.warn(XuanceModule.TASK.PERSISTENCE, accountId, `任务 [${taskId}] 不存在`);
      return;
    }
    
    // 更新任务状态为已完成或已失败
    const status = success ? TaskStatus.COMPLETED : TaskStatus.FAILED;
    await taskManager.updateTaskStatus(taskId, status);
    
    // 无论任务成功或失败，都从数据库中删除
    await taskManager.deleteTask(taskId);
    
    Logger.info(
      XuanceModule.TASK.PERSISTENCE, 
      accountId, 
      `任务 [${taskId}] ${success ? '执行成功' : '执行失败'}，已从数据库中删除`
    );
  } catch (error) {
    Logger.error(XuanceModule.TASK.PERSISTENCE, accountId, `更新任务 [${taskId}] 状态失败`, error);
  }
};

/**
 * 应用重启时处理未完成的任务
 */
export const handlePendingTasksOnRestart = async (): Promise<void> => {
  if (!persistenceEnabled || !taskManager) {
    Logger.warn(XuanceModule.TASK.PERSISTENCE, 'system', '任务持久化服务未初始化或已禁用，无法处理未完成任务');
    return;
  }
  
  try {
    // 获取所有未完成且未过期的任务
    const pendingTasks = await taskManager.getPendingTasks();
    
    if (pendingTasks.length === 0) {
      Logger.info(XuanceModule.TASK.PERSISTENCE, 'system', '没有待处理的任务');
      return;
    }
    
    Logger.info(XuanceModule.TASK.PERSISTENCE, 'system', `发现 ${pendingTasks.length} 个未完成任务，开始处理`);
    
    // 获取WebSocket连接池
    const wsPool = WebSocketPool.getInstance();
    
    let retryCount = 0;
    // 处理每个任务
    for (let i = 0; i < pendingTasks.length; ) {
      const task = pendingTasks[i];
      try {
        // 解析任务内容
        const message = JSON.parse(task.content) as WebSocketMessage;
        
        // 检查设备是否已连接
        const client = wsPool.getClient(task.device_id);
        if (!client) {
          Logger.warn(
            XuanceModule.TASK.PERSISTENCE, 
            task.accountId, 
            `设备 [${task.device_id}] 未连接，无法报告任务失败`
          );
          retryCount ++;
          if(retryCount > 10){
            Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', `设备 [${task.device_id}] 未连接，无法报告任务失败，超过10次，不再重试`);
            await taskManager.deleteTask(task.id);
            i++;
            continue;
          }
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        retryCount = 0;
        // 创建失败响应消息
        reportTaskExeFailed(task.accountId, message.payload?.user_id, message.penetrate, message.trace_id, message.command, '任务执行失败，应用重启导致任务中断', '');
        // 删除任务
        await taskManager.deleteTask(task.id);
        
        Logger.info(
          XuanceModule.TASK.PERSISTENCE, 
          task.accountId, 
          `已向服务端报告任务 [${task.id}] 执行失败`
        );
        i++;
      } catch (error) {
        Logger.error(
          XuanceModule.TASK.PERSISTENCE, 
          task.accountId, 
          `处理未完成任务 [${task.id}] 失败`, 
          error
        );
        i++
      }
    }
  } catch (error) {
    Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', '处理未完成任务失败', error);
  }
};

/**
 * 处理过期任务
 * @param tasks 过期任务列表
 */
const handleExpiredTasks = async (tasks: Array<any>): Promise<void> => {
  if (tasks.length === 0) {
    return;
  }
  
  Logger.info(XuanceModule.TASK.PERSISTENCE, 'system', `处理 ${tasks.length} 个过期任务`);
  
  // 过期任务直接从数据库中删除，无需向服务端报告
  for (const task of tasks) {
    try {
      Logger.info(
        XuanceModule.TASK.PERSISTENCE, 
        task.accountId, 
        `任务 [${task.id}] 已过期，将从数据库中删除`
      );
    } catch (error) {
      Logger.error(
        XuanceModule.TASK.PERSISTENCE, 
        'system', 
        `处理过期任务 [${task.id}] 失败`, 
        error
      );
    }
  }
};

/**
 * 判断消息是否需要持久化
 * @param message WebSocket消息
 * @returns 是否需要持久化
 */
const shouldPersistTask = (message: WebSocketMessage): boolean => {
  // 根据实际业务需求判断哪些消息需要持久化
  // 例如，排除心跳消息、状态查询等不需要持久化的消息
  if(!message?.trace_id){
    Logger.warn(XuanceModule.TASK.PERSISTENCE, message.payload?.user_id, '没有trace_id, 不进行持久化, 消息内容:' + JSON.stringify(message));
    return false;
  }
  
  const nonPersistCommands = [
    'ping', 
    'pong', 
    'status',
    'heartbeat',
    'ack',
    'login',
    'bind'
  ];
  
  return !nonPersistCommands.includes(message.command.toLowerCase());
};

/**
 * 创建失败响应消息
 * @param originalMessage 原始消息
 * @returns 失败响应消息
 */
const createFailureResponse = (originalMessage: WebSocketMessage): WebSocketMessage => {
  return {
    command: `${originalMessage.command}_response`,
    device_id: originalMessage.device_id,
    trace_id: originalMessage.trace_id,
    penetrate: originalMessage.penetrate,
    timestamp: Date.now(),
    payload: {
      code: 500,
      message: '任务执行失败，应用重启导致任务中断',
      success: false,
      data: null
    },
    account_id: originalMessage.account_id
  };
};

export default {
  initTaskPersistence,
  handleReceivedTask,
  handleTaskCompletion,
  handlePendingTasksOnRestart
}; 