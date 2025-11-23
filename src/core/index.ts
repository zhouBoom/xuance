import { initQueue } from './queue';
import { initRouter } from './router';
import { initAccountList } from '../account/accountManager';
import { initGlobalEvent } from './global';
import { initTaskPersistence } from './taskPersistence';
import { apiRequest } from '../api/request';

export const init = async () => {
    initQueue();
    initRouter();
    initAccountList();
    initGlobalEvent();
    initTaskPersistence();
}
