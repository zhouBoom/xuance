export const screenConfig = `
    (function () {
        // // 覆盖可见性 API
        // Object.defineProperty(document, 'hidden', { get: () => false });
        // Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
        
        // // 保持窗口焦点
        // window.focus();
        // document.hasFocus = () => true;
        
        // // 防止 requestAnimationFrame 被暂停
        // const originalRAF = window.requestAnimationFrame;
        // window.requestAnimationFrame = function(callback) {
        //     return originalRAF.call(window, callback);
        // };
    })()
`