import { envDataManager } from "./envDataManager";
import { BrowserView, BrowserWindow } from "electron";
import { sendToRenderer } from "./ipc";
import { AccountStatus } from "./state/handlers/accountStatus";

export type AccountRendererItem = {
    platform?: string;
    user_id: string;
    nickname?: string;
    desc?: string;
    gender?: string;
    images?: string[];
    imageb?: string;
    guest?: boolean;
    red_id?: string;
}

export const transformDataToArray = (data: any): AccountRendererItem[]=> {
    const result: AccountRendererItem[] = [];
    for (const platform in data) {
        for (const userId in data[platform]) {
            const userData = data[platform][userId];
            result.push({
                platform,
                user_id: userId,
                nickname: userData.nickname,
                desc: userData.desc,
                gender: userData.gender,
                images: userData.images,
                imageb: userData.imageb,
                guest: userData.guest,
                red_id: userData.red_id
            });
        }
    }
    return result;
}

export const updateAccountRendererItem = async (view: BrowserWindow, accountId: string, status: AccountStatus) => {
    const account = await envDataManager.loadAccount(accountId);
    sendToRenderer(view, 'add-account-item', {
      status,
      ...account
    })
  }