import { EventEmitter } from 'events';

import { sendQueue } from '../send';
import { XuanceModule } from '../../../types/xuance-module';

interface DelayedSendMessage {
  clientId: string;
  message: any;
  executeTime: number;
  priority?: number;
}

class SendDelayQueue extends EventEmitter {
  private static instance: SendDelayQueue;
  private delayedMessages: DelayedSendMessage[] = [];
  private timer: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.startTimer();
  }

  public static getInstance(): SendDelayQueue {
    if (!SendDelayQueue.instance) {
      SendDelayQueue.instance = new SendDelayQueue();
    }
    return SendDelayQueue.instance;
  }

  public addDelayedMessage(
    clientId: string, 
    message: any, 
    delayMs: number,
    priority: number = 0
  ): void {
    const executeTime = Date.now() + delayMs;
    this.delayedMessages.push({ clientId, message, executeTime, priority });
    this.delayedMessages.sort((a, b) => a.executeTime - b.executeTime);
  }

  private startTimer(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      const now = Date.now();
      while (this.delayedMessages.length > 0 && this.delayedMessages[0].executeTime <= now) {
        const message = this.delayedMessages.shift();
        if (message) {
          try {
            sendQueue.enqueue(message.clientId, message.message, message.priority);
            this.emit('message_queued', message);
          } catch (error) {
            Logger.error(XuanceModule.QUEUE.SEND_DELAY, message.clientId, '延迟消息入队失败', error);
          }
        }
      }
    }, 100);
  }

  public clear(): void {
    this.delayedMessages = [];
  }

  public destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.delayedMessages = [];
  }

  public getStatus(): {
    queueSize: number;
    nextExecuteTime?: number;
  } {
    const status: {
      queueSize: number;
      nextExecuteTime?: number;
    } = {
      queueSize: this.delayedMessages.length,
    };

    if (this.delayedMessages.length > 0) {
      status.nextExecuteTime = this.delayedMessages[0].executeTime;
    }

    return status;
  }

  public init() {
    this.startTimer();
  }
}

export const sendDelayQueue = SendDelayQueue.getInstance();