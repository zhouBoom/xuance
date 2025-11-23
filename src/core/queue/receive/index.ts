import { EventEmitter } from 'events';

import { getStateMachine } from '../../../account/state';
import { LoginState } from '../../../account/state/LoginStateMachine';
import { receiveRouter } from '../../router/receive';
import { XuanceModule } from '../../../types/xuance-module';
import { reportTaskExeFailed } from '../send/simple';

interface ReceiveQueueItem {
  clientId: string;
  message: any;
  timestamp: number;
  processed: boolean;
  retryCount?: number;
}

class ReceiveQueue extends EventEmitter {
  private static instance: ReceiveQueue;
  private queues: Map<string, ReceiveQueueItem[]> = new Map();
  private processingStatus: Map<string, boolean> = new Map();
  private maxQueueSize: number = 1000;
  private processInterval: number = 6000;

  private constructor() {
    super();
    this.on('process_message', async (message: any) => {
      // console.log('process_message-message:', message);
      await receiveRouter.route(message);
    });
  }

  public static getInstance(): ReceiveQueue {
    if (!ReceiveQueue.instance) {
      ReceiveQueue.instance = new ReceiveQueue();
    }
    return ReceiveQueue.instance;
  }

  public async enqueue(message: any): Promise<void> {
    Logger.info(XuanceModule.QUEUE.RECEIVE, message.account_id, '数据预处理后进入队列', message);
    if (!this.queues.has(message.account_id)) {
      this.queues.set(message.account_id, []);
      this.processingStatus.set(message.account_id, false);
    }

    const queue = this.queues.get(message.account_id)!;
    
    if (queue.length >= this.maxQueueSize) {
      queue.shift();
      Logger.warn(XuanceModule.QUEUE.RECEIVE, message.account_id, '接收队列已满,丢弃最早的消息', message);
    }

    try {
      queue.push({
        clientId: message.account_id,
        message,
        timestamp: Date.now(),
        processed: false
      });
      Logger.info(XuanceModule.QUEUE.RECEIVE, message.account_id, '消息入队成功，即将开始处理', message);
      if (!this.processingStatus.get(message.account_id)) {
        this.startProcessing(message);
      }
    } catch (error) {
      Logger.error(XuanceModule.QUEUE.RECEIVE, message.account_id, '消息入队失败', error);
      this.emit('error', error);
    }
  }

  private async startProcessing(message: any): Promise<void> {
    Logger.info(XuanceModule.QUEUE.RECEIVE, message.account_id, '消息队列循环开始', message);
    if (this.processingStatus.get(message.account_id)) return;
    this.processingStatus.set(message.account_id, true);
    
    const queue = this.queues.get(message.account_id)!;
    
    while (queue.length > 0) {
      const item = queue.shift()!; // 直接从队列头部取出消息
      
      if (!item.processed) {
        // 初始化重试计数
        item.retryCount = item.retryCount || 0;
        
        Logger.info(XuanceModule.QUEUE.RECEIVE, message.account_id, '消息即将出队', item.message);
        try {
          const isIdle = await this.checkBrowserViewIdle(item.message.account_id);
          if (!isIdle) {
            Logger.info(XuanceModule.QUEUE.RECEIVE, message.account_id, '当前浏览器不是空闲状态，消息放到队列尾部', {
              message: item.message,
              isIdle: getStateMachine(item.message.account_id)?.getCurrentState(item.message.account_id),
              retryCount: item.retryCount
            });
            
            item.retryCount++;
            if (item.retryCount >= 100) {
              Logger.error(XuanceModule.QUEUE.RECEIVE, message.account_id, `消息处理失败，已重试${item.retryCount}次，从队列中移除`);
              reportTaskExeFailed(item.message.account_id, item.message.red_id, item.message.penetrate, item.message.trace_id, item.message.command, '账号状态异常', '');
            } else {
              // 重试次数未达到上限，放到队列尾部
              queue.push(item);
            }
            continue;
          }
          
          Logger.info(XuanceModule.QUEUE.RECEIVE, message.account_id, '当前浏览器是空闲状态，出队', item.message);
          this.emit('process_message', item.message);
          item.processed = true;
        } catch (error) {
          Logger.error(XuanceModule.QUEUE.RECEIVE, message.account_id, `处理消息失败${item.retryCount}次`, error);
          item.retryCount++;
          if (item.retryCount >= 100) { // 6秒一次，100次，10分钟
            Logger.error(XuanceModule.QUEUE.RECEIVE, message.account_id, `消息处理失败，已重试${item.retryCount}次，从队列中移除`);
            reportTaskExeFailed(item.message.account_id, item.message.red_id, item.message.penetrate, item.message.trace_id, item.message.command, '账号状态异常', '');
          } else {
            // 重试次数未达到上限，放到队列尾部
            queue.push(item);
          }
          this.emit('error', error);
        }
      }
      
      // 每处理一个消息后等待一段时间
      await new Promise(resolve => setTimeout(resolve, this.processInterval));
    }
    
    this.processingStatus.set(message.account_id, false);
    Logger.info(XuanceModule.QUEUE.RECEIVE, message.account_id, '队列循环结束，处理状态设置为false', message);
  }

  private async checkBrowserViewIdle(clientId: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const stateMachine = getStateMachine(clientId);

      resolve(stateMachine?.getCurrentState(clientId) === LoginState.IDLE); 
    });
  }

  public clear(clientId?: string): void {
    if (clientId) {
      this.queues.set(clientId, []);
      this.processingStatus.set(clientId, false);
    } else {
      this.queues.clear();
      this.processingStatus.clear();
    }
    this.emit('queue_cleared', clientId);
  }

  public size(clientId?: string): number {
    if (clientId) {
      return this.queues.get(clientId)?.length || 0;
    }
    return Array.from(this.queues.values()).reduce((total, queue) => total + queue.length, 0);
  }

  public getStatus(clientId?: string): {
    queueSize: number;
    isProcessing: boolean;
    oldestMessageAge?: number;
  } | Map<string, {
    queueSize: number;
    isProcessing: boolean;
    oldestMessageAge?: number;
  }> {
    if (clientId) {
      const queue = this.queues.get(clientId) || [];
      const status = {
        queueSize: queue.length,
        isProcessing: this.processingStatus.get(clientId) || false,
      };

      if (queue.length > 0) {
        return {
          ...status,
          oldestMessageAge: Date.now() - queue[0].timestamp
        };
      }
      return status;
    }

    const allStatus = new Map();
    this.queues.forEach((queue, id) => {
      const status = {
        queueSize: queue.length,
        isProcessing: this.processingStatus.get(id) || false,
      };
      if (queue.length > 0) {
        Object.assign(status, {
          oldestMessageAge: Date.now() - queue[0].timestamp
        });
      }
      allStatus.set(id, status);
    });
    return allStatus;
  }
}

export const receiveQueue = ReceiveQueue.getInstance();