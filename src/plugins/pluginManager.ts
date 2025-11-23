// src/main/plugins/pluginManager.ts

import { BrowserWindow } from 'electron';
import JsHookPlugin from './hook/hookUtils';
import RpaPlugin from './rpa/rpaUtils';

class PluginManager {
    private jsHook: JsHookPlugin | null = null;
    private rpa: RpaPlugin | null = null;

    constructor(window: BrowserWindow) {
        this.jsHook = new JsHookPlugin(window);
        this.rpa = new RpaPlugin(window);
    }

    getJsHook() {
        return this.jsHook;
    }

    getRpa() {
        return this.rpa;
    }
}

export default PluginManager;