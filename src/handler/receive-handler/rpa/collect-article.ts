import fs from 'fs';
import path from 'path';
import { chromium, Page } from 'playwright';
import { UserAndKeywordHandler } from '../../../plugins/rpa/collectArticle/userAndKeyword';
import { OnlyKeywordHandler } from '../../../plugins/rpa/collectArticle/onlyKeyword';

let isSetListener = false

// 定义任务超时时间（毫秒）
const TASK_TIMEOUT = 28 * 60 * 1000; 

// 存储子任务信息
const accountSubTasksMap = new Map<string, {
    subTasks: SubTask[],
    currentIndex: number
}>();

// 存储任务信息
const accountArticleTaskInfoMap = new Map<string, ArticleTaskInfo>();

// 添加任务超时计时器Map
const accountTimeoutMap = new Map<string, NodeJS.Timeout>();

// 存储每个账号对应的 Page 对象
const accountPageMap = new Map<string, Page>();

// 生成任务ID的辅助函数
function getTaskId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// 定义任务相关的数据结构
export interface ArticleTaskPayload {
    user_id: string;
    rule_id: string;
    rule_name: string;
    author_ids: string[];
    keywords: string[];
    limit: number;
    comments: number;
    ai_prompt: string;
    publish_time: number;
    likes: number;
    rate: number;
}

export interface ArticleTaskInfo {
    account_id: string;
    red_id: string;
    task_id: string;
    command: string;
    device_id: string;
    trace_id: string;
    penetrate: string;
    timestamp: number;
    payload: ArticleTaskPayload;
}

// 定义子任务类型
type SubTaskType = 'author_and_keyword' | 'only_author' | 'only_keyword';

export interface SubTask {
    id: string;
    account_id: string;
    limit: number;
    likes: number;
    retry_count: number;
    publish_time: number;
    red_id: string;
    parent_id: string;
    type: SubTaskType;
    keywords?: string[];
    keyword?: string;
    comments?: number;
    ai_prompt?: string;
    authorId?: string;
    success: boolean;
    error: string;
    index?: number;
    trace_id: string;
    penetrate: string;
    handler?: UserAndKeywordHandler | OnlyKeywordHandler;
}

function writeLog(message: string) {
    const logDir = path.join(__dirname, '../../../logs');
    const logFile = path.join(logDir, 'subtask-scripts.log');
    
    // 确保日志目录存在
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    // 写入日志
    const logMessage = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(logFile, logMessage);
}   

/**
 * 根据payload判断子任务类型
 */
function deriveTaskType(payload: ArticleTaskPayload): SubTaskType {
    const hasAuthors = payload.author_ids && payload.author_ids.length > 0;
    const hasKeywords = payload.keywords && payload.keywords.length > 0;
    if (hasAuthors && hasKeywords) return 'author_and_keyword';
    if (hasAuthors) return 'only_author';
    if (hasKeywords) return 'only_keyword';
    throw new Error('Invalid payload: neither author_ids nor keywords provided');
}

/**
 * 创建子任务列表
 */
function createSubTasks(taskInfo: ArticleTaskInfo, page: Page): SubTask[] {
    const payload = taskInfo.payload;
    const taskType = deriveTaskType(payload);
    const parent_id = payload.rule_id;
    const account_id = taskInfo.account_id;
    const red_id = taskInfo.red_id;
    const trace_id = taskInfo.trace_id;
    const penetrate = taskInfo.penetrate;
    
    switch (taskType) {
        case 'author_and_keyword': {
            return payload.author_ids.map((authorId: string, index: number) => {
                const subTaskInfo: SubTask = {
                    id: getTaskId(),
                    account_id,
                    limit: 0,
                    likes: payload.likes,
                    retry_count: 0,
                    publish_time: payload.publish_time,
                    red_id,
                    parent_id,
                    type: taskType,
                    keywords: payload.keywords,
                    authorId,
                    comments: payload.comments,
                    ai_prompt: payload.ai_prompt,
                    index,
                    success: false,
                    error: '',
                    trace_id,
                    penetrate
                };
                return {
                    ...subTaskInfo,
                    handler: new UserAndKeywordHandler(page, subTaskInfo)
                };
            });
        }
        case 'only_author': {
            return payload.author_ids.map((authorId: string, index: number) => {
                const subTaskInfo: SubTask = {
                    id: getTaskId(),
                    account_id,
                    limit: 0,
                    retry_count: 0,
                    likes: payload.likes,
                    publish_time: payload.publish_time,
                    red_id,
                    parent_id,
                    keywords: [''],
                    type: taskType,
                    comments: payload.comments,
                    ai_prompt: payload.ai_prompt,
                    authorId,
                    index,
                    success: false,
                    error: '',
                    trace_id,
                    penetrate
                };
                return {
                    ...subTaskInfo,
                    handler: new UserAndKeywordHandler(page, subTaskInfo)
                };
            });
        }
        case 'only_keyword': {
            return payload.keywords.map((keyword: string, index: number) => {
                const subTaskInfo: SubTask = {
                    id: getTaskId(),
                    account_id,
                    red_id,
                    retry_count: 0,
                    limit: 200,
                    likes: payload.likes,
                    publish_time: payload.publish_time,
                    parent_id,
                    type: taskType,
                    keywords: [keyword],
                    keyword,
                    comments: payload.comments,
                    ai_prompt: payload.ai_prompt,
                    success: false,
                    error: '',
                    index,
                    trace_id,
                    penetrate
                };
                return {
                    ...subTaskInfo,
                    handler: new OnlyKeywordHandler(subTaskInfo)
                };
            });
        }
    }
}

/**
 * 获取子任务的对外接口
 */
function getSubTasks(taskInfo: ArticleTaskInfo, page: Page): SubTask[] {
    return createSubTasks(taskInfo, page);
}

/**
 * 处理任务完成逻辑
 */
function handleTaskCompletion(accountId: string, isTimeout: boolean = false) {
    // 清除超时定时器
    if (accountTimeoutMap.has(accountId)) {
        clearTimeout(accountTimeoutMap.get(accountId));
        accountTimeoutMap.delete(accountId);
    }

    // 获取任务信息
    const currentTaskInfo = accountArticleTaskInfoMap.get(accountId);
    if (!currentTaskInfo) {
        console.error(`handleTaskCompletion:未找到账号对应的任务信息: ${accountId}`);
        return;
    }

    const page = accountPageMap.get(accountId);
    if (!page) {
        console.error(`handleTaskCompletion:未找到账号对应的页面: ${accountId}`);
        return;
    }

    // 记录任务完成原因
    if (isTimeout) {
        console.info(`handleTaskCompletion:任务执行超时,自动完成: ${accountId}`);
    } else {
        console.info(`handleTaskCompletion:所有子任务执行完毕: ${accountId}`);
    }
    
    // 上报任务成功
    reportTaskExeSuccessNow(
        currentTaskInfo.account_id, 
        currentTaskInfo.red_id, 
        currentTaskInfo.penetrate, 
        currentTaskInfo.trace_id, 
        currentTaskInfo.command, 
        isTimeout ? '任务执行超时，自动完成' : '', 
        ''
    );
    
    // 清理资源
    accountArticleTaskInfoMap.delete(accountId);
    accountSubTasksMap.delete(accountId);
    // 关闭并清理页面
    page.close().catch(err => {
        console.error(`handleTaskCompletion:关闭页面失败: ${accountId}`, err);
    });
    accountPageMap.delete(accountId);
}

/**
 * 模拟上报函数（需要根据实际情况实现）
 */
function reportTaskExeSuccessNow(
    accountId: string, 
    redId: string, 
    penetrate: string, 
    traceId: string, 
    command: string, 
    message: string, 
    data: string
) {
    console.info('Task Success:', { accountId, redId, penetrate, traceId, command, message, data });
    // 这里需要根据实际的上报系统实现
}

function reportTaskExeFailed(
    accountId: string, 
    redId: string, 
    penetrate: string, 
    traceId: string, 
    command: string, 
    error: string, 
    data: string
) {
    console.error('Task Failed:', { accountId, redId, penetrate, traceId, command, error, data });
    // 这里需要根据实际的上报系统实现
}

/**
 * 主函数：根据taskInfo执行采集任务
 */
export const collectArticle = async (taskInfo: ArticleTaskInfo): Promise<boolean> => {
    try {
        // 深拷贝任务信息
        const taskInfoCopy = JSON.parse(JSON.stringify(taskInfo));
        
        // 将当前任务信息存储到全局Map中，以账号ID为键
        accountArticleTaskInfoMap.set(taskInfoCopy.account_id, taskInfoCopy);
        
        console.info(`collectArticle-taskInfo: ${taskInfoCopy.account_id}`, taskInfoCopy);
        
        // 创建 Playwright 浏览器页面
        const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // 存储页面对象
        accountPageMap.set(taskInfoCopy.account_id, page);
        
        const subTasks = getSubTasks(taskInfoCopy, page);
        accountSubTasksMap.set(taskInfoCopy.account_id, {
            subTasks,
            currentIndex: 0
        });
        
        if (!subTasks.length) {
            console.error(`collectArticle:subTasks为空: ${taskInfoCopy.account_id}`);
            return false;
        }
        
        // 设置任务超时处理
        if (accountTimeoutMap.has(taskInfoCopy.account_id)) {
            clearTimeout(accountTimeoutMap.get(taskInfoCopy.account_id));
        }
        
        // 创建新的超时定时器
        const timeout = setTimeout(() => {
            // 检查任务是否仍在进行中
            if (accountArticleTaskInfoMap.has(taskInfoCopy.account_id)) {
                console.warn(`任务执行超时(${TASK_TIMEOUT}ms)，自动完成: ${taskInfoCopy.account_id}`);
                handleTaskCompletion(taskInfoCopy.account_id, true);
            }
        }, TASK_TIMEOUT);
        
        // 存储超时定时器
        accountTimeoutMap.set(taskInfoCopy.account_id, timeout);
        
        // 开始任务，加载初始页面
        await page.goto('https://www.xiaohongshu.com/explore');
        
        // 开始执行子任务
        await executeSubTasksSequentially(taskInfoCopy.account_id);
        
        return true;
    } catch (error) {
        console.error(`collectArticle 执行失败:`, error);
        return false;
    }
};

/**
 * 顺序执行子任务
 */
async function executeSubTasksSequentially(accountId: string) {
    const accountTasks = accountSubTasksMap.get(accountId);
    const page = accountPageMap.get(accountId);
    
    if (!accountTasks || !page) {
        console.error(`executeSubTasksSequentially: 未找到账号任务或页面: ${accountId}`);
        return;
    }
    
    const { subTasks } = accountTasks;
    let currentIndex = 0;
    
    while (currentIndex < subTasks.length) {
        const subTask = subTasks[currentIndex];
        subTask.retry_count++;
        
        console.info(`执行子任务 ${currentIndex + 1}/${subTasks.length}:`, {
            accountId,
            taskId: subTask.id,
            type: subTask.type,
            retryCount: subTask.retry_count
        });
        
        // 执行子任务
        try {
            if (subTask.handler) {
                await subTask.handler.execute();
                console.info(`子任务执行成功，进入下一个: ${currentIndex + 1}/${subTasks.length}`);
                subTask.success = true;
                currentIndex++;
            } else {
                throw new Error('子任务处理器未初始化');
            }
        } catch (error) {
            console.error(`子任务执行失败: ${error.message}`);
            subTask.error = error.message || '未知错误';
            
            // 检查重试次数
            if (subTask.retry_count >= 3) {
                console.warn(`子任务重试次数已达上限，跳过: ${subTask.id}`);
                currentIndex++;
            } else {
                console.info(`准备重试子任务: ${subTask.id}, 重试次数: ${subTask.retry_count}`);
                // 重试前等待一段时间
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // 更新任务状态
        accountSubTasksMap.set(accountId, {
            subTasks,
            currentIndex
        });
        
        // 检查是否还有任务在进行中
        if (!accountArticleTaskInfoMap.has(accountId)) {
            console.info(`任务已被外部终止: ${accountId}`);
            break;
        }
    }
    
    // 所有子任务执行完毕
    console.info(`所有子任务执行完毕: ${accountId}`);
    handleTaskCompletion(accountId);
}
