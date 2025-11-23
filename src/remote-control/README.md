# 远程控制功能

为 Electron 应用添加「屏幕共享 + 远程鼠标控制」功能的完整实现。

## 功能特性

- ✅ 使用 `desktopCapturer.getSources` + `getUserMedia` 捕获主屏幕
- ✅ 创建 `RTCPeerConnection` 进行屏幕流传输  
- ✅ 建立 `DataChannel` 接收远端 JSON 格式的鼠标事件 (`move`/`click`)
- ✅ 使用 `koffi` 调用 Windows API 实现桌面鼠标控制
- ✅ 通过 `WebSocket` 进行信令服务器通信
- ✅ 完整的 IPC 通信接口，支持渲染进程调用

## 文件结构

```
src/remote-control/
├── screenShare.ts          # 屏幕共享管理器
├── mouseController.ts      # 鼠标控制器（基于 koffi）
├── remoteControlManager.ts # 远程控制统一管理器
├── example.ts             # 使用示例
└── README.md              # 说明文档
```

## 核心类说明

### 1. ScreenShareManager

**主要功能：**
- `startScreenShare()` - 启动屏幕共享主入口
- `handleSignal(msg)` - 信令处理函数  
- `setupRobotChannel(dc)` - 数据通道消费函数

**工作流程：**
1. 使用 `desktopCapturer.getSources` 获取屏幕源
2. 通过 `getUserMedia` 捕获屏幕为 `MediaStream`
3. 创建 `RTCPeerConnection` 并添加屏幕流
4. 建立 `DataChannel` 用于接收鼠标事件
5. 连接 WebSocket 信令服务器
6. 创建并发送 SDP Offer

### 2. MouseController

**主要功能：**
- `moveMouse(x, y)` - 移动鼠标到指定位置
- `clickMouse(x, y, button)` - 在指定位置点击鼠标
- `doubleClick(x, y, button)` - 双击鼠标
- `dragMouse(startX, startY, endX, endY, button)` - 拖拽操作

**技术实现：**
- 使用 `koffi` 库调用 Windows API
- 支持的 API：`SetCursorPos`, `mouse_event`, `GetCursorPos`, `GetSystemMetrics`
- 自动获取屏幕分辨率并进行坐标范围检查

### 3. RemoteControlManager

统一管理屏幕共享和鼠标控制，提供高级 API 接口。

## 使用方法

### 1. 在主进程中使用

```typescript
import { RemoteControlManager } from './remote-control/remoteControlManager.js';

const remoteControl = new RemoteControlManager({
    signalServerUrl: 'wss://your-signal-server.com',
    onError: (error) => console.error('错误:', error),
    onConnectionStateChange: (state) => console.log('连接状态:', state),
    onStarted: () => console.log('已启动'),
    onStopped: () => console.log('已停止')
});

// 启动远程控制
await remoteControl.startRemoteControl();

// 停止远程控制  
await remoteControl.stopRemoteControl();
```

### 2. 在渲染进程中使用

```typescript
// 启动远程控制
const result = await window.electronAPI.startRemoteControl({
    signalServerUrl: 'wss://your-signal-server.com'
});

// 停止远程控制
await window.electronAPI.stopRemoteControl();

// 获取状态
const status = await window.electronAPI.getRemoteControlStatus();

// 执行鼠标操作
await window.electronAPI.executeMouseAction({
    type: 'click',
    x: 500,
    y: 300,
    button: 'left'
});

// 监听事件
window.electronAPI.onRemoteControlStarted(() => {
    console.log('远程控制已启动');
});

window.electronAPI.onRemoteControlConnectionState((state) => {
    console.log('连接状态:', state);
});
```

## IPC API 接口

### 渲染进程 → 主进程

- `startRemoteControl(config)` - 启动远程控制
- `stopRemoteControl()` - 停止远程控制  
- `getRemoteControlStatus()` - 获取状态
- `executeMouseAction(action)` - 执行鼠标操作
- `getCurrentMousePosition()` - 获取当前鼠标位置

### 主进程 → 渲染进程

- `remote-control:started` - 远程控制已启动
- `remote-control:stopped` - 远程控制已停止
- `remote-control:error` - 错误事件  
- `remote-control:connection-state` - 连接状态变化

## 鼠标事件格式

通过 DataChannel 接收的 JSON 格式鼠标事件：

```json
// 移动鼠标
{
    "type": "move",
    "x": 500,
    "y": 300
}

// 点击鼠标
{
    "type": "click", 
    "x": 500,
    "y": 300,
    "button": "left"  // "left" | "right" | "middle"
}
```

## 信令服务器

需要一个 WebSocket 信令服务器来交换 SDP 和 ICE 候选。简单示例：

```javascript
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const clients = new Map();

wss.on('connection', (ws) => {
    const clientId = generateClientId();
    clients.set(clientId, ws);
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        // 转发信令消息给其他客户端
        clients.forEach((client, id) => {
            if (id !== clientId && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    });
    
    ws.on('close', () => {
        clients.delete(clientId);
    });
});
```

## 注意事项

1. **权限要求：** 需要屏幕录制权限，在 macOS 上需要用户授权
2. **网络环境：** 在 NAT 环境下可能需要 TURN 服务器
3. **性能考虑：** 屏幕分辨率和帧率会影响性能和带宽
4. **安全性：** 建议在生产环境中使用 HTTPS/WSS 和身份验证

## 故障排除

### 1. 屏幕捕获失败
- 检查是否有屏幕录制权限
- 确认 `desktopCapturer.getSources()` 返回了有效的屏幕源

### 2. WebRTC 连接失败  
- 检查网络连接和防火墙设置
- 确认 STUN/TURN 服务器配置正确
- 查看浏览器控制台中的 ICE 连接状态

### 3. 鼠标控制无效
- 确认在 Windows 系统上运行
- 检查应用是否有足够的权限调用系统 API
- 查看坐标是否在屏幕范围内

### 4. 信令服务器连接问题
- 确认信令服务器 URL 正确
- 检查 WebSocket 连接状态
- 查看网络请求是否被阻止

## 扩展功能

可以进一步扩展的功能：

- 键盘输入控制
- 文件传输
- 多屏幕支持  
- 移动端客户端
- 录制功能
- 权限管理和访问控制 