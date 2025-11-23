import { WsConnectionConfig, ReconnectConfig, HeartbeatConfig } from './types';
import { getOsVersion } from '../../utils/os';
// 导入项目包信息
import packageInfo from '../../../package.json';

// 默认WebSocket连接配置
export const DEFAULT_WS_CONFIG: WsConnectionConfig = {
    baseUrl: process.env.WS_URL || 'wss://openwechat.100tal.com/bfwebsocket/ws',
    appVersion: packageInfo.version,
    appVc: 1,
    osVersion: getOsVersion(), // 使用动态获取的OS版本
    appType: 2,
    signatureVersion: '20210111'
};

// 默认重连配置
export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
    maxAttempts: 500,       // 从10次降到5次，减少过多重连尝试
    maxTimeout: 180000,   // 从120秒增加到180秒，增大最大重连间隔
    baseTimeout: 5000     // 从3秒增加到5秒，增大基础重连间隔
};

// 默认心跳检测配置
export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
    pingInterval: 30000,  // 从10秒增加到30秒
    pongTimeout: 90000,   // 从60秒增加到90秒
    reconnectDelay: 5000  // 从3秒增加到5秒
};

// 备用WebSocket URL - 取消注释并正确配置备用服务器
export const FALLBACK_URLS: string[] = [
    // 'wss://backup-openwechat.100tal.com/bfwebsocket/ws',
    // 'wss://alternate-openwechat.100tal.com/bfwebsocket/ws',
    // 'wss://openwechat.100tal.com/bfwebsocket/ws' // 确保非测试环境URL也在备用列表中
]; 