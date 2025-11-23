import { EventEmitter } from 'events';
import { WebSocketPool } from '../../websocket/websocketPool';
import { XuanceModule } from '../../../types/xuance-module';


interface SendQueueItem {
  accountId: string;
  message: any;
  priority: number;
  timestamp: number;
  retries?: number;
}

class SendQueue extends EventEmitter {
  private static instance: SendQueue;
  private queue: SendQueueItem[] = [];
  private isProcessing: boolean = false;
  private maxRetries: number = 3;
  private wsPool: WebSocketPool;
  private handlers: Array<(item: SendQueueItem) => Promise<SendQueueItem>> = [];
  private enqueueCounter = 0;

  private constructor() {
    super();
    this.wsPool = WebSocketPool.getInstance();
    this.startProcessing();
  }

  public static getInstance(): SendQueue {
    if (!SendQueue.instance) {
      SendQueue.instance = new SendQueue();
    }
    return SendQueue.instance;
  }

  public enqueue(accountId: string, message: any, priority: number = 0): void {
    this.queue.push({
      accountId,
      message,
      priority,
      timestamp: ++this.enqueueCounter,
      retries: 0
    });
    
    this.sortQueue();
    
    if (!this.isProcessing) {
      this.startProcessing();
    }
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.timestamp - b.timestamp;
    });
  }

  private async startProcessing(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const item = this.queue[0];
      
      if (!this.wsPool.isClientConnected(item.message.device_id)) {
        Logger.warn(XuanceModule.QUEUE.SEND, item.accountId, `WebSocket未连接，设备ID: ${item.message.device_id}，消息已移至队尾...`);
        const deferredItem = this.queue.shift()!;
        deferredItem.retries = (deferredItem.retries || 0) + 1;
        
        if (deferredItem.retries >= this.maxRetries) {
          this.emit('messageFailed', deferredItem);
          Logger.error(XuanceModule.QUEUE.SEND, deferredItem.accountId, `消息重试次数已达上限(${this.maxRetries})，已丢弃`);
        } else {
          // 计算重试延迟：第一次5秒，第二次10秒，第三次20秒
          const retryDelays = [5000, 10000, 20000]; // 对应重试次数1,2,3
          const delayMs = retryDelays[deferredItem.retries - 1] || 20000; // 超过3次则使用20秒
          
          Logger.info(XuanceModule.QUEUE.SEND, deferredItem.accountId, `第${deferredItem.retries}次重试，将在${delayMs/1000}秒后执行`);
          
          setTimeout(() => {
            this.queue.push(deferredItem);
            this.sortQueue();
            if (!this.isProcessing) {
              this.startProcessing();
            }
          }, delayMs);
        }
        
        if (this.queue.length === 0) {
          this.isProcessing = false;
        }
        
        continue;
      }
      
      try {
        const success = await this.sendMessage(item);
        
        if (success) {
          this.queue.shift();
          this.emit('messageSent', item);
        } else {
          if ((item.retries || 0) < this.maxRetries) {
            item.retries = (item.retries || 0) + 1;
            this.queue.push(this.queue.shift()!);
          } else {
            this.queue.shift();
            this.emit('messageFailed', item);
          }
        }
      } catch (error) {
        Logger.error(XuanceModule.QUEUE.SEND, item.accountId, '发送消息失败', error);
        this.emit('error', error, item);
        this.queue.shift();
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.isProcessing = false;
  }

  private async sendMessage(item: SendQueueItem): Promise<boolean> {
    return this.wsPool.sendToClient(item.message.device_id, item.message);
  }

  public clear(): void {
    this.queue = [];
  }

  public size(): number {
    return this.queue.length;
  }

  public init() {
    this.startProcessing();
  }

  public register(handler: (item: SendQueueItem) => Promise<SendQueueItem>) {
    this.handlers.push(handler);
  }
}

export const sendQueue = SendQueue.getInstance();