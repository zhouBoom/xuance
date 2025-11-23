import { envDataManager } from "./envDataManager";
type Fingerprint = {
    userAgent: string;
    platform: string;
    screenResolution: { width: number; height: number };
    language: string;
    timeZone: string;
};
export class FingerprintManager {
    private fingerprints: Fingerprint[] = [];
    private fingerprintIndex: number = 0;
    private fingerprintMap: Map<string, Fingerprint> = new Map();

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
            fingerprint = this.fingerprints[this.fingerprintIndex];
            this.fingerprintIndex = (this.fingerprintIndex + 1) % this.fingerprints.length;
            this.fingerprintMap.set(accountId, fingerprint);
            await envDataManager.saveFingerprint(accountId, fingerprint);
        }
        return fingerprint;
    }
}

export const fingerprintManager = new FingerprintManager(); 