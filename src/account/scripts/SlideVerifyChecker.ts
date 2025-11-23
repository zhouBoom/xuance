export const slideVerificationPopupDetection = (accountId: string) => `
${interceptCaptcha(accountId)};
(function () {
    const accountId = '${accountId}';
    let captchaCheckInterval = null;
    let hideCheckInterval = null;

    function isHavaCaptcha() {
        try {
            const captchaDiv = document.querySelector('.red-captcha-content');
            let isCaptchaUrl = false;
            try{
                isCaptchaUrl = window.location.href.includes('web-login/captcha');
            }catch(err){
                isCaptchaUrl = false;
            }
            return !!captchaDiv || isCaptchaUrl;
        } catch (error) {
            console.error('检查验证框时发生错误:', error);
            return false;
        }
    }

    function clearAllIntervals() {
        if (captchaCheckInterval) clearInterval(captchaCheckInterval);
        if (hideCheckInterval) clearInterval(hideCheckInterval);
    }

    function startCaptchaDetection() {
        clearAllIntervals();
        window.electronAPI.sendRendererLog({
            accountId: '${accountId}',
            message: '先触发一次滑动验证块已经隐藏的通知',
        });
        // 先触发一次隐藏通知
        window.electronAPI.slideVerificationPopupHidden(accountId);

        captchaCheckInterval = setInterval(() => {
            if (isHavaCaptcha()) {
                clearInterval(captchaCheckInterval);
                window.electronAPI.sendRendererLog({
                    accountId: '${accountId}',
                    message: '检测到滑动验证框，开始检测隐藏滑动验证框',
                });
                window.electronAPI.slideVerificationPopupDetected(accountId);
                startHideDetection();
            }
        }, 1000);
    }

    function startHideDetection() {
        hideCheckInterval = setInterval(() => {
            if (!isHavaCaptcha()) {
                clearInterval(hideCheckInterval);
                window.electronAPI.sendRendererLog({
                    accountId: '${accountId}',
                    message: '检测到滑动验证框已隐藏，开始重新检测滑动验证框',
                });
                window.electronAPI.slideVerificationPopupHidden(accountId);
                startCaptchaDetection(); // 重新开始检测，以防再次出现
            }
        }, 1000);
    }

    // 初始化检测
    window.__slideVerificationCheckerInitialized = true;
    startCaptchaDetection();

    // 清理函数
    window.addEventListener('unload', clearAllIntervals);
})()
`

// ... existing code ...

export const interceptCaptcha = (accountId: string) => {
    return `
        (function() {
            try {
                let tempObj = {};
                
                // 新增图片加载监听
                const observer = new MutationObserver(mutations => {
                    mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeName === 'IMG' && node.src) {
                                const url = node.src;
                                if (url.includes('picasso-static.xiaohongshu.com')) {
                                    console.log('拦截到图片加载:', url);
                                    window.electronAPI.sendRendererLog({
                                        accountId: '${accountId}',
                                        message: '拦截到图片加载',
                                        url: url,
                                        response: url
                                    });

                                    // 处理验证码图片逻辑
                                    if(url.includes('bg_cn')){
                                        tempObj.bg_url = url;
                                    }
                                    if(url.includes('center_cn')){
                                        tempObj.patch_url = url;
                                    }
                                    
                                    if(tempObj.bg_url && tempObj.patch_url){
                                        window.electronAPI.sendCaptcha({
                                            accountId: '${accountId}',
                                            bg_url: tempObj.bg_url,
                                            patch_url: tempObj.patch_url
                                        });
                                        tempObj = {}; // 清空临时对象
                                    }
                                }
                            }
                        });
                    });
                });

                // 开始观察整个文档
                observer.observe(document, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['src']
                });
                return true;
            } catch (error) {
                console.error('设置拦截器失败:', error);
                return false;
            }
        })();
    `;
}
