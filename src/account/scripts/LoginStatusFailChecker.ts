export const loginStatusFailChecker = (accountId: string) => `
    (function(){
        const accountId = '${accountId}';
        let intervalId = null;
        
        // DOM 检测登录状态
        async function checkLoginStatus(accountId) {
            try {
                function isNotLogin() {
                    const loginContainer = document.querySelector('.login-container');
                    let isLoginPage = false;
                    try{
                        isLoginPage = window.location.href.includes('www.xiaohongshu.com/login');
                    }catch(err){
                        isLoginPage = false;
                    }
                    return loginContainer || isLoginPage;
                }
                
                if(isNotLogin()) {
                    window.electronAPI.loginStatusChangeToFailed(accountId);
                    intervalId && clearInterval(intervalId);
                }
            } catch (error) {
                console.error('检查登录状态失败:', error);
            }
        }
        
        // 使用 setInterval 定期检查，移除递归调用
        intervalId = setInterval(() => checkLoginStatus(accountId), 1000);

        ${interceptLoginStatus(accountId)}
    })()
`

export const interceptLoginStatus = (accountId: string) => {
    return `
        (function() {
            try {
                const originalOpen = window.XMLHttpRequest.prototype.open;
                const newOpen = function(...args) {
                    const url = args[1];
                    if (url && (url.includes('/api/sns/web/v1/feed') || url.includes('/sns/web/v1/search/notes'))) {
                        console.log('拦截到待检测数据', url);
                        const originalOnLoad = this.onload;
                        this.onload = function() {
                        try {
                            window.electronAPI.sendRendererLog({
                                accountId: '${accountId}',
                                message: '拦截到待检测数据',
                                url: url,
                                response: (this.responseText || '').slice(0, 100)
                            });
                            const responseData = JSON.parse(this.responseText);
                            if (responseData && responseData.msg && responseData.msg.includes('登录')) {
                                window.electronAPI.loginStatusChangeToFailed('${accountId}');
                            }
                        } catch (error) {
                            console.error('处理响应数据失败:', error);
                        }
                        if (originalOnLoad) {
                            originalOnLoad.apply(this, arguments);
                        }
                };
            }
            return originalOpen.apply(this, args);
        };
        
        Object.defineProperty(window.XMLHttpRequest.prototype, 'open', {
                    value: newOpen,
                    writable: true,
                    configurable: true
                });
                
                return true;
            } catch (error) {
                console.error('设置XHR拦截器失败:', error);
                return false;
            }
        })();
    `;
}