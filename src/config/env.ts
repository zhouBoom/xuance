interface EnvConfig {
  WS_URL: string;
  COOKIE_ENCRYPTION_KEY?: string;
  IS_SANDBOX: boolean;
}

const sandboxConfig: EnvConfig = {
  WS_URL: process.env.WS_URL || 'wss://test-openwechat.100tal.com/bfwebsocket/ws',
  IS_SANDBOX: true
};

const onlineConfig: EnvConfig = {
  WS_URL: process.env.WS_URL || 'wss://openwechat.100tal.com/bfwebsocket/ws',
  IS_SANDBOX: false
};

export const EnvConfig = process.env.IS_SANDBOX === 'true' ? sandboxConfig : onlineConfig;