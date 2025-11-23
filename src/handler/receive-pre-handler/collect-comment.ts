import { Message } from "../../types";

export const preHandleCollectComment = async (msg: Message): Promise<Message> => {
    const taskInfo = {
        ...msg
    }
    return taskInfo;
};  

