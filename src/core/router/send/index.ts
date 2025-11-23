import { Message } from '../../../types';

export class SendRouter {
  private handlers: Array<(message: Message) => Promise<void>> = [];

  public register(handler: (message: Message) => Promise<void>) {
    this.handlers.push(handler);
  }

  public async route(message: Message): Promise<void> {
    for (const handler of this.handlers) {
      await handler(message);
    }
  }
}