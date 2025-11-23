module.exports = {
  appId: process.env.NODE_ENV === 'sandbox' ? "com.tal.xuance.sandbox" : "com.tal.xuance",
  productName: process.env.NODE_ENV === 'sandbox' ? '玄策-沙箱环境' : '玄策',
  files: [
    "dist/**/*",
    "client/dist/**/*",
    "dll/*",
    "assets/*",
    "main.js",
    "tal-oss.online.json",
    "tal-oss.test.json",
    "preload.js",
    "node_modules/**/*",
    ".env"
  ],
  directories: {
    output: "dist"
  },
  extraResources: [
    "assets/**/*",
    {
        "from": ".env",
        "to": "../.env" 
    }
  ],
  win: {
    target: "nsis",
    requestedExecutionLevel: "requireAdministrator"
  },
  mac: {
    target: ["dmg"],
    hardenedRuntime: true,
    gatekeeperAssess: false
  },
  artifactName: "xuance-${env.NODE_ENV}-${version}-${env.BUILD_TIME}.${ext}",
  asar: false
}