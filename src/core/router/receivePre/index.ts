import { envDataManager } from "../../../account/envDataManager";
import { Message } from "../../../types";
import { receiveQueue } from "../../queue/receive";
import { reportTaskReceiveSuccess } from "../../queue/send/simple";

class ReceivePreRouter {
  private handlers: Map<string, (message: any) => Promise<any>> = new Map();

  public register(command: string, handler: (message: any) => Promise<any>) {
    this.handlers.set(command, handler);
  }

  public async route(message: Message): Promise<any> {
    const command = message.command;
    const handler = this.handlers.get(command);
    if (handler) {
      if(!('user_id' in message.payload)) {
        return message;
      }
      reportTaskReceiveSuccess(message.account_id, message.red_id, message.penetrate, message.trace_id, command, '', '');
      const result = await handler(message);
      receiveQueue.enqueue(result);
      return result;
    }
    return message;
  }
}

export const receivePreRouter = new ReceivePreRouter();