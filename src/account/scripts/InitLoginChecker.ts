
export const initLoginStatusCheckScript = (accountId: string) => {
    return `
        (function () {
            const accountId = '${accountId}';
            function isValidPagePath() {
                return location.href.includes('https://www.xiaohongshu.com/explore')
            }
            function notifyInvalidPagePath(logLocation) {
                window.electronAPI.sendRendererLog({
                    accountId,
                    message: 'initLoginFailed',
                    data: {
                        message: logLocation + '页面路径不符合预期，实际为：' + location.href,
                        accountId
                    }
                })
            }
            try{
                // 添加全局标记防止重复执行
                if(!isValidPagePath()) {
                    window.electronAPI.sendRendererLog({
                        accountId,
                        message: 'initLoginFailed',
                        data: {
                            message: '页面路径不符合预期，实际为：' + location.href,
                            accountId
                        }
                    })
                    return
                }

                let timeout = null;
                
                async function checkLoginContainer() {
                    function isNotLogin() {
                        return document.querySelector('.login-container');
                    }
                    let interval = setInterval(() => {
                        if(isNotLogin()) {
                            console.log('interval', interval)
                            console.log('timeout', timeout)
                            clearInterval(interval)
                            clearTimeout(timeout)
                            if(!isValidPagePath()) {
                                notifyInvalidPagePath()
                                return
                            }
                            window.electronAPI.initLoginFailed(accountId)
                        }
                    }, 1000)
                    timeout = setTimeout(() => {
                        console.log('interval', interval)
                        console.log('timeout', timeout)
                        clearInterval(interval)
                        if(!isValidPagePath()) {
                            notifyInvalidPagePath('line51')
                            return
                        }
                        window.electronAPI.initLoginSuccess(accountId)
                        window.electronAPI.sendRendererLog({
                            accountId,
                            message: 'initLoginSuccess',
                            data: {
                                message: '登录成功，在setTimeout中返回结果',
                                accountId
                            }
                        })
                    }, 5000)
                }
                checkLoginContainer();
            }catch(e){
                clearInterval(interval)
                clearTimeout(timeout)
                window.electronAPI.initLoginSuccess(accountId)
                window.electronAPI.sendRendererLog({
                    accountId,
                    message: 'initLoginFailed',
                    data: {
                        message: '检测登录状态报错：' + e,
                        accountId
                    }
                })
            }
        })()
    `
}