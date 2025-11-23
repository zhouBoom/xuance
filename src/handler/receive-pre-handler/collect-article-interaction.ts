import { CollectArticleInteractionPayload, Message } from "../../types";
import { XuanceModule } from "../../types/xuance-module";

export const preHandleConnectArticleInteraction = async (msg: Message): Promise<Message> => {
    try {
        // 安全处理原始消息数据
        const payload = msg.payload as any; // 使用 any 先安全访问
        
        // 提取所需的数据，并提供安全的默认值
        const authorIds = payload.author_ids ? [...payload.author_ids] : 
                         (payload.author_id ? [payload.author_id] : []);
        
        const articles = payload.articles ? [...payload.articles] : payload.article ? [payload.article] : [];
        const userId = payload.user_id || msg.red_id;
        
        // 创建符合预期类型的新 Payload
        const interactionPayload: CollectArticleInteractionPayload = {
            user_id: userId,
            rule_id: payload.rule_id || 'get_article_reading',
            rule_name: payload.rule_name || '采集文章互动',
            aid: payload.aid,
            author_ids: authorIds,
            keywords: payload.articles.map((article: any) => article.title) || [],
            articles: articles,
            publish_time: msg.timestamp
        };
        
        return {
            ...JSON.parse(JSON.stringify(msg)),
            payload: interactionPayload
        };
    } catch (error) {
        Logger.error(XuanceModule.HANDLER.RECEIVE_PRE_HANDLER.COLLECT_ARTICLE, msg.account_id, '预处理文章互动消息失败', error);
        // 返回原始消息，让后续处理程序处理错误
        return JSON.parse(JSON.stringify(msg));
    }
};

