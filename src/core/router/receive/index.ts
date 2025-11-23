import { Message } from '../../../types';
import { XuanceModule } from '../../../types/xuance-module';

import { reportTaskExeFailed } from '../../queue/send/simple';
import { reportTaskExeSuccess } from '../../queue/send/simple';

class ReceiveRouter {
  private handlers: Array<(message: Message) => Promise<void>> = [];

  public register(handler: (message: Message) => Promise<void>) {
    this.handlers.push(handler);
  }

  public async route(message: Message): Promise<void> {
    for (const handler of this.handlers) {
      try{
        await handler(message);
        return;
      }catch(error){
        reportTaskExeFailed(message.account_id, message.red_id, message.penetrate, message.trace_id, message.command, '', '');
        Logger.error(XuanceModule.ROUTE.RECEIVE, message.account_id, 'ReceiveRouter route error', error);
      }
    }
  }
}

const receiveRouter = new ReceiveRouter();

export { receiveRouter };