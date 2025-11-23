export {};

declare global {
  interface Window {
    electronAPI: {
      clickAccountItem: (accountId: string) => void;
      initLoginSuccess: (accountId: string) => void;
      initLoginFailed: (accountId: string) => void;
      clickAddAccountButton: () => void;
      updateCookies: (data: any) => void;
      loginStatusChangeToFailed: (data: any) => void;
      slideVerificationPopupDetected: (accountId: string) => void;
      slideVerificationPopupHidden: (accountId: string) => void;
      onUpdateAccountList: (callback: (accounts: any) => void) => void;
      onUpdateAccountItem: (callback: (account: any) => void) => void;
      onAddAccountItem: (callback: (account: any) => void) => void;
      onOpenAccountView: (callback: (accountId: string) => void) => void;
      onNetworkStatusChange: (callback: (data: any) => void) => void;
      onHideViewTitleById: (callback: (data: any) => void) => void;
      onLogger: (callback: (data: any) => void) => void;
      onAccountInitLoading: (callback: (data: any) => void) => void;
      onIsSandbox: (callback: (data: any) => void) => void;
      hideAccountView: () => void;
      sendReady: () => void;
      sendRendererLog: (data: any) => void;
      sendArticleData: (data: any) => void;
      sendArticleInteractionData: (data: any) => void;
      sendCommentData: (data: any) => void;
      sendCollectArticleTaskStatus: (data: any) => void;
      sendCollectCommentTaskStatus: (data: any) => void;
      openDebug: (accountId: string) => void;
      sendCaptcha:(data: any) => void
      onScreenShareStart: (callback: (data: any) => void) => void;
    }
  }
}