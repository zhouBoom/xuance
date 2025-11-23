import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { TaskRecord, TaskStatus, TaskPersistenceConfig, TaskPersistenceManager as ITaskPersistenceManager } from './types';
import { XuanceModule } from '../../types/xuance-module';

/**
 * 文件系统任务持久化管理器
 * 使用JSON文件存储而不是SQLite
 */
export class TaskPersistenceManager extends EventEmitter implements ITaskPersistenceManager {
  private static instance: TaskPersistenceManager;
  private initialized = false;
  private config: TaskPersistenceConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private tasks: Map<string, TaskRecord> = new Map();
  private dbFilePath: string;

  /**
   * 构造函数
   * @param config 数据库配置
   */
  private constructor(config: TaskPersistenceConfig) {
    super();
    this.config = {
      ...config,
      maxRetryAttempts: config.maxRetryAttempts || 3,
      checkIntervalMs: config.checkIntervalMs || 30000,
    };
    // 将SQLite文件路径改为JSON文件路径
    this.dbFilePath = config.dbPath.replace(/\.db$/, '.json');
  }

  /**
   * 获取单例实例
   * @param config 数据库配置
   * @returns TaskPersistenceManager实例
   */
  public static getInstance(config: TaskPersistenceConfig): TaskPersistenceManager {
    if (!TaskPersistenceManager.instance) {
      TaskPersistenceManager.instance = new TaskPersistenceManager(config);
    }
    return TaskPersistenceManager.instance;
  }

  /**
   * 初始化JSON数据存储
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 确保数据目录存在
      const dbDir = path.dirname(this.dbFilePath);
      await fs.mkdir(dbDir, { recursive: true });

      // 检查JSON文件是否存在
      try {
        const data = await fs.readFile(this.dbFilePath, 'utf8');
        this.tasks = new Map(Object.entries(JSON.parse(data)));
        Logger.info(XuanceModule.TASK.PERSISTENCE, 'system', `从文件 ${this.dbFilePath} 加载了 ${this.tasks.size} 个任务`);
      } catch (readError) {
        // 文件可能不存在，创建一个空的Map
        this.tasks = new Map();
        await this.saveToFile();
        Logger.info(XuanceModule.TASK.PERSISTENCE, 'system', `创建了新的任务存储文件 ${this.dbFilePath}`);
      }

      this.initialized = true;
      Logger.info(XuanceModule.TASK.PERSISTENCE, 'system', '任务持久化管理器初始化成功');
      
      // 开始定期检查任务状态
      this.startPeriodicCheck();
    } catch (error) {
      Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', '任务持久化管理器初始化失败', error);
      this.initialized = false;
      
      // 记录详细的错误信息以帮助诊断
      if (error instanceof Error) {
        Logger.error(
          XuanceModule.TASK.PERSISTENCE, 
          'system', 
          `错误类型: ${error.name}, 错误信息: ${error.message}, 堆栈: ${error.stack}`
        );
      }
    }
  }

  /**
   * 保存到文件
   */
  private async saveToFile(): Promise<void> {
    try {
      // 转换Map为对象
      const tasksObject = Object.fromEntries(this.tasks.entries());
      await fs.writeFile(this.dbFilePath, JSON.stringify(tasksObject, null, 2), 'utf8');
    } catch (error) {
      Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', '保存任务数据到文件失败', error);
      throw error;
    }
  }

  /**
   * 开始定期检查任务状态
   */
  private startPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.checkInterval = setInterval(async () => {
      try {
        // 检查过期任务
        const expiredTasks = await this.getExpiredTasks();
        if (expiredTasks.length > 0) {
          Logger.info(
            XuanceModule.TASK.PERSISTENCE, 
            'system', 
            `发现${expiredTasks.length}个过期任务，准备清理`
          );
          
          // 发出过期任务事件
          this.emit('expiredTasks', expiredTasks);
          
          // 删除过期任务
          for (const task of expiredTasks) {
            await this.deleteTask(task.id);
          }
        }
      } catch (error) {
        Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', '检查任务状态失败', error);
      }
    }, this.config.checkIntervalMs);
  }

  /**
   * 保存任务到存储
   * @param task 任务信息
   * @returns 任务ID
   */
  public async saveTask(task: Omit<TaskRecord, 'createdAt' | 'updatedAt' | 'status'>): Promise<string> {
    if (!this.initialized) {
      Logger.warn(XuanceModule.TASK.PERSISTENCE, task.accountId, '数据库未初始化，无法保存任务');
      return task.id;
    }

    try {
      const now = Date.now();
      const taskRecord: TaskRecord = {
        ...task,
        status: TaskStatus.PENDING,
        createdAt: now,
        updatedAt: now
      };

      // 存储任务
      this.tasks.set(taskRecord.id, taskRecord);
      
      // 保存到文件
      await this.saveToFile();

      Logger.info(
        XuanceModule.TASK.PERSISTENCE, 
        taskRecord.accountId, 
        `已保存任务 [${taskRecord.id}]，命令: ${taskRecord.command}`
      );

      return taskRecord.id;
    } catch (error) {
      Logger.error(XuanceModule.TASK.PERSISTENCE, task.accountId, `保存任务 [${task.id}] 失败`, error);
      return task.id;
    }
  }

  /**
   * 更新任务状态
   * @param id 任务ID
   * @param status 新状态
   * @returns 是否更新成功
   */
  public async updateTaskStatus(id: string, status: TaskStatus): Promise<boolean> {
    if (!this.initialized) {
      Logger.warn(XuanceModule.TASK.PERSISTENCE, 'system', '数据库未初始化，无法更新任务状态');
      return false;
    }

    try {
      // 获取任务
      const task = this.tasks.get(id);
      if (!task) {
        Logger.warn(XuanceModule.TASK.PERSISTENCE, 'system', `未找到要更新的任务 [${id}]`);
        return false;
      }

      // 更新状态
      const now = Date.now();
      const updatedTask = {
        ...task,
        status,
        updatedAt: now
      };
      
      // 存储更新后的任务
      this.tasks.set(id, updatedTask);
      
      // 保存到文件
      await this.saveToFile();

      Logger.info(XuanceModule.TASK.PERSISTENCE, 'system', `已更新任务 [${id}] 状态为 ${status}`);
      return true;
    } catch (error) {
      Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', `更新任务 [${id}] 状态失败`, error);
      return false;
    }
  }

  /**
   * 从存储中删除任务
   * @param id 任务ID
   * @returns 是否删除成功
   */
  public async deleteTask(id: string): Promise<boolean> {
    if (!this.initialized) {
      Logger.warn(XuanceModule.TASK.PERSISTENCE, 'system', '数据库未初始化，无法删除任务');
      return false;
    }

    try {
      // 检查任务是否存在
      if (!this.tasks.has(id)) {
        Logger.warn(XuanceModule.TASK.PERSISTENCE, 'system', `未找到要删除的任务 [${id}]`);
        return false;
      }

      // 删除任务
      const success = this.tasks.delete(id);
      
      // 保存到文件
      await this.saveToFile();

      if (success) {
        Logger.info(XuanceModule.TASK.PERSISTENCE, 'system', `已删除任务 [${id}]`);
      }
      
      return success;
    } catch (error) {
      Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', `删除任务 [${id}] 失败`, error);
      return false;
    }
  }

  /**
   * 根据ID获取任务
   * @param id 任务ID
   * @returns 任务记录或null
   */
  public async getTaskById(id: string): Promise<TaskRecord | null> {
    if (!this.initialized) {
      Logger.warn(XuanceModule.TASK.PERSISTENCE, 'system', '数据库未初始化，无法获取任务');
      return null;
    }

    try {
      const task = this.tasks.get(id);
      return task || null;
    } catch (error) {
      Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', `获取任务 [${id}] 失败`, error);
      return null;
    }
  }

  /**
   * 获取所有待处理的任务
   * @returns 待处理任务列表
   */
  public async getPendingTasks(): Promise<TaskRecord[]> {
    if (!this.initialized) {
      Logger.warn(XuanceModule.TASK.PERSISTENCE, 'system', '数据库未初始化，无法获取待处理任务');
      return [];
    }

    try {
      const now = Date.now();
      const pendingTasks = Array.from(this.tasks.values()).filter(task => 
        task.status === TaskStatus.PENDING && task.timeout_at > now
      ).sort((a, b) => a.received_at - b.received_at);
      
      return pendingTasks;
    } catch (error) {
      Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', '获取待处理任务失败', error);
      return [];
    }
  }

  /**
   * 获取所有已过期的任务
   * @returns 已过期任务列表
   */
  public async getExpiredTasks(): Promise<TaskRecord[]> {
    if (!this.initialized) {
      Logger.warn(XuanceModule.TASK.PERSISTENCE, 'system', '数据库未初始化，无法获取过期任务');
      return [];
    }

    try {
      const now = Date.now();
      const expiredTasks = Array.from(this.tasks.values()).filter(task => 
        task.timeout_at <= now
      ).sort((a, b) => a.received_at - b.received_at);
      
      return expiredTasks;
    } catch (error) {
      Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', '获取过期任务失败', error);
      return [];
    }
  }

  /**
   * 关闭数据库连接
   */
  public async close(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.initialized) {
      try {
        // 保存最终状态到文件
        await this.saveToFile();
        this.tasks.clear();
        this.initialized = false;
        Logger.info(XuanceModule.TASK.PERSISTENCE, 'system', '任务持久化管理器已关闭');
      } catch (error) {
        Logger.error(XuanceModule.TASK.PERSISTENCE, 'system', '关闭任务持久化管理器失败', error);
        this.initialized = false;
      }
    }
  }
} 