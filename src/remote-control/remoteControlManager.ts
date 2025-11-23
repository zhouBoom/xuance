import { ScreenShareManager } from './screenShare.js';
import { MouseController } from './mouseController.js';

interface RemoteControlConfig {
    signalServerUrl: string;
    onError?: (error: Error) => void;
    onConnectionStateChange?: (state: string) => void;
    onStarted?: () => void;
    onStopped?: () => void;
}

export class RemoteControlManager {
    private screenShareManager: ScreenShareManager | null = null;
    private mouseController: MouseController | null = null;
    private config: RemoteControlConfig;
    private isActive = false;

    constructor(config: RemoteControlConfig) {
        this.config = config;
    }

    /**
     * 启动远程控制（屏幕共享 + 鼠标控制）
     */
    async startRemoteControl(): Promise<void> {
        if (this.isActive) {
            Logger.warn('远程控制已经在运行中');
            return;
        }

        try {
            Logger.info('正在启动远程控制服务...');

            // 初始化鼠标控制器
            this.mouseController = new MouseController();
            Logger.info('鼠标控制器初始化完成');

            // 初始化屏幕共享管理器
            this.screenShareManager = new ScreenShareManager({
                signalServerUrl: this.config.signalServerUrl,
                onError: this.config.onError,
                onConnectionStateChange: (state) => {
                    Logger.info('WebRTC 连接状态:', state);
                    this.config.onConnectionStateChange?.(state);
                    
                    if (state === 'connected') {
                        Logger.info('远程控制连接建立成功');
                    } else if (state === 'disconnected' || state === 'failed') {
                        Logger.warn('远程控制连接中断');
                    }
                }
            });

            // 启动屏幕共享
            await this.screenShareManager.startScreenShare();

            this.isActive = true;
            this.config.onStarted?.();
            Logger.info('远程控制服务启动成功');

        } catch (error) {
            Logger.error('启动远程控制失败:', error);
            await this.cleanup();
            throw error;
        }
    }

    /**
     * 停止远程控制
     */
    async stopRemoteControl(): Promise<void> {
        if (!this.isActive) {
            Logger.warn('远程控制未在运行');
            return;
        }

        try {
            Logger.info('正在停止远程控制服务...');
            await this.cleanup();
            Logger.info('远程控制服务已停止');
        } catch (error) {
            Logger.error('停止远程控制失败:', error);
            throw error;
        }
    }

    /**
     * 清理资源
     */
    private async cleanup(): Promise<void> {
        this.isActive = false;

        // 停止屏幕共享
        if (this.screenShareManager) {
            try {
                await this.screenShareManager.stopScreenShare();
            } catch (error) {
                Logger.error('停止屏幕共享失败:', error);
            }
            this.screenShareManager = null;
        }

        // 清理鼠标控制器
        this.mouseController = null;

        this.config.onStopped?.();
    }

    /**
     * 获取当前状态
     */
    getStatus(): {
        isActive: boolean;
        screenResolution?: { width: number; height: number };
    } {
        return {
            isActive: this.isActive,
            screenResolution: this.mouseController?.getScreenResolution()
        };
    }

    /**
     * 手动执行鼠标操作（用于测试）
     */
    async executeMouseAction(action: {
        type: 'move' | 'click' | 'doubleClick' | 'drag';
        x: number;
        y: number;
        button?: 'left' | 'right' | 'middle';
        endX?: number;
        endY?: number;
    }): Promise<void> {
        if (!this.mouseController) {
            throw new Error('鼠标控制器未初始化');
        }

        try {
            switch (action.type) {
                case 'move':
                    await this.mouseController.moveMouse(action.x, action.y);
                    break;
                case 'click':
                    await this.mouseController.clickMouse(action.x, action.y, action.button);
                    break;
                case 'doubleClick':
                    await this.mouseController.doubleClick(action.x, action.y, action.button);
                    break;
                case 'drag':
                    if (action.endX !== undefined && action.endY !== undefined) {
                        await this.mouseController.dragMouse(
                            action.x, action.y, 
                            action.endX, action.endY, 
                            action.button
                        );
                    } else {
                        throw new Error('拖拽操作需要提供结束坐标');
                    }
                    break;
                default:
                    throw new Error(`不支持的鼠标操作类型: ${action.type}`);
            }
        } catch (error) {
            Logger.error('执行鼠标操作失败:', error);
            throw error;
        }
    }

    /**
     * 获取当前鼠标位置
     */
    async getCurrentMousePosition(): Promise<{ x: number; y: number }> {
        if (!this.mouseController) {
            throw new Error('鼠标控制器未初始化');
        }

        return await this.mouseController.getCurrentPosition();
    }

    /**
     * 验证坐标是否有效
     */
    isValidCoordinate(x: number, y: number): boolean {
        return this.mouseController?.isValidCoordinate(x, y) ?? false;
    }
} 