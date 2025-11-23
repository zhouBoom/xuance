import { BrowserWindow } from 'electron';
import { sendToRenderer } from "../../account/ipc";
import { getMainWindow } from "../../main";

// 定义日志级别类型
type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'silly';

// 定义日志消息接口
interface LogMessage {
  level: LogLevel;
  message: string;
}

export const printToRender = (level: LogLevel, message: string): void => {
    // const mainWindow = getMainWindow() as BrowserWindow;
    // const logData: LogMessage = { level, message };
    // sendToRenderer(mainWindow, 'logger', logData);
}