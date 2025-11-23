import { Message } from '../../types';
import { receivePreRouter } from './receivePre';
import { preHandleCollectArticle } from '../../handler/receive-pre-handler/collect-article';
import { receiveRouter } from './receive';
import { processMessage } from '../../handler/receive-handler/processMessage';

import { sendPreRouter } from './sendPre';
import { ArticleParams, sendPreHandleCollectArticle, sendPreHandleCollectComment } from '../../handler/send-pre-handler';
import { XuanceModule } from '../../types/xuance-module';
import { preHandleCollectComment } from '../../handler/receive-pre-handler/collect-comment';
import { preHandleConnectArticleInteraction } from '../../handler/receive-pre-handler/collect-article-interaction';
import { sendPreHandleConnectArticleInteraction } from '../../handler/send-pre-handler';

const initReceivePreRouter = () => {
  receivePreRouter.register('collect_article', async (msg:Message) => {
    return preHandleCollectArticle(msg);
  });
  receivePreRouter.register('collect_comment', async (msg:Message) => {
    return preHandleCollectComment(msg);
  });
  receivePreRouter.register('get_article_reading', async (msg:Message) => {
    return preHandleConnectArticleInteraction(msg);
  });
};
const initReceiveRouter = () => {
  receiveRouter.register(async (message: Message) => {
    if (message.account_id) {
      await processMessage(message);
    } else {
      Logger.error(XuanceModule.ROUTE.RECEIVE, message.account_id, 'account_id 为空');
    }
  });
};
const initSendPreRouter = () => {
  sendPreRouter.register('report_article', async (msg: any) => {
    return sendPreHandleCollectArticle(msg);
  });
  sendPreRouter.register('report_comment', async (msg: any) => {
    return sendPreHandleCollectComment(msg);
  });
  sendPreRouter.register('report_article_reading', async (msg: any) => {
    return sendPreHandleConnectArticleInteraction(msg);
  });
};
const initSendRouter = () => {

};
const initRouter = () => {
  initReceivePreRouter();
  initReceiveRouter();
  initSendPreRouter();
  initSendRouter();
};

export { initRouter };