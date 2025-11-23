import { EventEmitter } from 'events';
import { XuanceModule } from '../../../types/xuance-module';


interface DelayedMessage {
  clientId: string;
  message: any;
  executeTime: number;
}

class ReceiveDelayQueue extends EventEmitter {
  private static instance: ReceiveDelayQueue;
  private delayedMessages: DelayedMessage[] = [];
  private timer: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.startTimer();
  }

  public static getInstance(): ReceiveDelayQueue {
    if (!ReceiveDelayQueue.instance) {
      ReceiveDelayQueue.instance = new ReceiveDelayQueue();
    }
    return ReceiveDelayQueue.instance;
  }

  public addDelayedMessage(clientId: string, message: any, delayMs: number): void {
    const executeTime = Date.now() + delayMs;
    this.delayedMessages.push({ clientId, message, executeTime });
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
            this.emit('delayed_message', message.clientId, message.message);
          } catch (error) {
            Logger.error(XuanceModule.QUEUE.RECEIVE_DELAY, message.clientId, '处理延迟消息失败', error);
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

  public init() {
    this.startTimer();
  }
}

export const receiveDelayQueue = ReceiveDelayQueue.getInstance();