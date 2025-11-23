import { ipcMain } from 'electron';
import { sendPreRouter } from '../../core/router/sendPre';
import { envDataManager } from '../../account/envDataManager';
import { XuanceModule } from '../../types/xuance-module';
import { downloadAndUploadImage } from '../../utils/image-handler';
import { accountViewManager } from '../../account/accountViewManager';
import { sendToRenderer } from '../../account/ipc';
import { analyzeTextSentiment } from '../../utils/ai';
const ruleIdCounts = new Map<string, number>();
ipcMain.on('send-article-data', async (event, response: any) => {
    const accountId = response?.accountId;
    Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_DATA, accountId, 'ipc-plugins:send-article-data-start:接收渲染进程发送来的文章数据', response);
    try {
        if (response.response) {
            const tempResponse = JSON.parse(response.response);
            if (JSON.stringify(tempResponse.data) == '{}') {
                Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_DATA, accountId, 'ipc-plugins:send-article-data-end:没有数据', response);
                return;
            }
            try {
                const likedCount = (tempResponse.data.items[0]).note_card.interact_info.liked_count;
                if (parseInt(likedCount) <= response.subTaskInfo.likes) {
                    Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_DATA, accountId, 'ipc-plugins:send-article-data-end:点赞数未达到条件', response);
                    return;
                }
            } catch (e) {
                Logger.error(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_DATA, accountId, 'ipc-plugins:send-article-data-end:点赞数未达到条件', response, e);
                return;
            }
            try {
                const publishTime = (tempResponse.data.items[0]).note_card.time;
                if (publishTime < response.subTaskInfo.publish_time) {
                    Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_DATA, accountId, 'ipc-plugins:send-article-data-end:发布时间不符合条件', response);
                    return;
                }
            } catch (e) {
                Logger.error(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_DATA, accountId, 'ipc-plugins:send-article-data-end:发布时间不符合条件', response, e);
                return;
            }
        }
        const checkAndReport = async () => {
            let articleInfo = JSON.parse(response.response);
            const articleCommentCount = articleInfo.data.items[0].note_card.interact_info.comment_count;
            const targetCommentCount = response.subTaskInfo.comments;
            if (Number(articleCommentCount) < Number(targetCommentCount)) {
                Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_DATA, accountId, 'ipc-plugins:send-article-data-end:评论数不符合条件', response);
                return;
            }
            const isMatch = await analyzeTextSentiment(JSON.stringify({
                title: articleInfo.data.items[0].note_card.title,
                content: articleInfo.data.items[0].note_card.desc
            }), JSON.stringify(response.subTaskInfo.keywords || []), response.subTaskInfo.ai_prompt);
            if (!isMatch) {
                Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_DATA, accountId, 'ipc-plugins:send-article-data-end:经过ai判断文章不符合条件', response);
                return;
            }
            const result = await sendPreRouter.route({
                ...response,
                command: 'report_article',
                red_id: (await envDataManager.loadAccount(response.accountId)).red_id
            });
            // Track rule_id entry counts
            // const ruleId = response.rule_id;
            // if (ruleId) {
            //     ruleIdCounts.set(ruleId, (ruleIdCounts.get(ruleId) || 0) + 1);
            // }
            // if (ruleIdCounts.get(ruleId) >= (response.subTaskInfo.limit || 200)) {
            //     const view = accountViewManager.getViewByAccountId(accountId);
            //     if (view) {
            //         sendToRenderer(view, 'task-control', { type: 'stop' });
            //     }
            //     Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_DATA, accountId, 'ipc-plugins:send-article-data：规则id达到限制次数' + (response.subTaskInfo.limit || 200) + '，停止执行', ruleId);
            //     return;
            // }

            Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_DATA, accountId, 'ipc-plugins:send-article-data：接收渲染进程发送来的文章数据-end', result);
        }
        checkAndReport();
    } catch (error) {
        Logger.error(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_DATA, accountId, 'ipc-plugins:send-article-data：保存文章数据时出错:', error.message);
    }
});

ipcMain.on('send-captcha', async (event, response: any) => {
    const accountId = response?.accountId;
    Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_CAPTCHA, accountId, 'ipc-plugins: send-captcha: 接受验证码数据', JSON.stringify(response || {}))
    const account = await envDataManager.loadAccount(accountId)
    const red_userid = account?.user_id
    const red_id = account?.red_id;
    const bg_url = await downloadAndUploadImage(response?.bg_url);
    const patch_url = await downloadAndUploadImage(response?.patch_url);

    try {
        const apiResponse = await fetch('https://test-udc.100tal.com/wukong/api/captcha', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                red_id,
                red_userid,
                bg_url,
                patch_url
            })
        });

        if (!apiResponse.ok) {
            throw new Error(`HTTP error! status: ${apiResponse.status}`);
        }

        const result = await apiResponse.json();
        Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_CAPTCHA, accountId, '验证码数据上传成功', result);
    } catch (error) {
        Logger.error(XuanceModule.PLUGIN.HOOK.IPC.SEND_CAPTCHA, accountId, '验证码数据上传失败', error.message);
    }
});
// send-comment-data
ipcMain.on('send-comment-data', async (event, response: any) => {
    const accountId = response?.accountId;
    Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_COMMENT_DATA, accountId, 'ipc-plugins:send-comment-data-start:接收渲染进程发送来的评论数据');
    try {
        if (response.response) {
            const tempResponse = JSON.parse(response.response);
            const { data } = tempResponse;
            if (JSON.stringify(tempResponse.data) == '{}') {
                Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_COMMENT_DATA, accountId, 'ipc-plugins:send-comment-data-end:没有数据', response);
                return;
            }
            if ((data.comments && data.comments.length === 0) || !data.comments) {
                Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_COMMENT_DATA, accountId, 'ipc-plugins:send-comment-data-end:comments没有评论数据', response);
                return;
            }
        }
        const result = await sendPreRouter.route({
            ...response,
            command: 'report_comment',
            red_id: (await envDataManager.loadAccount(response.accountId)).red_id
        });

        Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_COMMENT_DATA, accountId, 'ipc-plugins:send-comment-data：发送到服务端数据，已入栈', result);
    } catch (error) {
        Logger.error(XuanceModule.PLUGIN.HOOK.IPC.SEND_COMMENT_DATA, accountId, 'ipc-plugins:send-comment-data：保存评论数据时出错:', error.message);
    }
});

ipcMain.on('send-article-interaction-data', async (event, response: any) => {
    const accountId = response?.accountId;
    let aid = '';
    Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_INTERACTION, accountId, 'ipc-plugins:send-article-interaction-start:接收渲染进程发送来的文章互动数据', response);
    try {
        if (response.response) {
            const tempResponse = JSON.parse(response.response);
            if (JSON.stringify(tempResponse.data) == '{}') {
                Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_INTERACTION, accountId, 'ipc-plugins:send-article-interaction-end:没有数据', response);
                return;
            }
           
            try {
                const publishTime = (tempResponse.data.items[0]).note_card.time;
                const article = response.subTaskInfo.articles.find((article: any) => article.title === tempResponse.data.items[0].note_card.title);
                aid = article?.aid;
                if(!article){
                    Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_INTERACTION, accountId, `ipc-plugins:send-article-interaction-end:没找到相关文章，采集到的title：${tempResponse.data.items[0].note_card.title}，下发来的文章：${JSON.stringify(response.subTaskInfo.articles)}`, response);
                    return;
                }
                if (article &&publishTime < article.published_time) {
                    Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_INTERACTION, accountId, 'ipc-plugins:send-article-interaction-end:发布时间不符合条件', response);
                    return;
                }
            } catch (e) {
                Logger.error(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_INTERACTION, accountId, 'ipc-plugins:send-article-interaction-end:发布时间不符合条件', response, e);
                return;
            }
        }
        
        const result = await sendPreRouter.route({
            ...response,
            aid,
            command: 'report_article_reading',
            red_id: (await envDataManager.loadAccount(response.accountId)).red_id
        });
        
        Logger.info(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_INTERACTION, accountId, 'ipc-plugins:send-article-interaction：接收渲染进程发送来的文章互动数据-end', result);
    } catch (error) {
        Logger.error(XuanceModule.PLUGIN.HOOK.IPC.SEND_ARTICLE_INTERACTION, accountId, 'ipc-plugins:send-article-interaction：保存文章互动数据时出错:', error.message);
    }
});


