/**
 * 远程控制功能使用示例
 * 
 * 此文件展示了如何在 Electron 主进程中使用远程控制功能
 */

import { RemoteControlManager } from './remoteControlManager.js';

/**
 * 基本使用示例
 */
export async function basicExample() {
    // 创建远程控制管理器
    const remoteControl = new RemoteControlManager({
        signalServerUrl: 'wss://your-signal-server.com',
        onError: (error) => {
            console.error('远程控制错误:', error);
        },
        onConnectionStateChange: (state) => {
            console.log('连接状态变化:', state);
        },
        onStarted: () => {
            console.log('远程控制已启动');
        },
        onStopped: () => {
            console.log('远程控制已停止');
        }
    });

    try {
        // 启动远程控制
        await remoteControl.startRemoteControl();
        console.log('远程控制启动成功');

        // 获取状态
        const status = remoteControl.getStatus();
        console.log('当前状态:', status);

        // 等待一段时间...
        await new Promise(resolve => setTimeout(resolve, 30000));

        // 停止远程控制
        await remoteControl.stopRemoteControl();
        console.log('远程控制已停止');

    } catch (error) {
        console.error('操作失败:', error);
    }
}

/**
 * 鼠标控制示例
 */
export async function mouseControlExample() {
    const remoteControl = new RemoteControlManager({
        signalServerUrl: 'wss://your-signal-server.com'
    });

    try {
        await remoteControl.startRemoteControl();

        // 等待连接建立
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 获取当前鼠标位置
        const currentPos = await remoteControl.getCurrentMousePosition();
        console.log('当前鼠标位置:', currentPos);

        // 移动鼠标
        await remoteControl.executeMouseAction({
            type: 'move',
            x: 500,
            y: 300
        });

        // 点击鼠标
        await remoteControl.executeMouseAction({
            type: 'click',
            x: 500,
            y: 300,
            button: 'left'
        });

        // 双击
        await remoteControl.executeMouseAction({
            type: 'doubleClick',
            x: 600,
            y: 400,
            button: 'left'
        });

        // 拖拽
        await remoteControl.executeMouseAction({
            type: 'drag',
            x: 100,
            y: 100,
            endX: 200,
            endY: 200,
            button: 'left'
        });

        await remoteControl.stopRemoteControl();

    } catch (error) {
        console.error('鼠标控制示例失败:', error);
    }
}

/**
 * 渲染进程中的使用示例 (在前端 React/Vue 等组件中使用)
 */
export const rendererExample = `
// 在渲染进程的 React 组件中使用
import React, { useEffect, useState } from 'react';

function RemoteControlComponent() {
    const [isActive, setIsActive] = useState(false);
    const [connectionState, setConnectionState] = useState('disconnected');

    useEffect(() => {
        // 监听远程控制事件
        window.electronAPI.onRemoteControlStarted(() => {
            setIsActive(true);
            console.log('远程控制已启动');
        });

        window.electronAPI.onRemoteControlStopped(() => {
            setIsActive(false);
            console.log('远程控制已停止');
        });

        window.electronAPI.onRemoteControlConnectionState((state) => {
            setConnectionState(state);
            console.log('连接状态:', state);
        });

        window.electronAPI.onRemoteControlError((error) => {
            console.error('远程控制错误:', error);
        });

        return () => {
            // 清理监听器
        };
    }, []);

    const startRemoteControl = async () => {
        try {
            const result = await window.electronAPI.startRemoteControl({
                signalServerUrl: 'wss://your-signal-server.com'
            });
            
            if (result.success) {
                console.log('远程控制启动成功');
            } else {
                console.error('启动失败:', result.error);
            }
        } catch (error) {
            console.error('启动远程控制失败:', error);
        }
    };

    const stopRemoteControl = async () => {
        try {
            const result = await window.electronAPI.stopRemoteControl();
            
            if (result.success) {
                console.log('远程控制停止成功');
            } else {
                console.error('停止失败:', result.error);
            }
        } catch (error) {
            console.error('停止远程控制失败:', error);
        }
    };

    const getStatus = async () => {
        try {
            const status = await window.electronAPI.getRemoteControlStatus();
            console.log('状态:', status);
        } catch (error) {
            console.error('获取状态失败:', error);
        }
    };

    const testMouseClick = async () => {
        try {
            const result = await window.electronAPI.executeMouseAction({
                type: 'click',
                x: 500,
                y: 300,
                button: 'left'
            });
            
            if (result.success) {
                console.log('鼠标点击成功');
            } else {
                console.error('鼠标点击失败:', result.error);
            }
        } catch (error) {
            console.error('执行鼠标操作失败:', error);
        }
    };

    return (
        <div>
            <h2>远程控制</h2>
            <p>状态: {isActive ? '运行中' : '已停止'}</p>
            <p>连接状态: {connectionState}</p>
            
            <button onClick={startRemoteControl} disabled={isActive}>
                启动远程控制
            </button>
            
            <button onClick={stopRemoteControl} disabled={!isActive}>
                停止远程控制
            </button>
            
            <button onClick={getStatus}>
                获取状态
            </button>
            
            <button onClick={testMouseClick} disabled={!isActive}>
                测试鼠标点击
            </button>
        </div>
    );
}

export default RemoteControlComponent;
`;

/**
 * 信令服务器示例 (Node.js WebSocket 服务器)
 */
export const signalServerExample = `
// 简单的信令服务器示例 (signal-server.js)
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const clients = new Map();

wss.on('connection', (ws) => {
    const clientId = generateClientId();
    clients.set(clientId, ws);
    
    console.log('客户端连接:', clientId);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // 转发信令消息给其他客户端
            clients.forEach((client, id) => {
                if (id !== clientId && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
            
        } catch (error) {
            console.error('解析消息失败:', error);
        }
    });
    
    ws.on('close', () => {
        clients.delete(clientId);
        console.log('客户端断开:', clientId);
    });
});

function generateClientId() {
    return Math.random().toString(36).substring(2, 15);
}

console.log('信令服务器运行在 ws://localhost:8080');
`;

console.log('远程控制功能示例已准备完成！');
console.log('1. 使用 basicExample() 进行基本测试');
console.log('2. 使用 mouseControlExample() 测试鼠标控制');
console.log('3. 在渲染进程中参考 rendererExample');
console.log('4. 设置信令服务器参考 signalServerExample'); 