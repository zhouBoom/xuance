import { desktopCapturer } from 'electron';
import { getMainWindow } from '../main.js';
import { sendToRenderer } from '../account/ipc.js';

interface ScreenShareConfig {
    signalServerUrl: string;
    onError?: (error: Error) => void;
    onConnectionStateChange?: (state: string) => void;
}

export class ScreenShareManager {
    private config: ScreenShareConfig;
    private isActive = false;

    constructor(config: ScreenShareConfig) {
        this.config = config;
    }

    /**
     * 启动屏幕共享的主入口函数
     * 主进程负责获取屏幕源，渲染进程负责 WebRTC 连接
     */
    async startScreenShare(): Promise<void> {
        try {
            Logger.info('开始启动屏幕共享...');
            
            // 1. 获取屏幕源列表
            const sources = await this.getScreenSources();
            
            // 2. 通过 IPC 发送给渲染进程处理 WebRTC
            const mainWindow = getMainWindow();
            if (!mainWindow) {
                throw new Error('主窗口未初始化');
            }

            // 发送屏幕源和配置给渲染进程 - 只传递可序列化的属性
            sendToRenderer(mainWindow, 'screen-share:start', {
                sources: sources,
                config: {
                    signalServerUrl: this.config.signalServerUrl
                    // 只传递基本的字符串配置，避免传递函数引用
                }
            });

            this.isActive = true;
            Logger.info('屏幕共享启动请求已发送到渲染进程');
        } catch (error) {
            Logger.error('启动屏幕共享失败:', error);
            this.config.onError?.(error as Error);
            throw error;
        }
    }

    /**
     * 获取屏幕源列表（主进程 API）
     */
    private async getScreenSources(): Promise<any[]> {
        try {
            // 强制包含窗口源，并增加更多选项
            const sources = await desktopCapturer.getSources({
                types: ['screen', 'window'],  // 确保包含窗口
                thumbnailSize: { width: 150, height: 150 },
                fetchWindowIcons: true  // 获取窗口图标
            });

            if (sources.length === 0) {
                throw new Error('没有找到可用的屏幕源');
            }

            Logger.info(`找到 ${sources.length} 个屏幕源（包括显示器和窗口）`);
            
            // 分类显示找到的源，并显示详细信息
            const screenSources = sources.filter(s => s.id.startsWith('screen'));
            const windowSources = sources.filter(s => s.id.startsWith('window'));
            
            Logger.info(`- 显示器数量: ${screenSources.length}`);
            Logger.info(`- 窗口数量: ${windowSources.length}`);
            
            // 详细记录每个窗口
            Logger.info('🪟 可用窗口详情:');
            windowSources.forEach((source, index) => {
                Logger.info(`  ${index}: ${source.name} (ID: ${source.id})`);
            });
            
            // 只传递必要的属性，避免序列化问题
            return sources.map(source => ({
                id: source.id,
                name: source.name,
                type: source.id.startsWith('screen') ? 'screen' : 'window',  // 添加类型标识
                appIcon: source.appIcon ? 'present' : 'none'  // 标记是否有图标
                // 移除 thumbnail 以避免序列化错误
            }));
        } catch (error) {
            Logger.error('获取屏幕源失败:', error);
            throw error;
        }
    }

    /**
     * 处理来自渲染进程的鼠标事件
     */
    async handleMouseEvent(event: any): Promise<void> {
        try {
            // 导入鼠标控制器并执行操作
            const { MouseController } = await import('./mouseController.js');
            const mouseController = new MouseController();

            switch (event.type) {
                case 'move':
                    await mouseController.moveMouse(event.x, event.y);
                    break;
                case 'click':
                    await mouseController.clickMouse(event.x, event.y, event.button || 'left');
                    break;
                case 'doubleClick':
                    await mouseController.doubleClick(event.x, event.y, event.button || 'left');
                    break;
                case 'drag':
                    if (event.endX !== undefined && event.endY !== undefined) {
                        await mouseController.dragMouse(
                            event.x, event.y,
                            event.endX, event.endY,
                            event.button || 'left'
                        );
                    }
                    break;
                default:
                    Logger.warn('未知的鼠标事件类型:', event.type);
            }
        } catch (error) {
            Logger.error('处理鼠标事件失败:', error);
        }
    }

    /**
     * 停止屏幕共享
     */
    async stopScreenShare(): Promise<void> {
        try {
            if (!this.isActive) {
                return;
            }

            // 通知渲染进程停止屏幕共享
            const mainWindow = getMainWindow();
            if (mainWindow) {
                sendToRenderer(mainWindow, 'screen-share:stop', {});
            }

            this.isActive = false;
            Logger.info('屏幕共享已停止');
        } catch (error) {
            Logger.error('停止屏幕共享失败:', error);
            throw error;
        }
    }

    /**
     * 获取状态
     */
    isScreenShareActive(): boolean {
        return this.isActive;
    }
} 