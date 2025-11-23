# 远程控制自动启动配置

## 概述

远程控制功能现在支持在应用启动时自动启动，无需渲染进程手动触发。

## 配置方法

### 1. 环境变量配置

在项目根目录的 `.env` 文件中添加以下配置：

```bash
# 启用远程控制自动启动
REMOTE_CONTROL_AUTO_START=true

# 信令服务器地址
SIGNAL_SERVER_URL=wss://your-signal-server.com
```

### 2. 配置说明

- `REMOTE_CONTROL_AUTO_START`: 控制是否在应用启动时自动启动远程控制
  - `true`: 启用自动启动
  - `false` 或未设置: 禁用自动启动
  
- `SIGNAL_SERVER_URL`: 信令服务器的 WebSocket 地址
  - 默认值: `wss://your-signal-server.com`
  - 请替换为你实际的信令服务器地址

## 启动时序

1. 应用启动 (app.ready)
2. 延迟 2 秒启动电源管理等系统功能
3. 延迟 3 秒启动远程控制功能 (确保主窗口完全初始化)

## 日志输出

启动过程中会输出相关日志：

```
[INFO] 正在自动启动远程控制功能...
[INFO] 远程控制自动启动成功
[INFO] 远程控制功能自动启动完成
```

如果禁用自动启动：
```
[INFO] 远程控制自动启动已禁用 (REMOTE_CONTROL_AUTO_START=false)
```

## 事件通知

自动启动的远程控制会向渲染进程发送以下事件：

- `remote-control:started` - 启动成功
- `remote-control:stopped` - 停止
- `remote-control:error` - 错误信息
- `remote-control:connection-state` - 连接状态变化

## 资源清理

应用关闭时会自动清理远程控制资源：

```typescript
app.on('window-all-closed', () => {
    // 自动清理远程控制资源
    if (autoRemoteControlManager) {
        autoRemoteControlManager.stopRemoteControl();
    }
});
```

## 手动控制

即使启用了自动启动，你仍然可以通过 IPC API 手动控制：

```typescript
// 渲染进程中
window.electronAPI.stopRemoteControl();  // 停止自动启动的远程控制
window.electronAPI.startRemoteControl(config);  // 重新启动
```

## 故障排除

### 1. 自动启动失败

检查日志中的错误信息：
- 屏幕录制权限是否已授权
- 信令服务器地址是否正确
- 网络连接是否正常

### 2. 重复启动

如果通过 IPC 手动启动时提示"远程控制已经在运行"，说明自动启动功能已生效。可以先停止再重新启动：

```typescript
await window.electronAPI.stopRemoteControl();
await window.electronAPI.startRemoteControl(newConfig);
``` 