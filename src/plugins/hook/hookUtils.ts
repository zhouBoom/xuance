// src/main/plugins/jsHook/jsHookPlugin.ts

import { BrowserWindow } from 'electron';

class JsHookPlugin {
    private window: BrowserWindow;

    constructor(window: BrowserWindow) {
        this.window = window;
    }

    // 在页面加载完成后注入 JavaScript 脚本
    injectScript(script: string) {
        this.window.webContents.executeJavaScript(script)
            .then(() => console.log('Script injected successfully'))
            .catch(error => console.error('Script injection failed', error));
    }

    // 示例 - 隐藏特定元素
    hideElement(selector: string) {
        const script = `document.querySelectorAll('${selector}').forEach(el => el.style.display = 'none');`;
        this.injectScript(script);
    }

    // 示例 - 修改页面内容
    changeContent(selector: string, content: string) {
        const script = `document.querySelectorAll('${selector}').forEach(el => el.innerHTML = '${content}');`;
        this.injectScript(script);
    }
}

export default JsHookPlugin;