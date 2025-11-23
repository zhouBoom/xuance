/**
 * 任务持久化相关的类型定义
 */

/**
 * WebSocket任务状态
 */
export enum TaskStatus {
  PENDING = 'pending',  // 等待处理
  PROCESSING = 'processing',  // 正在处理
  FAILED = 'failed',  // 执行失败
  COMPLETED = 'completed'  // 执行成功
}

/**
 * WebSocket任务记录接口
 */
export interface TaskRecord {
  id: string;  // 任务ID，通常是服务端分配的唯一标识
  command: string;  // 任务命令类型
  content: string;  // 任务内容，JSON字符串
  accountId: string;  // 关联的账号ID
  device_id: string;  // 关联的设备ID
  received_at: number;  // 接收时间戳
  timeout_at: number;  // 超时时间戳
  status: TaskStatus;  // 任务状态
  createdAt: number;  // 创建时间戳
  updatedAt: number;  // 更新时间戳
}

/**
 * 任务持久化配置接口
 */
export interface TaskPersistenceConfig {
  dbPath: string;  // 数据库文件路径
  tableName: string;  // 任务表名
  maxRetryAttempts: number;  // 最大重试次数
  checkIntervalMs: number;  // 检查间隔时间(毫秒)
}

/**
 * 任务持久化管理器接口
 */
export interface TaskPersistenceManager {
  init(): Promise<void>;  // 初始化数据库
  saveTask(task: Omit<TaskRecord, 'createdAt' | 'updatedAt' | 'status'>): Promise<string>;  // 保存任务
  updateTaskStatus(id: string, status: TaskStatus): Promise<boolean>;  // 更新任务状态
  deleteTask(id: string): Promise<boolean>;  // 删除任务
  getTaskById(id: string): Promise<TaskRecord | null>;  // 根据ID获取任务
  getPendingTasks(): Promise<TaskRecord[]>;  // 获取所有待处理任务
  getExpiredTasks(): Promise<TaskRecord[]>;  // 获取所有已过期任务
  close(): Promise<void>;  // 关闭数据库连接
} 