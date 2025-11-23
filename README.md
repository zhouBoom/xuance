# udc-xuance

玄策，自动化任务系统

```shell
udc-xuance/
├── src/
│   ├── main/
│   │   ├── main.ts                       # Electron 主进程入口，初始化服务并处理 API 请求
│   │   ├── ipcHandlers.ts                # 本地进程通信接口，用于与渲染进程和各模块交互
│   │   ├── api/                          # API 服务目录
│   │   │   ├── apiServer.ts              # Express 或 Fastify 服务器，用于处理 HTTP 或 WebSocket 请求
│   │   │   ├── taskRoutes.ts             # 任务相关的 API 路由定义
│   │   │   ├── accountRoutes.ts          # 账户相关的 API 路由定义，包括获取、添加、删除账号等操作
│   │   │   └── strategyRoutes.ts         # 策略管理的 API 路由定义
│   │   ├── config/
│   │   │   ├── defaultConfig.json        # 默认任务配置和规则
│   │   │   └── configManager.ts          # 配置管理模块，用于加载和动态更新配置
│   │   ├── tasks/                        # 任务管理模块
│   │   │   ├── taskManager.ts            # 任务管理器，负责全局任务分配和状态监控
│   │   │   ├── taskInstance.ts           # 任务实例模块，每个实例管理一个任务和浏览器进程
│   │   │   ├── taskRenderer.ts           # 管理每个任务的渲染进程实例，创建和控制窗口或隐藏后台进程
│   │   │   └── taskStatusStore.ts        # 任务状态存储模块，负责任务的状态持久化
│   │   ├── accounts/                     # 账户管理模块
│   │   │   ├── accountManager.ts         # 账户管理器，管理所有账户的状态
│   │   │   ├── accountDataStore.ts       # 账户数据存储，用于存储账户信息和状态
│   │   │   ├── accountLoginFlow.ts       # 账号添加流程管理，用于弹出选择平台和嵌入登录页面的弹框
│   │   │   └── accountBrowser.ts         # 用于在浏览器进程展示用户选择的账号内容，支持多进程
│   │   ├── strategies/                   # 策略管理模块
│   │   │   ├── strategyManager.ts        # 策略管理器，用于加载和管理不同的策略
│   │   │   └── strategyConfig.ts         # 策略配置模块，处理策略的配置和动态更新
│   │   ├── hooks/                        # 底层 Hook 控制层
│   │   │   ├── hookController.cpp        # C++ 实现的底层 Hook 控制层
│   │   │   ├── hookBindings.ts           # Node.js 和 C++ 之间的绑定接口
│   │   │   ├── dataInterceptor.ts        # 数据拦截模块，具体实现数据的过滤与拦截
│   │   │   └── requestHandler.ts         # 请求发起与自定义请求模块
│   │   ├── plugins/                      # 插件模块
│   │   │   ├── jsHook/
│   │   │   │   └── jsHookPlugin.ts       # JS Hook 插件，负责页面内 DOM 操作
│   │   │   ├── rpaHook/
│   │   │   │   └── rpaHookPlugin.ts      # RPA 插件，模拟物理层的操作
│   │   │   └── pluginManager.ts          # 插件管理模块，负责动态加载和切换页面操作插件
│   │   ├── tabs/                         # 浏览器进程管理模块
│   │   │   ├── tabManager.ts             # Tab 管理器，管理和跟踪所有浏览器进程的实例
│   │   │   ├── tabInstance.ts            # Tab 实例模块，表示每个独立的浏览器实例
│   │   │   ├── tabWorker.ts              # 持续运行的 Tab 工作器，确保后台任务执行
│   │   │   ├── tabNavigation.ts          # 浏览器导航功能模块，提供刷新、跳转和返回功能
│   │   │   └── tabState.ts               # 每个浏览器进程的状态管理模块
│   ├── utils/
│   │   ├── Logger.ts                     # 日志工具，用于记录系统日志和任务执行情况
│   │   └── utils.ts                      # 通用工具函数
│   ├── fingerprinting/                   # 伪装和指纹管理模块
│   │   ├── userAgentManager.ts           # 管理 User-Agent 的伪装，生成和分配不同的 User-Agent
│   │   ├── proxyManager.ts               # 管理代理 IP 的分配和切换
│   │   ├── fingerprintConfig.json        # 伪装指纹配置文件，用于定义各个伪装参数
│   │   ├── screenSpoof.ts                # 伪装屏幕分辨率和 devicePixelRatio
│   │   ├── timezoneSpoof.ts              # 时区伪装，设置不同的时区
│   │   ├── webrtcSpoof.ts                # WebRTC IP 伪装，防止泄露本地 IP
│   │   ├── canvasSpoof.ts                # Canvas 指纹伪装（JavaScript 实现）
│   │   ├── webglSpoof.ts                 # WebGL 指纹伪装（JavaScript 实现）
│   │   ├── audioSpoof.ts                 # 音频指纹伪装（JavaScript 实现）
│   │   ├── advanced/                     # 高级指纹伪装（C++ 实现）
│   │   │   ├── webglSpoof.cpp            # WebGL 指纹伪装的 C++ 实现
│   │   │   ├── audioSpoof.cpp            # 音频指纹伪装的 C++ 实现
│   │   │   ├── canvasSpoof.cpp           # Canvas 指纹伪装的 C++ 实现
│   │   │   └── advancedFingerprintBindings.ts # TypeScript 和 C++ 指纹伪装的绑定接口
│   │   └── fingerprintManager.ts         # 综合指纹管理模块，根据实例分配不同的伪装配置
│
├── client/                               # 前端界面（Web 应用）
│   ├── public/
│   │   └── index.html                    # 主控界面的 HTML 文件
│   ├── src/
│   │   ├── App.tsx                       # 前端应用的主组件（使用 React 和 TypeScript）
│   │   ├── api/
│   │   │   ├── apiClient.ts              # 封装与 Electron API 服务的通信（HTTP 或 WebSocket 客户端）
│   │   │   ├── accountApi.ts             # 与账户相关的 API 请求接口，包含添加账号等操作
│   │   │   ├── taskApi.ts                # 与任务相关的 API 请求接口
│   │   │   └── strategyApi.ts            # 与策略相关的 API 请求接口
│   │   ├── components/
│   │   │   ├── Dashboard.tsx             # 工作台组件，显示整体统计信息
│   │   │   ├── AccountManager.tsx        # 账户管理组件，用于添加、编辑和删除账户
│   │   │   ├── AddAccountModal.tsx       # 添加账户模态窗口，展示平台选择和登录页面
│   │   │   ├── TaskManager.tsx           # 任务管理组件，显示所有任务状态和控制任务
│   │   │   ├── StrategyPanel.tsx         # 策略选择面板，用于不同策略任务的启动和监控
│   │   │   ├── TaskTabs.tsx              # Tab 组件，用于切换和展示多个浏览器实例
│   │   │   ├── TaskProgress.tsx          # 任务进度组件，显示任务执行状态和进展
│   │   │   ├── BrowserView.tsx           # 浏览器嵌入组件，呈现每个任务的实际浏览器内容
│   │   │   └── CreateTaskModal.tsx       # 创建任务的模态窗口，选择账户和策略
│   │   ├── styles/
│   │   │   └── style.css                 # 主控界面样式文件
│   │   └── index.tsx                     # 前端应用的入口文件
│   ├── package.json                      # 前端依赖和脚本
│   └── webpack.config.js                 # Webpack 配置，用于打包前端资源
│
├── cpp-modules/                          # C++ 模块目录，包含深度伪装模块
│   ├── WebGLHook/
│   │   ├── webglHook.cpp                 # WebGL 渲染伪装模块，拦截和修改 GPU 渲染特征
│   ├── AudioHook/
│   │   ├── audioHook.cpp                 # 音频指纹伪装模块
│   ├── CanvasHook/
│   │   ├── canvasHook.cpp                # Canvas 渲染伪装模块，拦截并修改绘图特征
│   └── build/                            # 编译生成的二进制文件
│
├── configs/
│   ├── task1.json                        # 示例任务配置文件 1
│   ├── task2.json                        # 示例任务配置文件 2
│   └── ...                               # 更多任务配置文件
│
├── tsconfig.json                         # TypeScript 配置文件
├── package.json                          # 项目依赖和脚本
├── README.md                             # 项目说明文档
└── init_project.sh                       # 项目初始化脚本
```

为了高效地开发 udc-xuance 项目，我们按照以下顺序进行代码编写和测试：

1. 基础设置和配置管理

- 任务：设置项目的基本环境，包括 TypeScript 配置文件（tsconfig.json）、项目依赖文件（package.json）、项目初始化脚本（init_project.sh）等。
- 步骤：
    1. 配置 tsconfig.json 和 package.json。
    2. 安装必要的依赖包，比如 Electron、Express、TypeScript、React 等。
    3. 运行 init_project.sh 初始化项目结构。

1.Electron 主进程

- 任务：实现 main.ts 文件，启动 Electron 主进程和 API 服务器。
- 步骤：
    1. 编写 main.ts 以启动应用，配置主窗口，并加载前端界面。
    2. 编写 ipcHandlers.ts，用于 Electron 主进程和渲染进程的通信。
    3. 实现 apiServer.ts，用 Express 或 Fastify 处理 API 请求。

2.前端界面

- 任务：开发前端应用，定义界面布局和交互逻辑。
- 步骤：
    1. 编写前端 index.tsx 和 App.tsx，设置应用的入口和主组件结构。
    2. 开发主要界面组件，包括 Dashboard.tsx、AccountManager.tsx、TaskManager.tsx、StrategyPanel.tsx、TaskTabs.tsx 等。
    3. 添加 BrowserView.tsx 组件，用于嵌入每个任务的浏览器实例。
    4. 编写 API 客户端接口（apiClient.ts、taskApi.ts、accountApi.ts、strategyApi.ts）以便与主进程通信。

3.任务和浏览器管理

- 任务：实现多任务管理和浏览器实例控制逻辑。
- 步骤：
    1. 编写 taskManager.ts 和 taskInstance.ts，用于创建、管理和跟踪任务。
    2. 在 tabManager.ts 中实现多浏览器实例管理，确保每个任务可以拥有独立的浏览器进程。
    3. 编写 taskRenderer.ts 和 BrowserView.tsx，用于控制渲染进程的生命周期并将其嵌入到界面中。

4.账户和策略管理

- 任务：实现账户和策略的管理逻辑，支持多账户和策略切换。
- 步骤：
    1. 实现 accountManager.ts 和 strategyManager.ts，支持账户和策略的增删改查。
    2. 使用 accountRoutes.ts 和 strategyRoutes.ts 设置相关 API 路由。

5.底层 Hook 和插件管理

- 任务：开发底层 C++ Hook 和 JS 插件的接口，以支持高级数据拦截、伪装等操作。
- 步骤：
    1. 编写 hookController.cpp，在浏览器层面实现底层 Hook 操作（如拦截、修改请求）。
    2. 通过 hookBindings.ts 连接 Node.js 和 C++ 代码，确保应用可以控制 Hook 层。
    3. 开发 jsHookPlugin.ts 和 rpaHookPlugin.ts 插件，用于不同场景的操作。

6.指纹伪装和代理管理

- 任务：实现指纹伪装和代理管理模块，防止被检测。
- 步骤：
    1. 实现指纹伪装模块，如 userAgentManager.ts、screenSpoof.ts、webrtcSpoof.ts 等。
    2. 编写高级 C++ 指纹伪装模块，如 webglSpoof.cpp、canvasSpoof.cpp 等，增强防检测能力。
    3. 在 fingerprintManager.ts 中管理不同的伪装配置，根据任务需要分配不同的指纹配置。

7.日志和配置管理

- 任务：实现日志记录和配置动态更新，确保应用状态的可追踪性。
- 步骤：
    1. 编写 Logger.ts，记录系统运行和任务执行情况。
    2. 在 configManager.ts 中实现配置的动态加载和更新功能，确保应用可以根据配置文件调整行为。

8.测试和调试

- 任务：运行和调试代码，确保每个模块和功能正常工作。
- 步骤：
    1. 针对 API、指纹伪装、任务和插件模块编写测试脚本。
    2. 完善前后端联调，确保数据通信流畅无误。

## 要解决“无法打开源文件 'emscripten/emscripten.h'”的错误，您可以尝试以下步骤

1. **安装 Emscripten SDK**：确保您已经安装了 Emscripten SDK。可以通过以下命令安装：

   ```bash
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ./emsdk_env.sh
   ```

2. **检查路径**：确保您的编译器能够找到 Emscripten 的头文件。通常，安装 Emscripten 后，头文件会在 Emscripten SDK 的目录中
3. 设置编译器路径：在编译时，确保包含 Emscripten 的头文件路径。例如，使用 -I 选项指定头文件路径

   ```bash
   emcc -I/path/to/emscripten/system/include your_file.cpp -o your_output.html
   ```

   将 /path/to/emscripten/system/include 替换为 Emscripten 安装目录中的实际路径。
通过这些步骤，您应该能够解决头文件找不到的问题


## 有些包需要编译原生模块，需要以下步骤解决
```shell
# 1. 安装windows-build-tools
npm install --global --production windows-build-tools # 现在不用安装了，因为windows-build-tools已经包含在node-gyp中
# 2. 安装node-gyp
npm install -g node-gyp
```
确保Python环境变量已经配置好，如果没有配置好，需要配置好Python环境变量
```shell
python --version
```
如果没有python，建议安装python2.7版本，然后配置环境变量
```shell
npm config set python python2.7
npm config set msvs_version 2017
```
然后重新安装包
```shell
rm -rf node_modules
npm cache clean --force
cnpm install
```

**如果还是不行**，可以尝试管理员权限运行powdershell或cmd
指定node-gyp配置：
```shell
npm install -global --production windows-build-tools --vs2015
```
检查visual studio安装：
1. 确保安装了visual studio 2015或以上版本
2. 确保安装了visual studio 2015或以上版本的c++开发工具包

**如果仍然有问题**，可以考虑：
1. 使用预编译版本
2. 降级Nodejs版本
3. 使用替代包
建议先尝试安装编译工具，通常能够解决大多数问题


```shell
$env:ELECTRON_MIRROR = "https://github.com/electron/electron/releases/download/"
npm install
```

**日志搜索**
```shell
node search-log.js "c:\temp\log\wecomtool-combine-allday-2025-04-29.log" "T2504291559" --output "results.log" 
```



直接使用 npm rebuild better-sqlite3，它会根据系统的 Node.js 版本编译，这可能导致与 Electron 环境不兼容。

npm install -g electron-rebuild && electron-rebuild -f -w better-sqlite3



## 编译ffi

npm install -g @mapbox/node-pre-gyp
npm install -g node-gyp

# 2. 安装 Visual Studio Build Tools Core（最小安装）
# 只选择 "MSVC v143 - VS 2022 C++ x64/x86 build tools"

# 3. 重新编译
npm run electron:rebuild


# 检查 Python 版本
python --version

# 如果是 Python 3.12+，安装 setuptools
pip install setuptools

# 然后重新尝试
npm run electron:rebuild