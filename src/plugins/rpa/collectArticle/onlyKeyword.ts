import { Page, Browser, chromium, BrowserContext, ElementHandle } from 'playwright';
import { SubTask } from '../../../handler/receive-handler/collect-article';
import { CookieData, envDataManager } from '../../../account/envDataManager';

export class OnlyKeywordHandler {
    private page: Page | null = null;
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private subTaskInfo: SubTask;
    private viewedArticles: Set<string> = new Set();
    private isPaused: boolean = false;
    private isFinished: boolean = false;
    private retryCount: number = 0;
    private maxRetries: number = 3;
    private currentSpeedFactor: number = 1.0;
    // 记录最后的鼠标位置，便于后续连续移动
    private lastMousePos: { x: number; y: number } = { x: 0, y: 0 };

    constructor(subTaskInfo: SubTask) {
        this.subTaskInfo = subTaskInfo;
    }

    async execute() {
        try {
            // 初始化浏览器和页面
            await this.initializePage();
            // 注入登录态cookie
            await this.injectCookies();
            // 导航到目标页面
            await this.navigateToTarget();
            
            // 设置页面监听器
            await this.setupPageListeners();
            
            // 启动登录框监听器
            await this.startLoginModalWatcher();
          
            // 开始执行任务
            await this.executeTask();
            
        } catch (error) {
            await this.handleError(error);
        } finally {
            // 确保资源被正确清理
            await this.cleanup();
        }
    }

    private async initializePage() {
        try {
            await this.sendRendererLog({
                message: '开始初始化浏览器页面'
            });

            // 启动浏览器
            this.browser = await chromium.launch({
                headless: false, // 设置为false以便调试，生产环境可改为true
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor'
                ]
            });

            // 创建浏览器上下文
            this.context = await this.browser.newContext({
                viewport: { width: 1366, height: 768 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale: 'zh-CN',
                timezoneId: 'Asia/Shanghai'
            });

            // 创建页面
            this.page = await this.context.newPage();

            await this.sendRendererLog({
                message: '浏览器页面初始化成功'
            });

        } catch (error) {
            await this.sendRendererLog({
                message: '初始化浏览器页面失败',
                error: error.message
            });
            throw error;
        }
    }

    private async navigateToTarget() {
        if (!this.page) {
            throw new Error('页面未初始化');
        }

        try {
            await this.sendRendererLog({
                message: '导航到小红书首页'
            });

            // // 导航到小红书首页
            await this.page.goto('https://www.xiaohongshu.com/explore');
            await new Promise(resolve => setTimeout(resolve, 5000));

            // 注入鼠标可视化光标 + 鼠标拖尾特效
            await this.setupMouseVisualizer();
            await this.setupCursorTrailEffect();

            await this.sendRendererLog({
                message: '页面导航成功'
            });

        } catch (error) {
            await this.sendRendererLog({
                message: '页面导航失败',
                error: error.message
            });
            throw error;
        }
    }

    private async injectCookies() {
        if (!this.page || !this.context) {
            throw new Error('页面或上下文未初始化');
        }

        try {
            // 注入cookie字符串，占位符格式：${COOKIE_STRING}
            const cookieString = await envDataManager.loadPlatformCookies('xiaohongshu', this.subTaskInfo.account_id); 
            
            await this.sendRendererLog({
                message: '开始注入登录态cookie'
            });
            
            // 解析cookie字符串并注入
            if (cookieString) {
                const cookies = this.parseCookieString(cookieString);
                await this.context.addCookies(cookies);
                
                await this.sendRendererLog({
                    message: '登录态cookie注入成功'
                });
            } else {
                await this.sendRendererLog({
                    message: '警告：cookie字符串为空，使用占位符'
                });
            }
        } catch (error) {
            await this.sendRendererLog({
                message: '注入cookie失败',
                error: error.message
            });
            throw error;
        }
    }

    private async cleanup() {
        try {
            await this.sendRendererLog({
                message: '开始清理资源'
            });

            // 停止所有监听器
            await this.stopWatchers();

            // 关闭页面
            if (this.page && !this.page.isClosed()) {
                await this.page.close();
            }

            // 关闭浏览器上下文
            if (this.context) {
                await this.context.close();
            }

            // 关闭浏览器
            if (this.browser) {
                await this.browser.close();
            }

            await this.sendRendererLog({
                message: '资源清理完成'
            });

        } catch (error) {
            console.error('清理资源时出错:', error);
        }
    }

    private parseCookieString(cookieArray: CookieData[]): Array<{name: string, value: string, domain: string, path?: string}> {
        const cookies: Array<{name: string, value: string, domain: string, path?: string}> = [];
        
        try {
            for (const pair of cookieArray) {
                cookies.push({
                    name: pair.name,
                    value: pair.value,
                    domain: pair.domain,
                    path: pair.path
                });
            }
        } catch (error) {
            console.error('解析cookie字符串失败:', error);
        }
        
        return cookies;
    }

    private async executeTask() {
        try {
            // 1. 搜索关键词
            await this.searchKeywords();
            
            // 2. 设置API拦截
            await this.setupArticleInterception();
            
            // 3. 开始滚动和点击文章
            await this.scrollAndClickArticles();
            
        } catch (error) {
            throw error;
        }
    }

    private async setupPageListeners() {
        if (!this.page) {
            throw new Error('页面未初始化');
        }

        // 监听页面变化，检测人机验证和登录框
        this.page.on('framenavigated', async () => {
          return
            try {
                // 检测人机验证页面
                if (await this.checkCaptcha()) {
                    await this.handleCaptcha();
                    return;
                }
                
                // 检测登录框
                // if (await this.checkLoginModal()) {
                //     await this.handleLoginModal();
                //     return;
                // }
                
                // 如果从验证页面返回，恢复任务
                if (this.isPaused && !await this.checkCaptcha()) {
                    await this.sendRendererLog({
                        message: '验证页面消失，恢复任务'
                    });
                    this.isPaused = false;
                }
            } catch (error) {
                await this.sendRendererLog({
                    message: '页面监听器错误',
                    error: error.message
                });
            }
        });
    }

    private async waitForPageLoad() {
        if (!this.page) {
            throw new Error('页面未初始化');
        }

        await this.page.waitForTimeout(5000);
    }

    private async checkCaptcha(): Promise<boolean> {
        if (!this.page) {
            return false;
        }

        try {
            // 检查常见的验证码元素
            const captchaSelectors = [
                '.captcha', '.verify', '.verification', 
                '[id*="captcha"]', '[class*="verify"]',
                '.slider-verify', '.puzzle-verify'
            ];
            
            for (const selector of captchaSelectors) {
                if (await this.page.locator(selector).count() > 0) {
                    return true;
                }
            }
            
            // 检查页面标题或URL是否包含验证相关关键词
            const title = await this.page.title();
            const url = this.page.url();
            
            return title.includes('验证') || title.includes('captcha') || 
                   url.includes('verify') || url.includes('captcha');
        } catch {
            return false;
        }
    }

    private async handleCaptcha() {
        this.isPaused = true;
        
        await this.sendRendererLog({
            message: '检测到人机验证，暂停任务'
        });
        
        // 等待验证页面消失
        while (this.isPaused && await this.checkCaptcha()) {
            await this.page.waitForTimeout(1000);
        }
        
        if (!this.isPaused) {
            await this.sendRendererLog({
                message: '验证完成，继续执行任务'
            });
        }
    }

    private async searchKeywords() {
        if (!this.page) {
            throw new Error('页面未初始化');
        }

        // 等待3-5秒再开始操作，模拟真人行为
        await this.page.waitForTimeout(3000 + Math.random() * 2000);
        
        // 1. 点击搜索框并输入关键词
        const searchInput = await this.page.waitForSelector('#search-input', { timeout: 10000 });
        if (!searchInput) {
            throw new Error('找不到搜索输入框');
        }
        
        await this.humanMoveAndClick(searchInput);
        
        // 模拟人工输入关键词
        const keyword = this.subTaskInfo.keyword;
        await this.simulateTyping(searchInput, keyword);
        
        // 输入完成后稍等一下
        await this.page.waitForTimeout(500 + Math.random() * 500);
        
        // 2. 点击搜索按钮
        const searchBtn = await this.page.waitForSelector('.search-icon', { timeout: 5000 });
        if (!searchBtn) {
            throw new Error('找不到搜索按钮');
        }
        await this.humanMoveAndClick(searchBtn);

        // 3. 点击图文按钮
        await this.page.waitForTimeout(2000 + Math.random() * 1000);
        const noteBtn = await this.page.waitForSelector('#image', { timeout: 10000 });
        if (!noteBtn) {
            throw new Error('找不到图文按钮');
        }
        await this.humanMoveAndClick(noteBtn);
        
        // 等待搜索结果加载
        await this.page.waitForTimeout(2000 + Math.random() * 1000);
    }

    private async simulateTyping(element: any, text: string) {
        // 使用fill('')清空输入框
        await element.fill('');
        
        for (let i = 0; i < text.length; i++) {
            const currentChar = text.charAt(i);
            await element.type(currentChar, { delay: 0 });
            
            // 随机延迟模拟人工输入速度差异 (50-200ms)
            const typingDelay = Math.floor(Math.random() * 150) + 50;
            await this.page.waitForTimeout(typingDelay);
        }
    }

    private async setupArticleInterception() {
        if (!this.page) {
            throw new Error('页面未初始化');
        }

        // 设置网络拦截
        await this.page.route('**/api/sns/web/v1/feed**', async (route) => {
            const response = await route.fetch();
            const responseText = await response.text();
            
            try {
                const responseData = JSON.parse(responseText);
                
                if (JSON.stringify(responseData.data) === '{}') {
                    await this.sendRendererLog({
                        message: '处理响应数据失败-onlyKeyword',
                        error: 'responseData.data is empty'
                    });
                    await route.continue();
                    return;
                }
                
                // 发送文章数据
                await this.sendArticleData({
                    success: true,
                    response: responseText
                });
                
                await this.sendRendererLog({
                    message: '拦截到文章数据'
                });
                
            } catch (error) {
                await this.sendRendererLog({
                    message: '处理响应数据失败-onlyKeyword',
                    error: error.message
                });
            }
            
            await route.continue();
        });
    }

    private async scrollAndClickArticles() {
        if (!this.page) {
            throw new Error('页面未初始化');
        }

        await this.sendRendererLog({
            message: '开始模拟滚动和点击文章'
        });

        const scrollConfig = {
            minDelta: 50,
            maxDelta: 300,
            minDelay: 200,
            maxDelay: 800,
            readingPause: {
                probability: 0.6,
                minDuration: 800,
                maxDuration: 3000
            },
            detailView: {
                minDuration: 3000,
                maxDuration: 8000
            }
        };

        const targetArticleCount = this.subTaskInfo.limit * 2 || 200;

        while (!this.isFinished && !this.checkIsDone(targetArticleCount)) {
            try {
                // 等待恢复
                await this.waitForResume();
                
                if (this.isFinished) break;
                
                // 随机决定是否先滚动再查找，增加随机性
                if (Math.random() < 0.4) {
                    await this.smoothScroll(scrollConfig);
                }
                
                // 检查并点击文章
                const isTaskComplete = await this.checkAndClickArticle();
                if (isTaskComplete) {
                    await this.notifyDone();
                    break;
                }
                
                // 检查是否到达底部
                const isBottom = await this.checkIsBottom();
                if (isBottom) {
                    await this.sendRendererLog({
                        message: '到达页面底部'
                    });
                    await this.notifyDone();
                    break;
                }
                
                // 滚动页面
                await this.smoothScroll(scrollConfig);
                
                // 随机停顿
                if (Math.random() < scrollConfig.readingPause.probability) {
                    const pauseDuration = Math.floor(
                        Math.random() * 
                        (scrollConfig.readingPause.maxDuration - scrollConfig.readingPause.minDuration) + 
                        scrollConfig.readingPause.minDuration
                    );
                    await this.page.waitForTimeout(pauseDuration);
                }
                
                // 滚动间隔
                const delay = Math.floor(Math.random() * (scrollConfig.maxDelay - scrollConfig.minDelay) + scrollConfig.minDelay);
                await this.page.waitForTimeout(delay);
                
            } catch (error) {
                await this.sendRendererLog({
                    message: '滚动过程中出错',
                    error: error.message
                });
                break;
            }
        }
        
        // 任务结束时停止所有监听器
        await this.stopWatchers();
    }

    private async checkIsBottom(): Promise<boolean> {
        if (!this.page) {
            return true; // 如果页面未初始化，认为已到底部
        }

        try {
            const beforeScrollPosition = await this.page.evaluate(() => window.scrollY);
            await this.page.evaluate(() => window.scrollBy(0, 2));
            await this.page.waitForTimeout(50);
            const afterScrollPosition = await this.page.evaluate(() => window.scrollY);
            
            return beforeScrollPosition === afterScrollPosition;
        } catch {
            return false;
        }
    }

    private async smoothScroll(scrollConfig: any) {
        if (!this.page) {
            throw new Error('页面未初始化');
        }

        // 10% 概率向上滚动
        const direction = Math.random() < 0.1 ? -1 : 1;
        const deltaTotal = direction * Math.floor(Math.random() * (scrollConfig.maxDelta - scrollConfig.minDelta) + scrollConfig.minDelta);

        const segments = Math.floor(Math.random() * 4) + 4; // 4‒7 次滚轮
        const segmentDelta = deltaTotal / segments;

        // 在每次滚轮前，随机将鼠标移动到视口内的某个位置，再滚轮，模拟真实滚动
        const view = this.page.viewportSize();
        const viewW = view?.width || 1366;
        const viewH = view?.height || 768;

        const startX = Math.random() * viewW * 0.8 + viewW * 0.1;
        let currentYPos = Math.random() * viewH * 0.8 + viewH * 0.1;

        await this.page.mouse.move(startX, currentYPos);
        await this.updateCursor(startX, currentYPos);

        for (let i = 0; i < segments; i++) {
            // 轻微上下 jitter 模拟手抖
            currentYPos += (Math.random() * 20 - 10);
            await this.page.mouse.move(startX + (Math.random() * 20 - 10), currentYPos, { steps: 5 });

            // 滚轮
            await this.page.mouse.wheel(0, segmentDelta);

            // 每段随机暂停
            await this.page.waitForTimeout(Math.floor(Math.random() * 50) + 30);
        }
    }

    private async checkAndClickArticle(): Promise<boolean> {
        if (!this.page) {
            return true; // 如果页面未初始化，认为任务完成
        }

        try {
            if (this.checkIsDone(this.subTaskInfo.limit * 2 || 200)) {
                return true;
            }
            
            const noteItems = await this.page.locator('.note-item').all();
            const keywords = this.subTaskInfo.keywords;
            const likeThreshold = this.subTaskInfo.likes || 0;
            
            for (const noteItem of noteItems) {
                if (this.checkIsDone(this.subTaskInfo.limit * 2 || 200)) {
                    return true;
                }
                
                // 跳过视频类型
                const playIcon = await noteItem.locator('.play-icon').count();
                if (playIcon > 0) continue;
                
                // 获取标题
                const titleElement = await noteItem.locator('a.title span').first();
                if (await titleElement.count() === 0) continue;
                
                const title = await titleElement.textContent() || '';
                
                // 检查是否已经查看过
                if (this.viewedArticles.has(title)) continue;
                
                // 获取点赞数
                const likeCountElement = await noteItem.locator('.like-wrapper .count').first();
                const likeCountText = await likeCountElement.textContent() || '0';
                const likeCount = parseInt(likeCountText, 10) || 0;
                
                // 检查关键词匹配（当前实现为true，可以根据需要修改）
                const hasKeyword = true; // keywords.some(keyword => title.includes(keyword));
                
                if (hasKeyword && likeCount >= likeThreshold) {
                    await this.sendRendererLog({
                        message: `找到匹配文章: ${title}, 点赞数: ${likeCount}`
                    });
                    
                    // 添加到已查看集合
                    this.viewedArticles.add(title);
                    
                    // 点击文章
                    const coverLink = await noteItem.locator('.cover').first();
                    if (await coverLink.count() > 0) {
                        // 随机停顿
                        await this.page.waitForTimeout(200 + Math.random() * 500);
                        // 使用模拟鼠标移动的方式点击，而不是直接调用 click
                        await this.humanMoveAndClick(coverLink);
                        
                        // 等待详情页加载
                        await this.page.waitForTimeout(1500 + Math.random() * 1000);
                        
                        // 模拟阅读文章
                        await this.simulateArticleReading();
                        
                        // 关闭详情页
                        await this.closeArticleDetail();
                    }
                }
            }
            
            return false;
        } catch (error) {
            await this.sendRendererLog({
                message: '检查和点击文章失败',
                error: error.message
            });
            return false;
        }
    }

    private async simulateArticleReading() {
        if (!this.page) {
            return;
        }

        try {
            const detailContent = await this.page.locator('.note-content').first();
            if (await detailContent.count() === 0) return;
            
            // 在文章详情页模拟滚动
            const scrollTimes = Math.floor(Math.random() * 5) + 3;
            
            for (let i = 0; i < scrollTimes; i++) {
                await detailContent.evaluate((element, scrollIndex) => {
                    const scrollDistance = Math.floor(element.clientHeight * (0.6 + Math.random() * 0.4));
                    element.scrollBy(0, scrollDistance);
                }, i);
                
                // 模拟阅读停顿
                const readTime = Math.floor(Math.random() * 2000) + 1000;
                await this.page.waitForTimeout(readTime);
            }
            
            // 随机停留时间
            const viewDuration = Math.floor(Math.random() * 5000) + 3000;
            await this.page.waitForTimeout(viewDuration);
            
        } catch (error) {
            await this.sendRendererLog({
                message: '模拟阅读文章失败',
                error: error.message
            });
        }
    }

    private async closeArticleDetail() {
        if (!this.page) {
            return;
        }

        try {
            // 可能的关闭按钮选择器
            const closeSelectors = [
                '.close-circle',
                '.close.close-mask-dark',
                '.close-box',
                '.close-mask-dark',
                '[class*="close-circle"]',
                '[class*="close-mask"]'
            ];

            const closeButton = await this.page.locator(closeSelectors.join(', ')).first();
            if (await closeButton.count() > 0) {
                await this.sendRendererLog({
                    message: '关闭文章详情页'
                });
                
                await this.humanMoveAndClick(closeButton);
                await this.page.waitForTimeout(500 + Math.random() * 500);
            }
        } catch (error) {
            await this.sendRendererLog({
                message: '关闭文章详情页失败',
                error: error.message
            });
        }
    }

    private checkIsDone(targetArticleCount: number): boolean {
        return this.viewedArticles.size >= targetArticleCount && targetArticleCount > 0;
    }

    private async notifyDone() {
        await this.sendRendererLog({
            message: `任务完成，已查看文章数: ${this.viewedArticles.size}`
        });
        
        await this.sendTaskStatus({
            success: true,
            error: null
        });
        
        this.isFinished = true;
    }

    private async waitForResume() {
        while (this.isPaused && !this.isFinished) {
            await this.sendRendererLog({
                message: '任务暂停中，等待恢复...'
            });
            await this.page.waitForTimeout(500);
        }
    }

    private async handleError(error: any) {
      return;
        this.retryCount++;
        
        await this.sendRendererLog({
            message: `任务执行失败，重试次数: ${this.retryCount}/${this.maxRetries}`,
            error: error.message
        });
        
        if (this.retryCount < this.maxRetries) {
            // 等待一段时间后重试
            if (this.page) {
                await this.page.waitForTimeout(2000 + Math.random() * 3000);
                
                try {
                    // 刷新页面重新开始
                    await this.page.reload();
                    await this.execute();
                } catch (retryError) {
                    await this.handleError(retryError);
                }
            }
        } else {
            // 达到最大重试次数，停止所有监听器
            await this.stopWatchers();
            
            await this.sendTaskStatus({
                success: false,
                error: `任务失败，已达到最大重试次数: ${error.message}`
            });
        }
    }

    // 控制方法
    public pauseTask() {
        this.isPaused = true;
    }

    public resumeTask() {
        this.isPaused = false;
    }

    public stopTask() {
        this.isFinished = true;
        this.isPaused = false;
    }

    // 消息发送方法（需要根据实际项目调整）
    private async sendRendererLog(data: any) {
        // 这里需要根据你的项目实现日志发送逻辑
        console.log('Renderer Log:', {
            accountId: this.subTaskInfo.account_id,
            url: this.page?.url() || '',
            ...data
        });
    }

    private async sendTaskStatus(data: { success: boolean; error?: string | null }) {
        // 这里需要根据你的项目实现任务状态发送逻辑
        console.log('Task Status:', {
            accountId: this.subTaskInfo.account_id,
            index: this.subTaskInfo.index,
            rule_id: this.subTaskInfo.parent_id,
            subTaskInfo: this.subTaskInfo,
            ...data
        });
    }

    private async sendArticleData(data: { success: boolean; response: string }) {
        // 这里需要根据你的项目实现文章数据发送逻辑
        console.log('Article Data:', {
            accountId: this.subTaskInfo.account_id,
            index: this.subTaskInfo.index,
            rule_id: this.subTaskInfo.parent_id,
            subTaskInfo: this.subTaskInfo,
            ...data
        });
    }

    private async startLoginModalWatcher() {
        if (!this.page) {
            throw new Error('页面未初始化');
        }

        // 使用MutationObserver监听DOM变化，检测登录框
        await this.page.evaluate(() => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        // 检查新增的节点是否包含登录相关元素
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                const element = node as Element;
                                // 检查是否是登录相关的模态框
                                const loginSelectors = [
                                    '.login-modal', '.signin-modal', '.auth-modal',
                                    '[class*="login"]', '[class*="signin"]', '[class*="auth"]',
                                    '[id*="login"]', '[id*="signin"]', '[id*="auth"]'
                                ];
                                
                                for (const selector of loginSelectors) {
                                    if (element.matches && element.matches(selector)) {
                                        // 添加标记，表示发现了登录框
                                        (window as any).__LOGIN_MODAL_DETECTED__ = true;
                                        return;
                                    }
                                    if (element.querySelector && element.querySelector(selector)) {
                                        (window as any).__LOGIN_MODAL_DETECTED__ = true;
                                        return;
                                    }
                                }
                            }
                        });
                    }
                });
            });
            
            // 开始观察
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            
            // 将observer保存到window对象，方便后续停止
            (window as any).__LOGIN_MODAL_OBSERVER__ = observer;
        });
        
        // 启动定期检查
        this.startPeriodicLoginCheck();
    }

    private async startPeriodicLoginCheck() {
        // 每3秒检查一次是否出现登录框
        const checkInterval = setInterval(async () => {
            try {
                if (this.isFinished) {
                    clearInterval(checkInterval);
                    return;
                }
                
                if (await this.checkLoginModal()) {
                    clearInterval(checkInterval);
                    await this.handleLoginModal();
                }
            } catch (error) {
                await this.sendRendererLog({
                    message: '定期登录检查错误',
                    error: error.message
                });
            }
        }, 3000);
        
        // 保存interval ID，方便停止
        (this as any).__LOGIN_CHECK_INTERVAL__ = checkInterval;
    }

    private async checkLoginModal(): Promise<boolean> {
        if (!this.page) {
            return false;
        }

        try {
            // 检查常见的登录框选择器
            const loginSelectors = [
                '.login-modal', '.signin-modal', '.auth-modal', '.login-popup',
                '.login-dialog', '.signin-dialog', '.auth-dialog', '.login-overlay',
                '[class*="login-modal"]', '[class*="signin-modal"]', '[class*="auth-modal"]',
                '[id*="login-modal"]', '[id*="signin-modal"]', '[id*="auth-modal"]',
                '.modal:has(.login)', '.modal:has(.signin)', '.popup:has(.login)',
                // 小红书特定的选择器
                '.login-container', '.sign-container', '.auth-container'
            ];
            
            for (const selector of loginSelectors) {
                const element = await this.page.locator(selector).first();
                if (await element.count() > 0) {
                    // 检查元素是否可见
                    const isVisible = await element.isVisible();
                    if (isVisible) {
                        return true;
                    }
                }
            }
            
            // 检查是否有登录相关的输入框（用户名、密码、手机号等）
            const loginInputSelectors = [
                'input[type="password"]',
                'input[placeholder*="密码"]', 'input[placeholder*="手机"]',
                'input[placeholder*="邮箱"]', 'input[placeholder*="账号"]',
                'input[placeholder*="用户名"]', 'input[name*="password"]',
                'input[name*="username"]', 'input[name*="phone"]'
            ];
            
            for (const selector of loginInputSelectors) {
                const inputs = await this.page.locator(selector).all();
                for (const input of inputs) {
                    // 检查输入框是否在可见的模态框中
                    const isVisible = await input.isVisible();
                    if (isVisible) {
                        // 进一步检查是否在模态框容器中
                        const modalParent = await input.locator('xpath=ancestor::*[contains(@class,"modal") or contains(@class,"popup") or contains(@class,"dialog")]').first();
                        if (await modalParent.count() > 0) {
                            return true;
                        }
                    }
                }
            }
            
            // 检查JavaScript设置的标记
            const jsDetected = await this.page.evaluate(() => {
                return (window as any).__LOGIN_MODAL_DETECTED__ === true;
            });
            
            if (jsDetected) {
                // 重置标记
                await this.page.evaluate(() => {
                    (window as any).__LOGIN_MODAL_DETECTED__ = false;
                });
                return true;
            }
            
            return false;
        } catch (error) {
            await this.sendRendererLog({
                message: '检查登录框失败',
                error: error.message
            });
            return false;
        }
    }

    private async handleLoginModal() {
      return
        await this.sendRendererLog({
            message: '检测到登录框弹窗，停止任务'
        });
        
        await this.sendTaskStatus({
            success: false,
            error: '检测到登录框，登录态可能已失效，需要重新登录'
        });
        
        // 停止所有监听器
        await this.stopWatchers();
        
        this.isFinished = true;
    }

    private async stopWatchers() {
        try {
            // 停止MutationObserver
            if (this.page && !this.page.isClosed()) {
                await this.page.evaluate(() => {
                    const observer = (window as any).__LOGIN_MODAL_OBSERVER__;
                    if (observer) {
                        observer.disconnect();
                        delete (window as any).__LOGIN_MODAL_OBSERVER__;
                    }
                    delete (window as any).__LOGIN_MODAL_DETECTED__;
                });
            }
            
            // 停止定期检查
            const checkInterval = (this as any).__LOGIN_CHECK_INTERVAL__;
            if (checkInterval) {
                clearInterval(checkInterval);
                delete (this as any).__LOGIN_CHECK_INTERVAL__;
            }
        } catch (error) {
            await this.sendRendererLog({
                message: '停止监听器失败',
                error: error.message
            });
        }
    }

    /**
     * 在页面上插入一个可视化的小圆点，用来显示当前鼠标位置
     */
    private async setupMouseVisualizer() {
        if (!this.page) return;
        try {
            await this.page.evaluate(() => {
                if ((window as any).__RPA_CURSOR__) return;
                const cursor = document.createElement('div');
                cursor.id = 'rpa-cursor';
                Object.assign(cursor.style, {
                    position: 'fixed',
                    top: '0px',
                    left: '0px',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: '#007BFF',
                    boxShadow: '0 0 8px rgba(0, 123, 255, 0.8)',
                    zIndex: '2147483647',
                    pointerEvents: 'none',
                    transition: 'transform 0.02s linear'
                });
                document.body.appendChild(cursor);
                (window as any).__RPA_CURSOR__ = cursor;
            });
        } catch (e) {
            // ignore
        }
    }

    /**
     * 更新页面中可视化光标的位置
     */
    private async updateCursor(x: number, y: number) {
        if (!this.page) return;
        await this.page.evaluate(({ x, y }) => {
            const cursor = (window as any).__RPA_CURSOR__ as HTMLElement;
            if (cursor) {
                cursor.style.transform = `translate(${x}px, ${y}px)`;
            }
        }, { x, y });
    }

    /**
     * 模拟人类移动鼠标到元素并点击，同时更新光标位置
     */
    private async humanMoveAndClick(element: any) {
        if (!this.page) return;

        const box = await element.boundingBox();
        if (!box) {
            await element.click({ delay: 50 + Math.random() * 100 });
            return;
        }

        // 在元素内部随机选择一个点击点
        const targetX = box.x + box.width * (0.2 + Math.random() * 0.6);
        const targetY = box.y + box.height * (0.2 + Math.random() * 0.6);

        // 当前鼠标位置（第一次默认随机一个屏幕边缘位置）
        let currentX = this.lastMousePos.x;
        let currentY = this.lastMousePos.y;
        if (currentX === 0 && currentY === 0) {
            currentX = Math.random() * 100 + 10;
            currentY = Math.random() * 100 + 10;
            await this.page.mouse.move(currentX, currentY);
            await this.updateCursor(currentX, currentY);
        }

        // 利用二次贝塞尔曲线生成更自然的弧线运动轨迹
        // 生成一个控制点，位置是起终点中点再随机偏移
        const midX = (currentX + targetX) / 2;
        const midY = (currentY + targetY) / 2;
        const offsetRange = Math.max(Math.abs(targetX - currentX), Math.abs(targetY - currentY)) * 0.3;
        const cpX = midX + (Math.random() * offsetRange - offsetRange / 2);
        const cpY = midY + (Math.random() * offsetRange - offsetRange / 2);

        const steps = Math.floor(Math.random() * 15) + 20; // 20-34 步
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            // 二次贝塞尔公式
            const interX = (1 - t) * (1 - t) * currentX + 2 * (1 - t) * t * cpX + t * t * targetX + (Math.random() * 2 - 1); // 轻微抖动
            const interY = (1 - t) * (1 - t) * currentY + 2 * (1 - t) * t * cpY + t * t * targetY + (Math.random() * 2 - 1);

            await this.page.mouse.move(interX, interY);
            await this.updateCursor(interX, interY);

            // 随机步长时间，0~20ms + 基础 5ms
            await this.page.waitForTimeout(5 + Math.random() * 20);
        }

        // 最终位置
        await this.page.mouse.move(targetX, targetY);
        await this.updateCursor(targetX, targetY);
        await this.page.waitForTimeout(30 + Math.random() * 40);

        // 点击
        await this.page.mouse.down();
        await this.page.waitForTimeout(30 + Math.random() * 40);
        await this.page.mouse.up();

        // 记录最后位置
        this.lastMousePos = { x: targetX, y: targetY };
    }

    /**
     * 注入第三方库 cursor-effects，实现高级拖尾效果（宽度随速度变化等）
     */
    private async setupCursorTrailEffect() {
        if (!this.page) return;

        try {
            // 如果已经注入过则跳过
            const exists = await this.page.evaluate(() => !!(window as any).__CURSOR_EFFECTS__);
            if (exists) return;

            await this.page.addScriptTag({ url: 'https://unpkg.com/cursor-effects@latest/dist/browser.js' });

            await this.page.evaluate(() => {
                try {
                    // trailingCursor 拖尾效果，粒子数量及速率可以根据需要调整
                    new (window as any).cursoreffects.trailingCursor({
                        particles: 18,
                        rate: 0.45,
                        // 自定义基底图片可用 baseImageSrc
                    });
                    (window as any).__CURSOR_EFFECTS__ = true;
                } catch (e) {
                    console.warn('cursor-effects 注入失败', e);
                }
            });
        } catch (error) {
            await this.sendRendererLog({
                message: 'cursor-effects 注入失败',
                error: (error as any).message
            });
        }
    }
}

// 导出工厂函数
export const getOnlyKeywordHandler = (subTaskInfo: SubTask) => {
    return new OnlyKeywordHandler(subTaskInfo);
};
