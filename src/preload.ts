import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 账号相关-渲染进程发送类-start
  clickAccountItem: (accountId: string) => ipcRenderer.send('click-account-item', accountId),
  initLoginSuccess: (accountId: string) => ipcRenderer.send('init-login-success', accountId),
  initLoginFailed: (accountId: string) => ipcRenderer.send('init-login-failed', accountId),
  clickAddAccountButton: () => ipcRenderer.send('click-add-account-button'),
  updateCookies: (data: any) => ipcRenderer.send('update-cookies', data),
  loginStatusChangeToFailed: (accountId: string) => ipcRenderer.send('login-status-change-to-failed', accountId),
  slideVerificationPopupDetected: (accountId: any) => ipcRenderer.send('slide-verification-popup-detected', accountId),
  slideVerificationPopupHidden: (accountId: any) => ipcRenderer.send('slide-verification-popup-hidden', accountId),
  sendReady: () => ipcRenderer.send('renderer-ready'),
  sendRendererLog: (data: any) => ipcRenderer.send('renderer-log', data),
  // 账号相关-渲染进程发送类-end
  // 账号相关-渲染进程监听类-start
  onUpdateAccountList: (callback: (accounts: any) => void) => {
    ipcRenderer.on('update-account-list', (_event, accounts) => callback(accounts));
  },
  onUpdateAccountItem: (callback: (account: any) => void) => {
    ipcRenderer.on('update-account-item', (_event, account) => callback(account));
  },
  onAddAccountItem: (callback: (account: any) => void) => {
    ipcRenderer.on('add-account-item', (_event, account) => callback(account));
  },
  onOpenAccountView: (callback: (account: any) => void) => {
    ipcRenderer.on('open-account-view', (_event, account) => callback(account));
  },
  onTaskControl: (callback: (data: any) => void) => {
    ipcRenderer.on('task-control', (_event, data) => callback(data));
  },
  onNetworkStatusChange: (callback: (data: any) => void) => {
    ipcRenderer.on('network-status-change', (_event, data) => callback(data));
  },
  onAccountInitLoading: (callback: (data: any) => void) => {
    ipcRenderer.on('account-init-loading', (_event, data) => callback(data));
  },
  onIsSandbox: (callback: (data: any) => void) => {
    ipcRenderer.on('is-sandbox', (_event, data) => callback(data));
  },
  onHideViewTitleById: (callback: (data: any) => void) => {
    ipcRenderer.on('hide-view-title-by-id', (_event, data) => callback(data));
  },
  onLogger: (callback: (data: any) => void) => {
    ipcRenderer.on('logger', (_event, data) => callback(data));
  },
  hideAccountView: () => ipcRenderer.send('hide-account-view'),
  openDebug: (accountId: string) => ipcRenderer.send('open-debug', accountId),
  // 账号相关-渲染进程监听类-end
  // 采集相关-渲染进程发送类-start
  sendArticleData: (data: any) => ipcRenderer.send('send-article-data', data),
  sendArticleInteractionData: (data: any) => ipcRenderer.send('send-article-interaction-data', data),
  sendCommentData:  (data: any) => ipcRenderer.send('send-comment-data', data),
  sendCaptcha: (data: any) => ipcRenderer.send('send-captcha', data),
  sendCollectArticleTaskStatus: (data: any) => {
    console.log('渲染进程已调用sendCollectArticleTaskStatus', data);
    ipcRenderer.send('collect-article-task-status', data);
  },
  sendCollectArticleInteractionTaskStatus: (data: any) => {
    console.log('渲染进程已调用sendCollectArticleInteractionTaskStatus', data);
    ipcRenderer.send('collect-article-interaction-task-status', data);
  },
  sendCollectCommentTaskStatus: (data: any) => {
    console.log('渲染进程已调用sendCollectCommentTaskStatus', data);
    ipcRenderer.send('collect-comment-task-status', data);
  },
  // 采集相关-渲染进程发送类-end
  
  // 远程控制相关-渲染进程发送类-start
  startRemoteControl: (config: any) => ipcRenderer.invoke('remote-control:start', config),
  stopRemoteControl: () => ipcRenderer.invoke('remote-control:stop'),
  getRemoteControlStatus: () => ipcRenderer.invoke('remote-control:status'),
  executeMouseAction: (action: any) => ipcRenderer.invoke('remote-control:mouse-action', action),
  getCurrentMousePosition: () => ipcRenderer.invoke('remote-control:mouse-position'),
  // 远程控制相关-渲染进程发送类-end
  
  // 远程控制相关-渲染进程监听类-start
  onRemoteControlError: (callback: (data: any) => void) => {
    ipcRenderer.on('remote-control:error', (_event, data) => callback(data));
  },
  onRemoteControlConnectionState: (callback: (data: any) => void) => {
    ipcRenderer.on('remote-control:connection-state', (_event, data) => callback(data));
  },
  onRemoteControlStarted: (callback: () => void) => {
    ipcRenderer.on('remote-control:started', () => callback());
  },
  onRemoteControlStopped: (callback: () => void) => {
    ipcRenderer.on('remote-control:stopped', () => callback());
  },
  // 远程控制相关-渲染进程监听类-end

  // 屏幕共享相关 API
  sendMouseEvent: (mouseEvent: any) => ipcRenderer.invoke('screen-share:mouse-event', mouseEvent),

  // 屏幕共享事件监听
  onScreenShareStart: (callback: (data: any) => void) => {
    ipcRenderer.on('screen-share:start', (event, data) => callback(data));
  },
  onScreenShareStop: (callback: () => void) => {
    ipcRenderer.on('screen-share:stop', callback);
  },
}); 