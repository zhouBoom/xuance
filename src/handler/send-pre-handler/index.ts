import md5 from "md5";
import { downloadAndUploadImage } from '../../utils/image-handler';
import { XuanceModule } from "../../types/xuance-module";
import { envDataManager } from "../../account/envDataManager";
import { getWSDeviceID } from "../../utils/os";
export interface ArticleParams {
    command: string;
    account_id: string;
    device_id: string;
    rule_id: string;
    red_id: string;
    list: any[];
    response: any;
    aid: string;
}
const generateDeviceId = async (red_id: string): Promise<string> => {
    const account = await envDataManager.loadAccountByRedId(red_id);
    return  getWSDeviceID(account.user_id, red_id)
}
export const sendPreHandleCollectArticle = async (message: ArticleParams) => {
    let responseData: any = null;
    try {
        responseData = JSON.parse(message.response);
        responseData = responseData.data.items[0];
    } catch (error) {
        Logger.error(XuanceModule.HANDLER.SEND_PRE_HANDLER.COLLECT_ARTICLE, message.account_id, 'sendPreHandleCollectArticle', error);
        return message;
    }
    const noteCard = responseData.note_card;
    
    // 处理图片列表
    let imageUrls = []
    try{
        imageUrls = await Promise.all(
            noteCard.image_list.map(async (image: any) => {
                // 下载并上传图片，获取新的URL
                return await downloadAndUploadImage(image.url_default);
            })
        );
    } catch (error) {
        imageUrls = noteCard.image_list.map(async (image: any) => {
                // 下载并上传图片，获取新的URL
                return image.url_default;
            })
        Logger.error(XuanceModule.HANDLER.SEND_PRE_HANDLER.COLLECT_ARTICLE, message.account_id, 'sendPreHandleCollectArticle', error);
    }

    const result = {
        command: 'report_article',
        device_id: await generateDeviceId(message.red_id),
        trace_id: '',
        penetrate: '',
        timestamp: Date.now(),
        payload: {
            topic: 'public',
            rule_id: message.rule_id,
            user_id: message.red_id,
            list: [{
                author: {
                    id: noteCard.user.user_id,
                    avatar: noteCard.user.avatar,
                    nickname: noteCard.user.nickname
                },
                article: {
                    title: noteCard.title,
                    content: noteCard.desc,
                    images: imageUrls,
                    published_time: noteCard.time,
                    publish_info: `${noteCard.time}${noteCard.ip_location?(' '+noteCard.ip_location):''}`,
                    collected_time: Date.now(),
                    location: noteCard.ip_location,
                    likes_view: noteCard.interact_info.liked_count,
                    favorites_view: noteCard.interact_info.collected_count,
                    comments_view: noteCard.interact_info.comment_count
                }
            }]
        }
    };

    Logger.info(XuanceModule.HANDLER.SEND_PRE_HANDLER.COLLECT_ARTICLE, message.account_id, 'sendPreHandleCollectArticle, result', result);
    return result;
}

export const sendPreHandleCollectComment = async (message: any) => {
    let responseData: any = null;
    let comment: any = null;
    let noteCover: any = null;
    let authorAvatar: any = null;
    try {
        const { response, note, author } = message
        responseData = JSON.parse(response);
        const comments = responseData.data.comments
        if (note.cover) {
            noteCover = await downloadAndUploadImage(note.cover) || note.cover;
            // noteCover = note.cover;
        }
        if (author.avatar) {
            authorAvatar = await downloadAndUploadImage(author.avatar) || author.avatar;
            // authorAvatar = author.avatar;
        }
        comment = await Promise.all(comments.map(async res => {
            const { user_info } = res
            let pictures = []
            if(res.pictures && res.pictures.length > 0) {
                pictures = await Promise.all(res.pictures.map(async item => {
                    return await downloadAndUploadImage(item.url_default) || item.url_default;
                    // return item.url_default;
                }));
            }
            const avatar = await downloadAndUploadImage(user_info.image) || user_info.image;
            // const avatar = user_info.image;
            return {
                id: res.id,
                note_id: res.note_id,
                content: res.content,
                pictures,
                comment_user: {
                    avatar,
                    id: user_info.user_id,
                    nickname: user_info.nickname
                },
                ip_location: res.ip_location || '未知',
                comment_time: res.create_time,
            }
        }));
    } catch (error) {
        Logger.error('COLLECT_COMMENT', message.account_id, 'sendPreHandleCollectComment', error);
        return message;
    }
    const result = {
        command: 'report_comment',
        device_id: await generateDeviceId(message.red_id),
        trace_id: message.trace_id,
        penetrate: message.penetrate,
        timestamp: Date.now(),
        payload: {
            topic: 'public',
            rule_id: message.rule_id,
            user_id: message.red_id,
            note: {
                ...message.note,
                cover: noteCover
            },
            author: {
                ...message.author,
                avatar: authorAvatar
            },
            comment,
        }
    };
    return result;
}

export const sendPreHandleConnectArticleInteraction =async (message: ArticleParams) => {
    let responseData: any = null;
    try {
        responseData = JSON.parse(message.response);
        responseData = responseData.data.items[0];
    } catch (error) {
        Logger.error(XuanceModule.HANDLER.SEND_PRE_HANDLER.CONNECT_ARTICLE_INTERACTION, message.account_id, 'sendPreHandleConnectArticleInteraction', error);
        return message;
    }
    const noteCard = responseData.note_card;

    const result = {
        command: 'report_article_reading',
        device_id: await generateDeviceId(message.red_id),
        trace_id: '',
        penetrate: '',
        timestamp: Date.now(),
        payload: {
            topic: 'public',
            rule_id: message.rule_id,
            user_id: message.red_id,
            article: {
                aid: message.aid,
                likes_view: noteCard.interact_info.liked_count,
                favorites_view: noteCard.interact_info.collected_count,
                comments_view: noteCard.interact_info.comment_count,
                share_view: noteCard.interact_info.share_count,
            }
        }
    };

    Logger.info(XuanceModule.HANDLER.SEND_PRE_HANDLER.CONNECT_ARTICLE_INTERACTION, message.account_id, 'sendPreHandleConnectArticleInteraction, result', result);
    return result;
}