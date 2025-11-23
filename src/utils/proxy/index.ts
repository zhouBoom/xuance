import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { apiRequest } from '../../api/request';

// const authKey = 'E9UR3AZO';
// const password = '483141B0AEB1';
const authKey = 'D1NFI6BU';
const password = 'E8948E11409A';

interface IpCache {
    ip: string;
    expireTime: number;
}

let ipCache: IpCache | null = null;
const CACHE_DURATION = (4 * 60 + 55) * 1000; // 55秒，留5秒余量
let failCount = 0;
let latestProxyIpTime = 0;
let addNumber = 0;

let lastProxyRequestTime = 0;
let lastProxyResult: string | null = null;
let pendingProxyRequest: Promise<string> | null = null;

// 余额检查相关变量
let lastBalanceCheckTime = 0;
const BALANCE_CHECK_INTERVAL = 3 * 60 * 60 * 1000; // 3小时
const BALANCE_THRESHOLD = 5000; // 余额阈值

const getProxyIpInfo = async (): Promise<string> => {
    const now = Date.now();
    
    // 返回10秒内的缓存结果
    if (lastProxyResult && now - lastProxyRequestTime < 10000) {
        return lastProxyResult;
    }
    
    // 如果已有正在进行的请求，直接返回该Promise
    if (pendingProxyRequest) {
        return pendingProxyRequest;
    }
    
    // 创建新的请求并缓存
    pendingProxyRequest = (async () => {
        try {
            latestProxyIpTime = Date.now();
            const response = await axios.get(`https://share.proxy.qg.net/get?key=${authKey}&pwd=${password}`);
            const result = response.data.data[0].server;
            lastProxyResult = result;
            lastProxyRequestTime = Date.now();
            return result;
        } finally {
            pendingProxyRequest = null;
        }
    })();

    return pendingProxyRequest;
}

const getProxyAgent = async (): Promise<HttpsProxyAgent<any>> => {
    const now = Date.now();
    
    // 在获取代理时自动检查余额（异步执行，不阻塞主流程）
    checkBalance().catch(error => {
        Logger.error('自动余额检查失败:', error);
    });
    
    // 如果缓存存在且未过期，直接使用缓存的IP
    if (ipCache && now < ipCache.expireTime) {
        return new HttpsProxyAgent(`http://${authKey}:${password}@${ipCache.ip}`);
    }

    // 获取新的IP并更新缓存
    const ipInfo = await getProxyIpInfo();
    ipCache = {
        ip: ipInfo,
        expireTime: now + CACHE_DURATION
    };
    Logger.info('获取代理IP成功:', ipInfo);
    return new HttpsProxyAgent(`http://${authKey}:${password}@${ipInfo}`);
}

const downloadImageWithProxy = async (imageUrl: string): Promise<string> => {
    try {
        const agent = await getProxyAgent();
        const response = await axios.request({
            url: imageUrl,
            method: 'GET',
            responseType: 'stream',
            httpsAgent: agent
        });
        failCount = 0;
        addNumber = 0;
        return await saveImageToTemp(response, imageUrl);
    } catch (error) {
        failCount++;
        if(addNumber > 10){
            Logger.warn('连续超过10次重试获取代理ip都无效，放弃')
            return;
        }
         // 连续10次下载失败的情况下，自动切换IP地址，但1分钟最多切换一次
        if(failCount >= 10 && Date.now() >= latestProxyIpTime + addNumber * 60 * 1000 ){
            addNumber++;
            ipCache.expireTime = 0;
            failCount = 0;
            Logger.warn('改变变量，下次重新获取代理IP')
        }
        Logger.warn('代理下载失败，尝试直接下载:', error);
        // 降级为直接下载
        const response = await axios.request({
            url: imageUrl,
            method: 'GET',
            responseType: 'stream'
        });
        return await saveImageToTemp(response, imageUrl);
    }
}

// 抽取保存图片的逻辑为独立函数
const saveImageToTemp = async (response: any, imageUrl: string): Promise<string> => {
    // 创建临时文件路径
    const tempDir = path.join(os.tmpdir(), 'xuance-images');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}${path.extname(imageUrl) || '.jpg'}`;
    const localPath = path.join(tempDir, fileName);

    // 将图片保存到临时文件
    await new Promise<void>((resolve, reject) => {
        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);
        writer.on('finish', () => resolve());
        writer.on('error', reject);
    });
    Logger.info('下载图片成功:', localPath);
    return localPath;
}

// 检查余额的函数
const checkBalance = async (): Promise<void> => {
    const now = Date.now();
    
    // 检查是否满足24小时间隔
    if (now - lastBalanceCheckTime < BALANCE_CHECK_INTERVAL) {
        const remainingTime = BALANCE_CHECK_INTERVAL - (now - lastBalanceCheckTime);
        const remainingHours = Math.ceil(remainingTime / (60 * 60 * 1000));
        Logger.info(`余额检查未到间隔时间，还需等待约 ${remainingHours} 小时`);
        return;
    }
    
    try {
        const response = await axios.get(`https://share.proxy.qg.net/balance?key=${authKey}`);
        const result = response.data;
        
        if (result.code === 'SUCCESS') {
            const balance = result.data.balance;
            Logger.info(`代理余额检查成功: ${balance}`);
            
            // 如果余额低于阈值，发送通知
            if (balance < BALANCE_THRESHOLD) {
                Logger.warn(`⚠️ 代理余额不足警告: 当前余额 ${balance}，低于阈值 ${BALANCE_THRESHOLD}`);
                apiRequest.sendNotice(['211513'],`🚨 紧急提醒：代理服务余额不足！当前余额：${balance}，请及时充值！`);
                // 这里可以添加其他通知方式，比如发送邮件、企业微信等
                // 目前先使用Logger记录
                Logger.error(`🚨 紧急提醒：代理服务余额不足！当前余额：${balance}，请及时充值！`);
            } else {
                Logger.info(`✅ 代理余额充足: ${balance}`);
            }
            
            // 更新最后检查时间
            lastBalanceCheckTime = now;
        } else {
            Logger.error('余额检查失败:', result);
        }
    } catch (error) {
        Logger.error('余额检查请求失败:', error);
    }
};


// downloadImageWithProxy('https://static0.xesimg.com/udc-s-wx-common/wecom-tool/1735108735871_5j8p35.jpg').then(res => {
//     Logger.info('下载图片成功:', res);
// }).catch(err => {
//     Logger.error('下载图片失败:', err);
// })

// 测试余额检查功能
// checkBalance().then(() => {
//     Logger.info('余额检查完成');
// }).catch(err => {
//     Logger.error('余额检查失败:', err);
// });

// 强制测试余额检查（忽略24小时限制）
// testBalanceCheck(true).then(() => {
//     Logger.info('强制余额检查完成');
// }).catch(err => {
//     Logger.error('强制余额检查失败:', err);
// });

export { getProxyAgent, downloadImageWithProxy };
