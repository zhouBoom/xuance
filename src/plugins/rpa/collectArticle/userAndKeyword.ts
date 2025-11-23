import { Page } from 'playwright';
import { SubTask } from '../../../handler/receive-handler/collect-article';

export class UserAndKeywordHandler {
    private page: Page;
    private subTaskInfo: SubTask;
    private viewedArticles: Set<string> = new Set();
    private isPaused: boolean = false;
    private isFinished: boolean = false;
    private currentSpeedFactor: number = 1.0;

    constructor(page: Page, subTaskInfo: SubTask) {
        this.page = page;
        this.subTaskInfo = subTaskInfo;
    }

    async execute() {
        try {
            const currentUrl = this.page.url();
            
            if (currentUrl.includes('https://www.xiaohongshu.com/explore')) {
                await this.searchAndJump();
            } else if (currentUrl.includes('https://www.xiaohongshu.com/user/profile/')) {
                await this.setupArticleInterception();
                await this.scrollToBottom();
            }
        } catch (error) {
            await this.sendRendererLog({
                message: '执行任务失败-userAndKeyword,line17',
                error: error.message
            });
            
            await this.sendTaskStatus({
                success: false,
                error: error.message + ' line: 26' + error
            });
        }
    }

    private async searchAndJump() {
        try {
            // 1. 点击搜索框并模拟逐字输入
            const searchInput = await this.page.waitForSelector('#search-input');
            if (!searchInput) {
                throw new Error('找不到搜索输入框');
            }
            
            await searchInput.click();
            
            // 模拟人工输入，每个字符之间有随机延迟
            const authorId = this.subTaskInfo.authorId;
            await this.simulateTyping(searchInput, authorId);
            
            // 2. 点击搜索按钮前稍作停顿，模拟人类思考
            const thinkingDelay = Math.floor(Math.random() * 800) + 500;
            await this.page.waitForTimeout(thinkingDelay);
            
            const searchBtn = await this.page.waitForSelector('.search-icon');
            if (!searchBtn) {
                throw new Error('找不到搜索按钮');
            }
            await searchBtn.click();

            // 3. 如果搜索到了目标元素直接点击
            const resultWaitTime = Math.floor(Math.random() * 1000) + 1500;
            await this.page.waitForTimeout(resultWaitTime);
            
            const firstTargetUser = await this.page.locator('.user-desc')
                .filter({ hasText: this.subTaskInfo.authorId })
                .first();
            
            if (await firstTargetUser.count() > 0) {
                const parentLink = await firstTargetUser.locator('..').locator('a');
                if (await parentLink.count() > 0) {
                    await parentLink.click();
                    return;
                }
            }

            // 4. 点击用户按钮
            const tabWaitTime = Math.floor(Math.random() * 500) + 1000;
            await this.page.waitForTimeout(tabWaitTime);
            
            const userTab = await this.page.locator('div.channel#user');
            if (await userTab.count() === 0) {
                await this.sendRendererLog({
                    message: '没找到用户标签',
                    error: ''
                });
                await this.sendTaskStatus({
                    success: false,
                    error: '没找到用户标签+line75'
                });
                return;
            }
            
            await userTab.click();
            
            // 5. 查找并点击目标用户
            const userListWaitTime = Math.floor(Math.random() * 800) + 1200;
            await this.page.waitForTimeout(userListWaitTime);
            
            const targetUser = await this.page.locator('.user-desc')
                .filter({ hasText: this.subTaskInfo.authorId })
                .first();
            
            if (await targetUser.count() === 0) {
                await this.sendRendererLog({
                    message: '没找到目标用户',
                    error: ''
                });
                await this.sendTaskStatus({
                    success: false,
                    error: '找不到目标用户+line60'
                });
                return;
            }
            
            const parentLink = await targetUser.locator('..').locator('a');
            if (await parentLink.count() > 0) {
                await parentLink.click();
            }
        } catch (error) {
            throw error;
        }
    }

    private async simulateTyping(element: any, text: string) {
        await element.clear();
        
        for (let i = 0; i < text.length; i++) {
            const currentChar = text.charAt(i);
            await element.type(currentChar, { delay: 0 });
            
            // 随机延迟模拟人工输入速度差异 (30-150ms)
            const typingDelay = Math.floor(Math.random() * 120) + 30;
            await this.page.waitForTimeout(typingDelay);
        }
    }

    private async setupArticleInterception() {
        // 设置网络拦截
        await this.page.route('**/api/sns/web/v1/feed**', async (route) => {
            const response = await route.fetch();
            const responseText = await response.text();
            
            try {
                const responseData = JSON.parse(responseText);
                
                if (JSON.stringify(responseData.data) === '{}') {
                    await this.sendRendererLog({
                        message: '处理响应数据失败,line81',
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
                    message: '处理响应数据失败,line96' + error,
                    error: error.message
                });
            }
            
            await route.continue();
        });
    }

    private async scrollToBottom() {
        await this.sendRendererLog({
            message: '开始模拟滚动'
        });

        const scrollConfig = {
            minDelta: 60,
            maxDelta: 450,
            minDelay: 100,
            maxDelay: 800,
            readingPause: {
                probability: 0.65,
                minDuration: 800,
                maxDuration: 3000
            },
            scrollSpeed: {
                acceleration: { min: 0.85, max: 1.15 },
                deceleration: { min: 0.85, max: 0.95 },
                changeProb: 0.3
            },
            detailView: {
                minDuration: 2000,
                maxDuration: 8000
            }
        };

        const targetArticleCount = this.subTaskInfo.limit * 2 || 0;

        while (!this.isFinished && !this.checkIsDone(targetArticleCount)) {
            try {
                await this.waitForResume();

                // 检查是否到达底部
                const beforeScrollPosition = await this.page.evaluate(() => window.scrollY);
                await this.page.evaluate(() => window.scrollBy(0, 2));
                await this.page.waitForTimeout(50);
                const afterScrollPosition = await this.page.evaluate(() => window.scrollY);
                
                const isBottom = beforeScrollPosition === afterScrollPosition;

                const isTaskComplete = await this.checkAndClickArticle();
                
                await this.sendRendererLog({
                    message: '执行滚动动作完成',
                    isBottom: isBottom,
                    beforeScrollPosition,
                    afterScrollPosition,
                    viewedArticles: this.viewedArticles.size,
                    targetArticleCount: targetArticleCount,
                    noteItems: await this.page.locator('.note-item').count()
                });

                if (isTaskComplete || isBottom) {
                    await this.sendRendererLog({
                        message: isTaskComplete ? '已完成目标文章数' : '到达底部',
                        isBottom: isBottom,
                        viewedArticles: this.viewedArticles.size,
                        targetArticleCount: targetArticleCount
                    });
                    await this.notifyDone();
                    break;
                }

                // 随机改变滚动速度
                if (Math.random() < scrollConfig.scrollSpeed.changeProb) {
                    if (Math.random() > 0.5) {
                        this.currentSpeedFactor *= (scrollConfig.scrollSpeed.acceleration.min + 
                            Math.random() * (scrollConfig.scrollSpeed.acceleration.max - scrollConfig.scrollSpeed.acceleration.min));
                    } else {
                        this.currentSpeedFactor *= (scrollConfig.scrollSpeed.deceleration.min + 
                            Math.random() * (scrollConfig.scrollSpeed.deceleration.max - scrollConfig.scrollSpeed.deceleration.min));
                    }
                    this.currentSpeedFactor = Math.max(0.6, Math.min(this.currentSpeedFactor, 1.8));
                }

                // 计算滚动距离
                const baseDistance = Math.floor(Math.random() * (scrollConfig.maxDelta - scrollConfig.minDelta) + scrollConfig.minDelta);
                const deltaY = Math.floor(baseDistance * this.currentSpeedFactor);

                // 平滑滚动
                await this.smoothScroll(deltaY);

                // 随机停顿
                await this.waitForResume();
                if (Math.random() < scrollConfig.readingPause.probability) {
                    const pauseDuration = Math.floor(
                        Math.random() * (scrollConfig.readingPause.maxDuration - scrollConfig.readingPause.minDuration) + 
                        scrollConfig.readingPause.minDuration
                    );
                    await this.page.waitForTimeout(pauseDuration);
                }

                // 下一次滚动前的随机延迟
                const delay = Math.floor(Math.random() * (scrollConfig.maxDelay - scrollConfig.minDelay) + scrollConfig.minDelay);
                await this.page.waitForTimeout(delay);

            } catch (error) {
                await this.sendRendererLog({
                    message: 'scrollToBottom error,line294' + error,
                    error: error.message
                });
                await this.sendTaskStatus({
                    success: false,
                    error: error.message
                });
                break;
            }
        }
    }

    private async smoothScroll(deltaY: number) {
        const startY = await this.page.evaluate(() => window.scrollY);
        const targetY = startY + deltaY;
        const steps = Math.floor(Math.random() * 80) + 60;
        const baseStepTime = Math.random() * 2 + 0.8;

        for (let i = 0; i < steps; i++) {
            const progress = i / (steps - 1);
            const easedProgress = this.easeInOutCubic(progress);
            const currentY = startY + (targetY - startY) * easedProgress;
            
            await this.page.evaluate((y) => window.scrollTo(0, y), currentY);
            
            const stepTime = baseStepTime * (0.8 + Math.random() * 0.4);
            await this.page.waitForTimeout(stepTime);
        }
    }

    private easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    private async checkAndClickArticle(): Promise<boolean> {
        try {
            await this.waitForResume();

            const targetArticleCount = this.subTaskInfo.limit * 2 || 0;
            if (this.checkIsDone(targetArticleCount)) {
                await this.notifyDone();
                return true;
            }

            const noteItems = await this.page.locator('.note-item').all();
            const keywords = this.subTaskInfo.keywords;
            const likeThreshold = this.subTaskInfo.likes || 0;

            for (const noteItem of noteItems) {
                if (this.checkIsDone(targetArticleCount)) {
                    await this.notifyDone();
                    return true;
                }

                const playIcon = await noteItem.locator('.play-icon');
                if (await playIcon.count() > 0) continue;

                const titleElement = await noteItem.locator('a.title span');
                if (await titleElement.count() === 0) continue;

                const title = await titleElement.textContent() || '';

                if (this.viewedArticles.has(title)) continue;

                const hasKeyword = true; // keywords.some(keyword => title.includes(keyword));

                const likeCountElement = await noteItem.locator('.like-wrapper .count');
                const likeCountText = await likeCountElement.textContent();
                const likeCount = likeCountText ? parseInt(likeCountText, 10) : 0;

                if (hasKeyword && likeCount >= likeThreshold) {
                    await this.sendRendererLog({
                        message: '找到新的匹配关键词的文章'
                    });

                    const coverLink = await noteItem.locator('.cover');
                    if (await coverLink.count() > 0) {
                        this.viewedArticles.add(title);

                        await this.sendRendererLog({
                            message: '点击文章查看详情'
                        });

                        await this.page.waitForTimeout(Math.random() * 800 + 200);
                        await coverLink.click();

                        await this.page.waitForTimeout(Math.random() * 1000 + 1000);

                        const viewDuration = Math.floor(
                            Math.random() * (8000 - 2000) + 2000
                        );

                        await this.simulateArticleReading(viewDuration);
                        await this.page.waitForTimeout(Math.random() * 800 + 200);

                        const closeButton = await this.page.locator('.close-box');
                        if (await closeButton.count() > 0) {
                            await this.sendRendererLog({
                                message: '关闭详情页'
                            });
                            await closeButton.click();
                            await this.page.waitForTimeout(500 + Math.random() * 500);
                        }
                    }
                }
            }
        } catch (error) {
            await this.sendRendererLog({
                message: '查看文章失败:',
                error: error.message
            });
        }
        return false;
    }

    private async simulateArticleReading(duration: number) {
        try {
            const startTime = Date.now();
            const articleContent = await this.page.locator('.content');

            if (await articleContent.count() === 0) return;

            const totalReadTime = duration * (0.8 + Math.random() * 0.4);

            while (Date.now() - startTime < totalReadTime) {
                await this.waitForResume();

                const timeElapsed = Date.now() - startTime;
                const timeRatio = Math.min(timeElapsed / totalReadTime, 1);

                let scrollRatio;
                if (timeRatio < 0.3) {
                    scrollRatio = timeRatio * 0.8;
                } else if (timeRatio < 0.8) {
                    scrollRatio = 0.24 + (timeRatio - 0.3) * 1.2;
                } else {
                    scrollRatio = 0.84 + (timeRatio - 0.8) * 0.4;
                }

                const jitter = Math.random() * 20 - 10;
                
                await this.page.evaluate(({ ratio, jitterValue }) => {
                    const content = document.querySelector('.content');
                    if (content) {
                        const targetScrollY = content.scrollHeight * ratio + jitterValue;
                        content.scrollTo({ top: Math.max(0, targetScrollY), behavior: 'auto' });
                    }
                }, { ratio: scrollRatio, jitterValue: jitter });

                if (Math.random() < 0.4) {
                    const pauseDuration = Math.random() * 2000 + 500;
                    await this.page.waitForTimeout(pauseDuration);
                }

                await this.page.waitForTimeout(Math.random() * 50 + 30);
            }

            // 返回顶部
            await this.page.evaluate(() => {
                const content = document.querySelector('.content');
                if (content) {
                    content.scrollTo({ top: 0, behavior: 'auto' });
                }
            });

        } catch (error) {
            await this.sendRendererLog({
                message: '文章详情滚动出错',
                error: error.message
            });
        }
    }

    private checkIsDone(targetArticleCount: number): boolean {
        return this.viewedArticles.size >= targetArticleCount && targetArticleCount > 0 && !this.isFinished;
    }

    private async notifyDone() {
        await this.sendRendererLog({
            message: '已达到目标文章数或者已经滑动到底部-userAndKeyword,line181',
            isTargetFinished: this.isFinished,
            viewedArticles: this.viewedArticles.size,
            targetArticleCount: this.subTaskInfo.limit * 2 || 0,
            isDone: this.checkIsDone(this.subTaskInfo.limit * 2 || 0)
        });
        
        await this.sendTaskStatus({
            success: true,
            error: null
        });
    }

    private async waitForResume() {
        while (this.isPaused) {
            await this.sendRendererLog({
                message: '暂停中，等待恢复...',
                isPaused: this.isPaused
            });
            await this.page.waitForTimeout(500);
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

    // 通信方法
    private async sendRendererLog(data: any) {
        // 这里需要根据实际的日志系统实现
        console.log('Renderer Log:', {
            accountId: this.subTaskInfo.account_id,
            url: this.page.url(),
            ...data
        });
    }

    private async sendTaskStatus(data: { success: boolean; error?: string | null }) {
        // 这里需要根据实际的任务状态系统实现
        console.log('Task Status:', {
            accountId: this.subTaskInfo.account_id,
            index: this.subTaskInfo.index,
            rule_id: this.subTaskInfo.parent_id,
            subTaskInfo: this.subTaskInfo,
            ...data
        });
    }

    private async sendArticleData(data: { success: boolean; response: string }) {
        // 这里需要根据实际的文章数据处理系统实现
        console.log('Article Data:', {
            accountId: this.subTaskInfo.account_id,
            index: this.subTaskInfo.index,
            rule_id: this.subTaskInfo.parent_id,
            subTaskInfo: this.subTaskInfo,
            ...data
        });
    }
}

// 导出主要函数以保持兼容性
export const getUserAndKeywordHandler = (page: Page, subTaskInfo: SubTask) => {
    return new UserAndKeywordHandler(page, subTaskInfo);
};
