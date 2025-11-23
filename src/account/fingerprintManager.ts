import { envDataManager } from "./envDataManager";
import { getCanvasSpoofScript } from "./scripts/canvasSpoof";
import { getWebglSpoofScript } from "./scripts/webglSpoof";
type Fingerprint = {
    userAgent: string;
    platform: string;
    screenResolution: { width: number; height: number };
    language: string;
    timeZone: string;
};

interface SpoofScript {
    canvas?: string;
    webgl?: string;
}
export class FingerprintManager {
    private fingerprints: Fingerprint[] = [];
    private fingerprintIndex: number = 0;
    private fingerprintMap: Map<string, Fingerprint> = new Map();
    private spoofScriptMap: Map<string, SpoofScript> = new Map();

    constructor() {
        this.initializeFingerprints();
    }

    private initializeFingerprints() {
        this.fingerprints = [
            // Windows 系列
            { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', platform: 'Win32', screenResolution: { width: 1920, height: 1080 }, language: 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6', timeZone: 'Asia/Shanghai' },
            { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36', platform: 'Win32', screenResolution: { width: 1366, height: 768 }, language: 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6', timeZone: 'Asia/Shanghai' },
            { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36 Edg/96.0.1054.62', platform: 'Win32', screenResolution: { width: 1536, height: 864 }, language: 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6', timeZone: 'Asia/Shanghai' },
            { userAgent: 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36', platform: 'Win32', screenResolution: { width: 1680, height: 1050 }, language: 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6', timeZone: 'Asia/Shanghai' },
            
            // macOS 系列
            { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36', platform: 'MacIntel', screenResolution: { width: 1440, height: 900 }, language: 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6', timeZone: 'Asia/Shanghai' },
            { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15', platform: 'MacIntel', screenResolution: { width: 2560, height: 1600 }, language: 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6', timeZone: 'Asia/Shanghai' },
            { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.128 Safari/537.36', platform: 'MacIntel', screenResolution: { width: 1920, height: 1080 }, language: 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6', timeZone: 'Asia/Shanghai' },
            
            // Linux 系列
            { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36', platform: 'Linux x86_64', screenResolution: { width: 1920, height: 1080 }, language: 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6', timeZone: 'Asia/Shanghai' },
            { userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:93.0) Gecko/20100101 Firefox/93.0', platform: 'Linux x86_64', screenResolution: { width: 1366, height: 768 }, language: 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6', timeZone: 'Asia/Shanghai' },
            { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36', platform: 'Linux x86_64', screenResolution: { width: 1440, height: 900 }, language: 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6', timeZone: 'Asia/Shanghai' },
        ];
    }

    public async getOrCreateFingerprint(accountId: string): Promise<Fingerprint> {
        let fingerprint = this.fingerprintMap.get(accountId);
        if (!fingerprint) {
            // 尝试从存储加载指纹
            const storedFingerprint = await envDataManager.loadFingerprint(accountId);
            
            if (storedFingerprint.userAgent) {
                fingerprint = storedFingerprint;
            } else {
                // 如果没有存储的指纹，使用新的指纹
                fingerprint = this.fingerprints[this.fingerprintIndex];
                this.fingerprintIndex = (this.fingerprintIndex + 1) % this.fingerprints.length;
                await envDataManager.saveFingerprint(accountId, fingerprint);
            }
            
            this.fingerprintMap.set(accountId, fingerprint);
            
            // 尝试加载已保存的指纹伪装脚本
            const storedSpoofScripts = await envDataManager.loadSpoofScripts(accountId);
            if (storedSpoofScripts.canvas || storedSpoofScripts.webgl) {
                this.spoofScriptMap.set(accountId, storedSpoofScripts);
            } else {
                // 如果没有存储的脚本，生成新的
                this.generateSpoofScripts(accountId);
            }
        }
        return fingerprint;
    }
    
    /**
     * 生成账户的指纹伪装脚本
     * @param accountId 账户ID
     */
    private async generateSpoofScripts(accountId: string): Promise<void> {
        const spoofScript: SpoofScript = {
            canvas: getCanvasSpoofScript(accountId),
            webgl: getWebglSpoofScript(accountId)
        };
        this.spoofScriptMap.set(accountId, spoofScript);
        // 保存生成的脚本到存储
        await envDataManager.saveSpoofScripts(accountId, spoofScript);
    }
    
    /**
     * 获取账户的 Canvas 指纹伪装脚本
     * @param accountId 账户ID
     * @returns Canvas 伪装脚本字符串
     */
    public async getCanvasSpoofScript(accountId: string): Promise<string> {
        let spoofScript = this.spoofScriptMap.get(accountId);
        if (!spoofScript) {
            await this.generateSpoofScripts(accountId);
            spoofScript = this.spoofScriptMap.get(accountId)!;
        }
        return spoofScript.canvas || '';
    }
    
    /**
     * 获取账户的 WebGL 指纹伪装脚本
     * @param accountId 账户ID
     * @returns WebGL 伪装脚本字符串
     */
    public async getWebglSpoofScript(accountId: string): Promise<string> {
        let spoofScript = this.spoofScriptMap.get(accountId);
        if (!spoofScript) {
            await this.generateSpoofScripts(accountId);
            spoofScript = this.spoofScriptMap.get(accountId)!;
        }
        return spoofScript.webgl || '';
    }
    
    /**
     * 为账户重置所有指纹伪装
     * @param accountId 账户ID
     */
    public async resetAccountFingerprint(accountId: string): Promise<void> {
        // 移除现有的指纹映射
        this.fingerprintMap.delete(accountId);
        this.spoofScriptMap.delete(accountId);
        
        // 重新获取新的指纹和生成新的伪装脚本
        await this.getOrCreateFingerprint(accountId);
        // 强制生成新的伪装脚本
        await this.generateSpoofScripts(accountId);
    }
}

export const fingerprintManager = new FingerprintManager(); 