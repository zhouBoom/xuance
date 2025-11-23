import winston from 'winston';
import { printToRender } from './printToRender';
import RemoteTransport from './remoteTransport';
import 'winston-daily-rotate-file';
import { XuanceModule } from '../../types/xuance-module';
import { EnvConfig } from '../../config/env';
import { getRedUidByWSDeviceID } from '../os';

// 添加类型定义
type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'silly';
type LoggerMethod = (...args: any[]) => void;
interface LoggerInterface {
  [key: string]: LoggerMethod;
}
const getTime = () => {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}
const stringify = (data: unknown): string => {
  if (typeof data !== 'object') {
    return String(data);
  }
  return JSON.stringify(data);
};

const extractAccountId = (accountId: any): string => {
  if(!accountId || typeof accountId !== 'string') {
    return '-';
  }
  if(getRedUidByWSDeviceID(accountId)) {
    return getRedUidByWSDeviceID(accountId);
  }
  
  return accountId;
}

const customFormat = winston.format.printf(({ level, time, message, module, accountId, comment, timeStamp }) => {
  // 确保所有字段都有值，没有则使用默认值
  const safeTime = time || '-';
  const safeModule = module || '-';
  const safeMessage = typeof message === 'object' ? JSON.stringify(message) : message || '-';
  const safeAccountId = extractAccountId(accountId) || '-';
  const safeComment = typeof comment === 'object' ? JSON.stringify(comment) : comment || '-';
  const safeTimeStamp = timeStamp || '-';
  const result = {
    level: level.toUpperCase(),
    time: safeTime,
    env: EnvConfig.IS_SANDBOX? '沙箱环境' : '线上环境',
    accountId: safeAccountId,
    module: safeModule,
    message: safeMessage,
    comment: safeComment,
    timeStamp: safeTimeStamp,
  }
  return JSON.stringify(result);
});

export const initLogger = (): void => {
  try {
    const transportForCombine = new winston.transports.DailyRotateFile({
      dirname: 'C:/temp/log',
      filename: 'wecomtool-combine-%DATE%.log',
      datePattern: 'YYYY-MM-DD-HH',
      maxFiles: '7d',
      maxSize: '20m',
      format: customFormat,
    });
    const transportForCombineDay = new winston.transports.DailyRotateFile({
      dirname: 'C:/temp/log',
      filename: 'wecomtool-combine-allday-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d',
      maxSize: '20m',
      format: customFormat,
    });
    const transportForError = new winston.transports.DailyRotateFile({
      dirname: 'C:/temp/log',
      filename: 'wecomtool-error-%DATE%.log',
      datePattern: 'YYYY-MM-DD-HH',
      maxFiles: '7d',
      maxSize: '20m',
      level: 'error',
      format: customFormat,
    });
    const innerLogger = winston.createLogger({
      level: 'info',
      format: customFormat,
      transports: [
        transportForError,
        transportForCombine,
        transportForCombineDay,
        // new RemoteTransport({
        //   endpoint: 'https://dj.xesimg.com/1005398/c.gif',
        // }),
      ],
    });

    innerLogger.add(
      new winston.transports.Console({
        format: winston.format.printf((info: winston.Logform.TransformableInfo) => {
          const { level, time, message, module, accountId, comment, timeStamp } = info;
          
          // 为不同日志级别和字段设置颜色
          const colors = {
            error: '\x1b[31m',    // 红色
            warn: '\x1b[33m',     // 黄色
            info: '\x1b[36m',     // 青色
            debug: '\x1b[32m',    // 绿色
            silly: '\x1b[35m',    // 紫色
            reset: '\x1b[0m',     // 重置颜色
            white: '\x1b[37m',    // 白色
            blue: '\x1b[34m',     // 蓝色
            purple: '\x1b[35m',   // 紫色
            gray: '\x1b[90m',     // 灰色
          };

          // 安全地获取各字段值，避免 undefined
          const safeTime = time || '-';
          const safeModule = module || '-';
          const safeMessage = typeof message === 'object' ? JSON.stringify(message) : message || '-';
          const safeAccountId = extractAccountId(accountId) || '-';
          const safeComment = typeof comment === 'object' ? JSON.stringify(comment) : comment || '-';
          const safeTimeStamp = timeStamp || '-';
          const env = EnvConfig.IS_SANDBOX? '沙箱环境' : '线上环境';

          // 直接返回格式化的字符串，而不是JSON
          return `${colors[level as keyof typeof colors]}[${level.toUpperCase()}]${colors.reset} `
               + `${colors.blue}[${safeTime}]${colors.reset} `
               + `${colors.purple}[${env}]${colors.reset} `
               + `${colors.info}[${safeModule}]${colors.reset} `
               + `${colors.purple}[${safeAccountId}]${colors.reset} `
               + `${colors.white}${safeMessage}${colors.reset} `
               + `${colors.gray}${safeComment}${colors.reset} `
               + `${colors.gray}${safeTimeStamp}${colors.reset}`;
        }),
      })
    );

    // 定义全局Logger类型
    (globalThis as any).Logger = {
      error: (module:string, accountId:string, message:string | object, comment?:string): void => {
        innerLogger.error({
          time: getTime(),
          module,
          env: EnvConfig.IS_SANDBOX? '沙箱环境' : '线上环境',
          accountId: accountId || '------------------------',
          message: typeof message === 'object' ? JSON.stringify(message) : message,
          comment,
          timeStamp: new Date().getTime(),
        });
      },
      warn: (module:string, accountId:string, message:string | object, comment?:string): void => {
        innerLogger.warn({
          time: getTime(),
          module,
          env: EnvConfig.IS_SANDBOX? '沙箱环境' : '线上环境',
          accountId: accountId || '------------------------',
          message: typeof message === 'object' ? JSON.stringify(message) : message,
          comment,
          timeStamp: new Date().getTime(),
        });
      },
      info: (module:string, accountId:string, message:string | object, comment?:string): void => {
        innerLogger.info({
          time: getTime(),
          module,
          env: EnvConfig.IS_SANDBOX? '沙箱环境' : '线上环境',
          accountId: accountId || '------------------------',
          message: typeof message === 'object' ? JSON.stringify(message) : message,
          comment,
          timeStamp: new Date().getTime(),
        });
      },
      debug: (module:string, accountId:string, message:string | object, comment?:string): void => {
        innerLogger.debug({
          time: getTime(),
          module,
          env: EnvConfig.IS_SANDBOX? '沙箱环境' : '线上环境',
          accountId: accountId || '------------------------',
          message: typeof message === 'object' ? JSON.stringify(message) : message,
          comment,
          timeStamp: new Date().getTime(),
        });
      },
      silly: (module:string, accountId:string, message:string | object, comment?:string): void => {
        innerLogger.silly({
          time: getTime(),
          module,
          env: EnvConfig.IS_SANDBOX? '沙箱环境' : '线上环境',
          accountId: accountId || '------------------------',
          message: typeof message === 'object' ? JSON.stringify(message) : message,
          comment,
          timeStamp: new Date().getTime(),
        });
      },
    } as LoggerInterface;

  } catch (err: unknown) {
    const error = err as Error;
    //Logger.error(XuanceModule.COMMON.LOGGER, '', '初始化Logger失败', error);
    console.error('初始化Logger失败', error);
    printToRender('error', error.stack + error.message + error.name);
    
    (globalThis as any).Logger = {
      error: (...args: unknown[]): void => {
        printToRender('error', "NEW LOGGER:" + args.map(stringify).join(' '));
      },
      warn: (...args: unknown[]): void => {
        printToRender('warn', "NEW LOGGER:" + args.map(stringify).join(' '));
      },
      info: (...args: unknown[]): void => {
        printToRender('info', "NEW LOGGER:" + args.map(stringify).join(' '));
      },
      debug: (...args: unknown[]): void => {
        printToRender('debug', "NEW LOGGER:" + args.map(stringify).join(' '));
      },
      silly: (...args: unknown[]): void => {
        printToRender('silly', "NEW LOGGER:" + args.map(stringify).join(' '));
      },
    } as LoggerInterface;
  }
};
