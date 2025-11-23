import { fingerprintManager } from "../fingerprintManager";

export const FingerScript = async (accountId: string) => {
    const fingerprint = await fingerprintManager.getOrCreateFingerprint(accountId);
    return `
        (function () {
             // 伪装屏幕分辨率
            Object.defineProperty(window, 'screen', {
                value: {
                    width: ${fingerprint.screenResolution.width},
                    height: ${fingerprint.screenResolution.height},
                    availWidth: ${fingerprint.screenResolution.width},
                    availHeight: ${fingerprint.screenResolution.height},
                    colorDepth: 24,
                    pixelDepth: 24
                }
            });

            // 伪装平台信息
            Object.defineProperty(navigator, 'platform', {
                get: () => '${fingerprint.platform}'
            });

            // 伪装语言
            Object.defineProperty(navigator, 'language', {
                get: () => '${fingerprint.language || 'en-US'}'
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['${fingerprint.language || 'en-US'}']
            });

            // 伪装时区
            Intl.DateTimeFormat = (function() {
                const original = Intl.DateTimeFormat;
                return function(locale, options) {
                    options = options || {};
                    options.timeZone = '${fingerprint.timeZone || 'UTC'}';
                    return original.call(this, locale, options);
                };
            })();
        })()
    `
};