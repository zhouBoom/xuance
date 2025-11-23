# Windows 电源管理 - 隐藏功能

## 功能说明

此模块提供Windows系统的电源管理功能，实现永不休眠、永不息屏、永不锁屏的能力。这是一个隐藏功能，不对用户暴露，在应用启动时自动启用。

## 功能特性

- ✅ **永不休眠** - 阻止系统进入休眠状态
- ✅ **永不息屏** - 防止显示器自动关闭
- ✅ **永不锁屏** - 禁用屏幕保护程序和自动锁定
- ✅ **设置恢复** - 应用退出时自动恢复原始电源设置
- ✅ **多重保护** - 使用多种方式确保设置生效

## 实现方式

### 1. PowerCfg 命令
- `monitor-timeout-ac/dc 0` - 显示器永不关闭
- `disk-timeout-ac/dc 0` - 硬盘永不关闭
- `standby-timeout-ac/dc 0` - 待机永不开启
- `hibernate-timeout-ac/dc 0` - 休眠永不开启

### 2. 注册表设置
- 禁用屏幕保护程序
- 禁用自动锁屏
- 禁用动态锁定

### 3. Windows API
- `SetThreadExecutionState` - 防止系统进入睡眠状态

## 自动启用时机

应用启动后延迟2秒自动启用，确保应用完全初始化后再进行系统设置修改。

## 调试接口（仅开发环境）

在开发环境下，可以通过以下方式调试电源管理功能：

```javascript
// 渲染进程中使用
const { system } = window.electronAPI;

// 启用永不休眠
await system.power.enableStayAwake();

// 恢复原始设置
await system.power.restoreSettings();

// 获取当前状态
const status = await system.power.getStatus();
console.log(status);

// 检查是否已启用
const { isEnabled } = await system.power.isEnabled();
console.log('永不休眠已启用:', isEnabled);
```

## 安全考虑

1. **权限要求** - 某些设置需要管理员权限
2. **优雅降级** - 如果某项设置失败，不影响其他设置
3. **自动恢复** - 应用退出时自动恢复原始设置
4. **仅Windows** - 非Windows系统自动跳过

## 日志记录

所有操作都会记录到日志系统中，使用 `XuanceModule.SYSTEM` 模块标识。

## 注意事项

- 此功能仅在Windows系统上生效
- 某些企业环境可能限制电源策略修改
- 修改注册表需要相应权限
- 应用异常退出可能导致设置无法恢复，建议定期检查

## 故障排除

如果功能无法正常工作：

1. 检查是否有管理员权限
2. 查看日志中的错误信息
3. 手动执行 `powercfg /list` 确认电源计划可访问
4. 检查企业策略是否限制电源设置修改 