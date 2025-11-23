import { app, BrowserWindow, dialog } from 'electron';
import { XuanceModule } from '../types/xuance-module';

/**
 * 对话框类型
 */
export enum DialogType {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  QUESTION = 'question'
}

/**
 * 对话框按钮
 */
export interface DialogButton {
  text: string;
  id: number;
  action?: () => void;
  isDefault?: boolean;
  isCancel?: boolean;
}

/**
 * 对话框选项
 */
export interface DialogOptions {
  title: string;
  message: string;
  detail?: string;
  type?: DialogType;
  buttons?: DialogButton[];
  cancelId?: number;
  defaultId?: number;
  noLink?: boolean;
}

/**
 * 对话框管理器
 */
export class DialogHelper {
  /**
   * 当前显示的对话框
   */
  private static activeDialogs: Map<string, Promise<any>> = new Map();
  
  /**
   * 非模态对话框窗口
   */
  private static nonModalWindows: Map<string, BrowserWindow> = new Map();

  /**
   * 显示对话框
   * @param window 窗口实例
   * @param options 对话框选项
   * @param dialogId 对话框唯一ID
   * @returns 
   */
  public static async showDialog(
    window: BrowserWindow,
    options: DialogOptions,
    dialogId?: string
  ): Promise<number> {
    if (!window || window.isDestroyed()) {
      Logger.warn(XuanceModule.SYSTEM.DIALOG, 'system', '无法显示对话框，窗口不存在或已销毁');
      return -1;
    }

    // 如果提供了对话框ID，检查是否已经存在相同ID的对话框
    if (dialogId && this.activeDialogs.has(dialogId)) {
      Logger.info(XuanceModule.SYSTEM.DIALOG, 'system', `对话框已存在，ID: ${dialogId}`);
      return -2;
    }

    // 提取按钮文本和操作
    const buttonTexts = options.buttons?.map(b => b.text) || ['确定'];
    const buttonActions = options.buttons?.map(b => b.action) || [];
    const cancelId = options.cancelId ?? 0;
    const defaultId = options.defaultId ?? 0;

    // 创建对话框任务
    const dialogTask = dialog.showMessageBox(window, {
      type: options.type || DialogType.INFO,
      title: options.title,
      message: options.message,
      detail: options.detail,
      buttons: buttonTexts,
      defaultId: defaultId,
      cancelId: cancelId,
      noLink: options.noLink !== undefined ? options.noLink : true
    }).then(result => {
      // 任务完成后从活动对话框列表中移除
      if (dialogId) {
        this.activeDialogs.delete(dialogId);
      }

      // 执行对应按钮的操作
      if (result.response >= 0 && result.response < buttonActions.length && buttonActions[result.response]) {
        buttonActions[result.response]?.();
      }

      return result.response;
    });

    // 如果提供了对话框ID，将任务添加到活动对话框列表
    if (dialogId) {
      this.activeDialogs.set(dialogId, dialogTask);
    }

    return dialogTask;
  }

  /**
   * 显示非模态对话框
   * @param window 父窗口实例
   * @param options 对话框选项
   * @param dialogId 对话框唯一ID
   * @returns 
   */
  public static showNonModalDialog(
    window: BrowserWindow,
    options: DialogOptions,
    dialogId?: string
  ): Promise<number> {
    if (!window || window.isDestroyed()) {
      Logger.warn(XuanceModule.SYSTEM.DIALOG, 'system', '无法显示对话框，窗口不存在或已销毁');
      return Promise.resolve(-1);
    }

    // 如果提供了对话框ID，检查是否已经存在相同ID的对话框
    if (dialogId && (this.activeDialogs.has(dialogId) || this.nonModalWindows.has(dialogId))) {
      Logger.info(XuanceModule.SYSTEM.DIALOG, 'system', `对话框已存在，ID: ${dialogId}`);
      return Promise.resolve(-2);
    }

    // 提取按钮文本和操作
    const buttonTexts = options.buttons?.map(b => b.text) || ['确定'];
    const buttonActions = options.buttons?.map(b => b.action) || [];
    const cancelId = options.cancelId ?? 0;
    const defaultId = options.defaultId ?? 0;

    return new Promise((resolve) => {
      // 创建非模态对话框窗口
      const dialogWindow = new BrowserWindow({
        parent: window,
        modal: false,
        width: 500,
        height: 200,
        minimizable: false,
        maximizable: false,
        resizable: false,
        frame: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        },
        show: false
      });

      // 保存窗口引用，方便后续关闭
      if (dialogId) {
        this.nonModalWindows.set(dialogId, dialogWindow);
      }

      // 加载对话框内容
      const html = this.generateDialogHtml(options, buttonTexts);
      dialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      // 监听按钮点击事件
      dialogWindow.webContents.on('ipc-message', (event, channel, buttonIndex) => {
        if (channel === 'dialog-button-click') {
          // 先执行对应按钮的操作
          if (buttonIndex >= 0 && buttonIndex < buttonActions.length && buttonActions[buttonIndex]) {
            buttonActions[buttonIndex]?.();
          }

          // 然后再关闭对话框
          if (dialogId) {
            this.nonModalWindows.delete(dialogId);
          }
          
          // 延迟关闭窗口，确保按钮操作完成
          setTimeout(() => {
            if (!dialogWindow.isDestroyed()) {
              dialogWindow.close();
            }
            resolve(buttonIndex);
          }, 100);
        }
      });

      // 监听窗口关闭事件
      dialogWindow.on('closed', () => {
        if (dialogId) {
          this.nonModalWindows.delete(dialogId);
        }
        resolve(cancelId);
      });

      dialogWindow.show();
    });
  }

  /**
   * 生成对话框HTML内容
   * @param options 对话框选项
   * @param buttonTexts 按钮文本
   * @returns HTML字符串
   */
  private static generateDialogHtml(options: DialogOptions, buttonTexts: string[]): string {
    const iconClass = this.getIconClassByType(options.type || DialogType.INFO);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${options.title}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 0;
            color: #333;
            background-color: #f5f5f5;
            display: flex;
            flex-direction: column;
            height: 100vh;
            overflow: hidden;
            border-radius: 8px;
            border: 1px solid #ddd;
          }
          .title-bar {
            display: flex;
            align-items: center;
            background-color: #f0f0f0;
            padding: 8px 12px;
            -webkit-app-region: drag;
            border-bottom: 1px solid #ddd;
          }
          .title-text {
            font-size: 14px;
            font-weight: bold;
          }
          .dialog-content-container {
            padding: 20px;
            flex-grow: 1;
            display: flex;
            flex-direction: column;
          }
          .dialog-header {
            display: flex;
            margin-bottom: 15px;
          }
          .dialog-icon {
            font-size: 24px;
            margin-right: 15px;
          }
          .dialog-content {
            flex-grow: 1;
          }
          .dialog-message {
            font-size: 14px;
            margin-bottom: 10px;
          }
          .dialog-detail {
            font-size: 12px;
            color: #666;
            margin-bottom: 15px;
          }
          .dialog-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
          }
          .dialog-button {
            padding: 6px 12px;
            border: 1px solid #ddd;
            background-color: #fff;
            border-radius: 4px;
            cursor: pointer;
            -webkit-app-region: no-drag;
          }
          .dialog-button:hover {
            background-color: #f0f0f0;
          }
          .dialog-button-default {
            background-color: #0078d7;
            color: white;
            border-color: #0078d7;
          }
          .dialog-button-default:hover {
            background-color: #006cc1;
          }
        </style>
      </head>
      <body>
        <div class="title-bar">
          <div class="title-text">${options.title}</div>
        </div>
        <div class="dialog-content-container">
          <div class="dialog-header">
            <div class="dialog-icon">${iconClass}</div>
            <div class="dialog-content">
              <div class="dialog-message">${options.message}</div>
              ${options.detail ? `<div class="dialog-detail">${options.detail}</div>` : ''}
            </div>
          </div>
          <div class="dialog-buttons">
            ${buttonTexts.map((text, index) => {
              const isDefault = index === (options.defaultId || 0);
              return `<button class="dialog-button ${isDefault ? 'dialog-button-default' : ''}" 
                onclick="window.postMessage({type: 'button-click', index: ${index}}, '*')">
                ${text}
              </button>`;
            }).join('')}
          </div>
        </div>
        <script>
          window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'button-click') {
              const { index } = event.data;
              require('electron').ipcRenderer.send('dialog-button-click', index);
            }
          });
        </script>
      </body>
      </html>
    `;
  }

  /**
   * 根据对话框类型获取图标类
   * @param type 对话框类型
   * @returns 图标类名
   */
  private static getIconClassByType(type: DialogType): string {
    switch (type) {
      case DialogType.INFO:
        return 'ℹ️';
      case DialogType.WARNING:
        return '⚠️';
      case DialogType.ERROR:
        return '❌';
      case DialogType.QUESTION:
        return '❓';
      default:
        return 'ℹ️';
    }
  }

  /**
   * 关闭指定ID的对话框
   * @param dialogId 对话框ID
   */
  public static closeDialog(dialogId: string): boolean {
    // 关闭模态对话框
    if (this.activeDialogs.has(dialogId)) {
      this.activeDialogs.delete(dialogId);
      return true;
    }
    
    // 关闭非模态对话框
    if (this.nonModalWindows.has(dialogId)) {
      const window = this.nonModalWindows.get(dialogId);
      if (window && !window.isDestroyed()) {
        window.close();
      }
      this.nonModalWindows.delete(dialogId);
      return true;
    }
    
    return false;
  }

  /**
   * 显示连接异常对话框
   * @param window 窗口实例
   * @param connectionType 连接类型
   */
  public static showConnectionErrorDialog(
    window: BrowserWindow,
    connectionType: string = '服务器'
  ): Promise<number> {
    return this.showDialog(
      window,
      {
        title: '连接异常',
        message: `与${connectionType}的连接异常`,
        detail: '网络连接已中断，请检查您的网络连接并重启程序。',
        type: DialogType.WARNING,
        buttons: [
          {
            text: '重启程序',
            id: 0,
            isDefault: true,
            action: () => {
              Logger.info(XuanceModule.SYSTEM.DIALOG, 'system', '用户选择重启程序');
              // 延迟执行重启，确保对话框资源正确释放
              setTimeout(() => {
                app.relaunch();
                app.exit(0);
              }, 200);
            }
          },
          // {
          //   text: '稍后重试',
          //   id: 1,
          //   isCancel: true
          // }
        ]
      },
      'connection-error'
    );
  }

  /**
   * 显示非模态连接异常对话框示例
   * @param window 窗口实例
   * @param connectionType 连接类型
   */
  public static showNonModalConnectionErrorDialog(
    window: BrowserWindow,
    connectionType: string = '服务器'
  ): Promise<number> {
    return this.showNonModalDialog(
      window,
      {
        title: '连接异常',
        message: `与${connectionType}的连接异常`,
        detail: '网络连接已中断，请检查您的网络连接并重启程序。',
        type: DialogType.WARNING,
        buttons: [
          {
            text: '重启程序',
            id: 0,
            isDefault: true,
            action: () => {
              Logger.info(XuanceModule.SYSTEM.DIALOG, 'system', '用户选择重启程序');
              // 延迟执行重启，确保对话框资源正确释放
              setTimeout(() => {
                app.relaunch();
                app.exit(0);
              }, 200);
            }
          },
          {
            text: '稍后重试',
            id: 1,
            isCancel: true
          }
        ]
      },
      'non-modal-connection-error'
    );
  }
} 