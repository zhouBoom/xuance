import * as koffi from 'koffi';
import { Logger } from '../utils/logger';
import { ffiTypes } from '../utils/os/ffi-types';


let user32: any, SetCursorPos: any, mouse_event: any, GetCursorPos: any, GetSystemMetrics: any, POINT: any;

if (process.platform === 'win32') {
  user32 = koffi.load('user32.dll');
  ffiTypes.init();
  POINT = ffiTypes.POINT;
  SetCursorPos = user32.func('bool SetCursorPos(int X, int Y)');
  mouse_event = user32.func('void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, uintptr dwExtraInfo)');
  GetCursorPos = user32.func('bool GetCursorPos(POINT* lpPoint)');
  GetSystemMetrics = user32.func('int GetSystemMetrics(int nIndex)');
} else {
  // 可以写一些兼容代码，或者直接提示
  console.warn('当前平台不支持 user32.dll 相关的鼠标控制功能');
}

// 鼠标事件常量
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_ABSOLUTE = 0x8000;

// 系统度量常量
const SM_CXSCREEN = 0;  // 屏幕宽度
const SM_CYSCREEN = 1;  // 屏幕高度

interface MousePosition {
    x: number;
    y: number;
}

export type MouseButton = 'left' | 'right' | 'middle';

export class MouseController {
    private screenWidth: number;
    private screenHeight: number;

    constructor() {
        // 获取屏幕分辨率
        this.screenWidth = GetSystemMetrics(SM_CXSCREEN);
        this.screenHeight = GetSystemMetrics(SM_CYSCREEN);
        // Logger.info(`屏幕分辨率: ${this.screenWidth}x${this.screenHeight}`); // Logger is removed
    }

    /**
     * 移动鼠标到指定位置
     * @param x X 坐标
     * @param y Y 坐标
     */
    async moveMouse(x: number, y: number): Promise<void> {
        try {
            // 确保坐标在屏幕范围内
            const clampedX = Math.max(0, Math.min(x, this.screenWidth - 1));
            const clampedY = Math.max(0, Math.min(y, this.screenHeight - 1));

            const result = SetCursorPos(clampedX, clampedY);
            
            if (!result) {
                throw new Error(`移动鼠标失败: 目标位置 (${clampedX}, ${clampedY})`);
            }

            // Logger.debug(`鼠标移动到: (${clampedX}, ${clampedY})`); // Logger is removed
        } catch (error) {
            // Logger.error('移动鼠标失败:', error); // Logger is removed
            throw error;
        }
    }

    /**
     * 在指定位置点击鼠标
     * @param x X 坐标
     * @param y Y 坐标  
     * @param button 鼠标按钮类型
     */
    async clickMouse(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
        try {
            // 先移动鼠标到目标位置
            await this.moveMouse(x, y);

            // 等待一小段时间确保鼠标移动完成
            await this.sleep(10);

            // 执行点击
            await this.performClick(button);

            // Logger.debug(`在位置 (${x}, ${y}) 执行 ${button} 点击`); // Logger is removed
        } catch (error) {
            // Logger.error('点击鼠标失败:', error); // Logger is removed
            throw error;
        }
    }

    /**
     * 执行鼠标点击（按下+释放）
     * @param button 鼠标按钮类型
     */
    private async performClick(button: MouseButton): Promise<void> {
        const { downFlag, upFlag } = this.getMouseFlags(button);
        
        try {
            // 按下鼠标按钮
            mouse_event(downFlag, 0, 0, 0, 0);
            
            // 短暂延迟模拟真实点击
            await this.sleep(50);
            
            // 释放鼠标按钮
            mouse_event(upFlag, 0, 0, 0, 0);
            
        } catch (error) {
            // Logger.error(`执行 ${button} 点击失败:`, error); // Logger is removed
            throw error;
        }
    }

    /**
     * 执行鼠标双击
     * @param x X 坐标
     * @param y Y 坐标
     * @param button 鼠标按钮类型
     */
    async doubleClick(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
        try {
            await this.clickMouse(x, y, button);
            await this.sleep(100);
            await this.clickMouse(x, y, button);
            
            // Logger.debug(`在位置 (${x}, ${y}) 执行 ${button} 双击`); // Logger is removed
        } catch (error) {
            // Logger.error('双击鼠标失败:', error); // Logger is removed
            throw error;
        }
    }

    /**
     * 按下鼠标按钮（不释放）
     * @param x X 坐标
     * @param y Y 坐标
     * @param button 鼠标按钮类型
     */
    async mouseDown(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
        try {
            await this.moveMouse(x, y);
            await this.sleep(10);
            
            const { downFlag } = this.getMouseFlags(button);
            mouse_event(downFlag, 0, 0, 0, 0);
            
            // Logger.debug(`在位置 (${x}, ${y}) 按下 ${button} 按钮`); // Logger is removed
        } catch (error) {
            // Logger.error('按下鼠标失败:', error); // Logger is removed
            throw error;
        }
    }

    /**
     * 释放鼠标按钮
     * @param x X 坐标  
     * @param y Y 坐标
     * @param button 鼠标按钮类型
     */
    async mouseUp(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
        try {
            await this.moveMouse(x, y);
            await this.sleep(10);
            
            const { upFlag } = this.getMouseFlags(button);
            mouse_event(upFlag, 0, 0, 0, 0);
            
            // Logger.debug(`在位置 (${x}, ${y}) 释放 ${button} 按钮`); // Logger is removed
        } catch (error) {
            // Logger.error('释放鼠标失败:', error); // Logger is removed
            throw error;
        }
    }

    /**
     * 获取当前鼠标位置
     */
    async getCurrentPosition(): Promise<MousePosition> {
        try {
            const point: any = {};
            const result = GetCursorPos(point);
            
            if (!result) {
                throw new Error('获取鼠标位置失败');
            }
            
            return { x: point.x, y: point.y };
        } catch (error) {
            // Logger.error('获取鼠标位置失败:', error); // Logger is removed
            throw error;
        }
    }

    /**
     * 鼠标拖拽操作
     * @param startX 起始 X 坐标
     * @param startY 起始 Y 坐标
     * @param endX 结束 X 坐标
     * @param endY 结束 Y 坐标
     * @param button 鼠标按钮类型
     */
    async dragMouse(
        startX: number, 
        startY: number, 
        endX: number, 
        endY: number, 
        button: MouseButton = 'left'
    ): Promise<void> {
        try {
            // 移动到起始位置并按下鼠标
            await this.mouseDown(startX, startY, button);
            
            // 插值移动到结束位置
            const steps = 20;
            for (let i = 1; i <= steps; i++) {
                const progress = i / steps;
                const currentX = Math.round(startX + (endX - startX) * progress);
                const currentY = Math.round(startY + (endY - startY) * progress);
                
                await this.moveMouse(currentX, currentY);
                await this.sleep(20);
            }
            
            // 释放鼠标
            await this.mouseUp(endX, endY, button);
            
            // Logger.debug(`拖拽鼠标从 (${startX}, ${startY}) 到 (${endX}, ${endY})`); // Logger is removed
        } catch (error) {
            // Logger.error('拖拽鼠标失败:', error); // Logger is removed
            throw error;
        }
    }

    /**
     * 获取鼠标按钮对应的标志位
     * @param button 鼠标按钮类型
     */
    private getMouseFlags(button: MouseButton): { downFlag: number; upFlag: number } {
        switch (button) {
            case 'left':
                return { downFlag: MOUSEEVENTF_LEFTDOWN, upFlag: MOUSEEVENTF_LEFTUP };
            case 'right':
                return { downFlag: MOUSEEVENTF_RIGHTDOWN, upFlag: MOUSEEVENTF_RIGHTUP };
            case 'middle':
                return { downFlag: MOUSEEVENTF_MIDDLEDOWN, upFlag: MOUSEEVENTF_MIDDLEUP };
            default:
                throw new Error(`不支持的鼠标按钮类型: ${button}`);
        }
    }

    /**
     * 延迟函数
     * @param ms 毫秒数
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 获取屏幕分辨率
     */
    getScreenResolution(): { width: number; height: number } {
        return {
            width: this.screenWidth,
            height: this.screenHeight
        };
    }

    /**
     * 验证坐标是否在屏幕范围内
     * @param x X 坐标
     * @param y Y 坐标
     */
    isValidCoordinate(x: number, y: number): boolean {
        return x >= 0 && x < this.screenWidth && y >= 0 && y < this.screenHeight;
    }
} 