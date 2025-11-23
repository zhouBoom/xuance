import { ArticleParams } from '../../../handler/send-pre-handler';
import { XuanceModule } from '../../../types/xuance-module';
import { sendQueue } from '../../queue/send';
// import { Message } from '../../../types';
// import { sendQueue } from '../../queue/send';

class SendPreRouter {
  private handlers: Map<string, (message: ArticleParams) => Promise<ArticleParams>> = new Map();

  public register(command: string, handler: (message: any) => Promise<any>) {
    this.handlers.set(command, handler);
  }

  public async route(message: ArticleParams): Promise<ArticleParams> {
    const command = message.command;
    const handler = this.handlers.get(command);
    if (handler) {
      const result = await handler(message);
      Logger.info(XuanceModule.ROUTE.SEND_PRE, message.account_id, '上报数据，入队', result);
      sendQueue.enqueue(message.account_id, result, 0);
      return result;
    }
    return message;
  }
}

export const sendPreRouter = new SendPreRouter();