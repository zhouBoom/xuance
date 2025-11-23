import md5 from 'md5';
import { sendQueue } from './index';
import { getWSDeviceID } from '../../../utils/os';
import { handleTaskCompletion } from '../../taskPersistence';
export function reportException(accountId: string, redId: string, error: string) {
    sendQueue.enqueue(accountId, {
        command: 'report_exception_alerts',
        device_id: getWSDeviceID(accountId, redId),
        trace_id: '',
        penetrate: '',
        timestamp: Date.now(),
        payload: {
            topic: 'public',
            app_type: '2',
            err_msg: error,
            user_id: redId
        }
    }, 0);
}


export function reportTaskReceiveSuccess(accountId: string, redId: string, penetrate: string, trace_id: string, exec_cmd: string, message: string, data: string) {
    sendQueue.enqueue(accountId, {
        command: 'receipt',
        device_id: getWSDeviceID(accountId, redId),
        penetrate,
        trace_id,
        timestamp: Date.now(),
        payload: {
            topic: 'cmd_exec',
            app_type: '2',
            exec_cmd,
            exec_status: 1, // 1已收到指令 2执行成功 3执行失败 4执行超时
            message,
            data,
            errcode: 0
        }
    });
}

export function reportTaskExeSuccess(accountId: string, redId: string, penetrate: string, trace_id: string, exec_cmd: string, message: string, data: string) {
    setTimeout(() => {
        sendQueue.enqueue(accountId, {
            command: 'receipt',
            device_id: getWSDeviceID(accountId, redId),
            penetrate,
            trace_id,
            timestamp: Date.now(),
            payload: {
                topic: 'cmd_exec',
                app_type: '2',
                exec_cmd,
                exec_status: 2, // 1已收到指令 2执行成功 3执行失败 4执行超时
                message,
                data,
                errcode: 0
            }
        });
        handleTaskCompletion(trace_id, accountId, true);
    }, exec_cmd === 'collect_article' ? 28 * 60 * 1000 : 13 * 60 * 1000);
}

export function reportTaskExeSuccessNow(accountId: string, redId: string, penetrate: string, trace_id: string, exec_cmd: string, message: string, data: string) {
    sendQueue.enqueue(accountId, {
        command: 'receipt',
        device_id: getWSDeviceID(accountId, redId),
        penetrate,
        trace_id,
        timestamp: Date.now(),
        payload: {
            topic: 'cmd_exec',
            app_type: '2',
            exec_cmd,
            exec_status: 2, // 1已收到指令 2执行成功 3执行失败 4执行超时
            message,
            data,
            errcode: 0
        }
    });
    handleTaskCompletion(trace_id, accountId, true);
}

export function reportTaskExeFailed(accountId: string, redId: string, penetrate: string, trace_id: string, exec_cmd: string, message: string, data: string) {
    setTimeout(() => {
        sendQueue.enqueue(accountId, {
            command: 'receipt',
            device_id: getWSDeviceID(accountId, redId),
            penetrate,
            trace_id,
            timestamp: Date.now(),
            payload: {
                topic: 'cmd_exec',
                app_type: '2',
                exec_cmd,
                exec_status: 3,  // 1已收到指令 2执行成功 3执行失败 4执行超时
                message,
                data,
                errcode: 0
            }
        });
        handleTaskCompletion(trace_id, accountId, false);
    }, 5000)

}