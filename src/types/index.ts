// 基础消息结构
export interface Message {
    command: MessageCommand;
    account_id: string;
    red_id: string;
    device_id: string;
    trace_id: string;
    penetrate: string;
    timestamp: number;
    payload: MessagePayload;
    ack_id?: string;  // 仅在 ack 消息中存在
  }
  
  // 消息类型枚举
  export enum MessageCommand {
    COLLECT_ARTICLE = 'collect_article',
    COLLECT_COMMENT = 'collect_comment',
    REPORT_ARTICLE = 'report_article',
    PING = 'ping',
    PONG = 'pong',
    ACK = 'ack',
    UNBIND = 'unbind',
    GET_ARTICLE_READING = 'get_article_reading'
  }
  
  // 消息载荷联合类型
  export type MessagePayload =
    | CollectArticlePayload
    | ReportArticlePayload
    | PingPongPayload
    | AckPayload
    | UnbindPayload
    | CollectArticleInteractionPayload;
  
  export interface CollectArticleInteractionPayload {
    user_id: string;
    rule_id: string;
    aid: string;
    rule_name: string;
    author_ids: string[];
    keywords?: string[];
    articles: Article[];
    publish_time?: number;
  }

  // 采集文章请求载荷
  export interface CollectArticlePayload {
    user_id: string;
    rule_id: string;
    rule_name: string;
    author_ids: string[];
    keywords: string[];
    limit: number;
    rate: number;
  }
  
  // 上报文章响应载荷
  export interface ReportArticlePayload {
    topic: string;
    rule_id: string;
    user_id: string;
    list: Article[];
  }
  
  // 文章信息
  export interface Article {
    author: Author;
    article: ArticleDetail;
  }
  
  export interface Author {
    id: string;
    avatar: string;
    nickname: string;
  }
  
  export interface ArticleDetail {
    title: string;
    content: string;
    images: string[];
    publish_info: string;
    collected_time: number;
    location: string;
    likes_view: string;
    favorites_view: string;
    comments_view: string;
  }
  
  // Ping/Pong 载荷
  export interface PingPongPayload {
    user_ids: string[];
  }
  
  // Ack 载荷
  export interface AckPayload {
    // 空对象
  }
  
  // Unbind 载荷
  export interface UnbindPayload {
    user_id: string;
  }
  
  // 类型守卫函数
  export const isCollectArticleMessage = (message: Message): message is Message & { payload: CollectArticlePayload } => {
    return message.command === MessageCommand.COLLECT_ARTICLE;
  };
  
  export const isReportArticleMessage = (message: Message): message is Message & { payload: ReportArticlePayload } => {
    return message.command === MessageCommand.REPORT_ARTICLE;
  };
  
  // ... 其他类型守卫函数