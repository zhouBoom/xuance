import { Message } from "../../types";

export const preHandleCollectArticle = async (msg: Message): Promise<Message> => {
    const taskInfo = {
        ...msg
    }
    return taskInfo;
};  

