import { SubTask } from '../../../handler/receive-handler/collect-article';

export const getUserAndKeywordScript = (subTaskInfo: SubTask) => {
    return `
         (async () => {
            try {
                if(location.href.includes('https://www.xiaohongshu.com/explore')) {
                    ${serchAndJump(subTaskInfo)}
                } else if(location.href.includes('https://www.xiaohongshu.com/user/profile/')) {
                    ${interceptArticle(subTaskInfo)}
                    ${scrollToBottom(subTaskInfo)}
                }
            } catch (error) {
                window.electronAPI.sendRendererLog({
                    accountId: '${subTaskInfo.account_id}',
                    message: '执行任务失败-userAndKeyword,line17',
                    url: location.href,
                    error: error.message
                });
                window.electronAPI.sendCollectArticleInteractionTaskStatus({
                    accountId: '${subTaskInfo.account_id}',
                    index: ${subTaskInfo.index},
                    subTaskInfo: ${JSON.stringify(subTaskInfo)},
                    success: false,
                    error: error.message + ' line: 26' + error
                });
            }
        })();
    `;
};

const serchAndJump = (subTaskInfo: SubTask) => {
    return `
        // 等待3-5秒再开始操作，模拟真人行为
        await new Promise(r => setTimeout(r, Math.random() * 2000 + 3000)); // 3000-5000ms

        // 1. 点击搜索框并模拟逐字输入
        const searchInput = document.querySelector('#search-input');
        if(!searchInput) throw new Error('找不到搜索输入框');
        searchInput.click();
        
        // 模拟人工输入，每个字符之间有随机延迟
        const authorId = '${subTaskInfo.authorId}';
        
        async function simulateTyping(text) {
            for (let i = 0; i < text.length; i++) {
                const currentChar = text.charAt(i);
                searchInput.value = text.substring(0, i + 1);
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                // 随机延迟模拟人工输入速度差异 (30-150ms)
                const typingDelay = Math.floor(Math.random() * 120) + 30;
                await new Promise(r => setTimeout(r, typingDelay));
            }
        }
        
        await simulateTyping(authorId);
        
        // 2. 点击搜索按钮前稍作停顿，模拟人类思考
        const thinkingDelay = Math.floor(Math.random() * 800) + 500;
        await new Promise(r => setTimeout(r, thinkingDelay));
        const searchBtn = document.querySelector('.search-icon');
        if(!searchBtn) throw new Error('找不到搜索按钮');
        searchBtn.click();

        // 3.如果搜索到了目标元素直接点击
        const resultWaitTime = Math.floor(Math.random() * 1000) + 1500;
        await new Promise(r => setTimeout(r, resultWaitTime)); 
        const firstTargetUser = Array.from(document.querySelectorAll('.user-desc')).find(
            el => el.textContent?.includes('${subTaskInfo.authorId}')
        );
        if(firstTargetUser){
          firstTargetUser.closest('a')?.click();
          return
        } 

        // 4. 点击用户按钮
        const tabWaitTime = Math.floor(Math.random() * 500) + 1000;
        await new Promise(r => setTimeout(r, tabWaitTime));
        // const userTab = document.querySelector('#user');
        const userTab = document.querySelector('div.channel#user');

        if(!userTab) {
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '没找到用户标签',
            url: location.href,
            error: ''
          });
          window.electronAPI.sendCollectArticleInteractionTaskStatus({
              accountId: '${subTaskInfo.account_id}',
              index: ${subTaskInfo.index},
              rule_id: '${subTaskInfo.parent_id}',
              success: false,
              error: '没找到用户标签+line75'
          });
          return;
        }

        userTab.click();
        
        // 5. 查找并点击目标用户
        const userListWaitTime = Math.floor(Math.random() * 800) + 1200;
        await new Promise(r => setTimeout(r, userListWaitTime));
        const targetUser = Array.from(document.querySelectorAll('.user-desc')).find(
            el => el.textContent?.includes('${subTaskInfo.authorId}')
        );
        if(!targetUser) {
             window.electronAPI.sendRendererLog({
                accountId: '${subTaskInfo.account_id}',
                message: '没找到目标用户',
                url: location.href,
                error: ''
            });
            window.electronAPI.sendCollectArticleInteractionTaskStatus({
                accountId: '${subTaskInfo.account_id}',
                index: ${subTaskInfo.index},
                rule_id: '${subTaskInfo.parent_id}',
                subTaskInfo: ${JSON.stringify(subTaskInfo)},
                success: false,
                error: '找不到目标用户+line60'
            });
            return;
        }
        targetUser.closest('a')?.click();
    `;
}

export const interceptArticle = (subTaskInfo: SubTask) => {
    return `
    (function() {
    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(...args) {
     const url = args[1];
      if (url && url.includes('/api/sns/web/v1/feed')) {
        window.electronAPI.sendRendererLog({
          accountId: '${subTaskInfo.account_id}',
          message: '拦截到文章数据',
          url: location.href
        });
        const originalOnLoad = this.onload;
        this.onload = function() {
          try {
            const responseData = JSON.parse(this.responseText);
            if(JSON.stringify(responseData.data) == '{}') {
                window.electronAPI.sendRendererLog({
                    accountId: '${subTaskInfo.account_id}',
                    message: '处理响应数据失败,line81',
                    url: location.href,
                    error: 'responseData.data is empty'
                });
                return;
            }
            // 改用 ipcRenderer 发送消息
            window.electronAPI.sendArticleInteractionData({
                accountId: '${subTaskInfo.account_id}',
                index: ${subTaskInfo.index},
                rule_id: '${subTaskInfo.parent_id}',
                subTaskInfo: ${JSON.stringify(subTaskInfo)},
                success: true,
                response: this.responseText
            });
          } catch (error) {
            window.electronAPI.sendRendererLog({
              accountId: '${subTaskInfo.account_id}',
              message: '处理响应数据失败,line96' + error,
              url: location.href,
              error: error.message
            });
          }
          if (originalOnLoad) {
            originalOnLoad.apply(this, arguments);
          }
        };
      }
      return originalXHR.apply(this, args);
    };
    return true; // 返回一个可序列化的值
  })();
    `;
}

export const scrollToBottom = (subTaskInfo: SubTask) => {
    return `
    (function() {
      let isPaused = false;
      let isFinished = false;
      
      // 添加暂停/恢复监听器
      window.electronAPI.onTaskControl(({ type }) => {
        if (type === 'pause') {
          console.warn('任务暂停');
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '任务暂停',
            url: location.href
          });
          isPaused = true;
        } else if (type === 'resume') {
          console.log('任务恢复')
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '任务恢复',
            url: location.href
          });
          isPaused = false;
        } else if (type === 'stop') {
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '任务达成目标，停止执行',
            url: location.href
          });
          isFinished = true;
          isPaused = false;
        }
      });

      // 添加等待恢复的函数
      async function waitForResume() {
        while (isPaused) {
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '暂停中，等待恢复...',
            url: location.href,
            isPaused
          });
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // 改进滚动配置，使其更加自然
      const scrollConfig = {
        minDelta: 60,    // 减小最小滚动距离
        maxDelta: 450,   // 减小最大滚动距离
        minDelay: 100,   // 增加最小延迟
        maxDelay: 800,   // 增加最大延迟, 更符合人类行为
        readingPause: {
          probability: 0.65, // 增加阅读停顿概率
          minDuration: 800,  // 增加最小停顿时间
          maxDuration: 3000  // 增加最大停顿时间
        },
        // 滚动速度变化
        scrollSpeed: {
          acceleration: {
            min: 0.85,
            max: 1.15
          },
          deceleration: {
            min: 0.85,
            max: 0.95
          },
          changeProb: 0.3 // 速度改变的概率
        },
        detailView: {
          minDuration: 2000,  // 延长最小浏览时间
          maxDuration: 8000   // 延长最大浏览时间
        }
      };

      // 多种缓动函数
      const easingFunctions = {
        // 标准平滑过渡
        easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
        // 缓慢开始，快速结束
        easeInQuad: t => t * t,
        // 快速开始，缓慢结束
        easeOutQuad: t => t * (2 - t),
        // 更自然的滚动曲线
        easeOutQuint: t => 1 - Math.pow(1 - t, 5)
      };
      
      // 随机选择缓动函数
      function getRandomEasing() {
        const keys = Object.keys(easingFunctions);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        return easingFunctions[randomKey];
      }

      // 用Set存储已查看过的文章标题
      const viewedArticles = new Set();
      const targetArticleCount = ${subTaskInfo.limit * 2 || 0}; // 设置目标文章数，默认为10

      const checkIsDone = () => {
        return viewedArticles.size >= targetArticleCount && targetArticleCount > 0 && !isFinished;
      }
      const notifyDone = () => {
            console.log('已达到目标文章数或者已经滑动到底部:', targetArticleCount);
            window.electronAPI.sendRendererLog({
                accountId: '${subTaskInfo.account_id}',
                message: '已达到目标文章数或者已经滑动到底部-userAndKeyword,line181',
                url: location.href,
                isTargetFinished: isFinished,
                viewedArticles: viewedArticles.size,
                targetArticleCount: targetArticleCount,
                isDone: checkIsDone()
            });
            window.electronAPI.sendCollectArticleInteractionTaskStatus({
              accountId: '${subTaskInfo.account_id}',
              index: ${subTaskInfo.index},
              rule_id: '${subTaskInfo.parent_id}',
              subTaskInfo: ${JSON.stringify(subTaskInfo)},
              success: true,
              error: null
            });
      }

      // 模拟人类在文章详情内的滚动行为
      async function simulateArticleReading(duration) {
        try {
          const startTime = Date.now();
          const articleContent = document.querySelector('.content');
          
          if (!articleContent) return;
          
          const contentHeight = articleContent.scrollHeight;
          const viewportHeight = window.innerHeight;
          
          // 初始滚动位置
          let currentScrollY = 0;
          
          // 获取一个随机的总阅读时间(基于传入的duration进行浮动)
          const totalReadTime = duration * (0.8 + Math.random() * 0.4);
          
          while (Date.now() - startTime < totalReadTime) {
            await waitForResume();
            
            // 计算剩余阅读时间的百分比
            const timeElapsed = Date.now() - startTime;
            const timeRatio = Math.min(timeElapsed / totalReadTime, 1);
            
            // 目标位置 - 根据阅读时间确定滚动位置，模拟人类先快后慢的阅读模式
            let targetScrollY;
            
            if (timeRatio < 0.3) {
              // 开始阶段缓慢滚动
              targetScrollY = contentHeight * (timeRatio * 0.8);
            } else if (timeRatio < 0.8) {
              // 中间阶段较快滚动
              targetScrollY = contentHeight * (0.24 + (timeRatio - 0.3) * 1.2);
            } else {
              // 结尾阶段慢速滚动
              targetScrollY = contentHeight * (0.84 + (timeRatio - 0.8) * 0.4);
            }
            
            // 添加随机抖动以模拟真实滚动行为
            const jitter = Math.random() * 20 - 10;
            targetScrollY += jitter;
            
            // 确保不超过内容高度
            targetScrollY = Math.min(targetScrollY, contentHeight - viewportHeight);
            
            // 选择滚动步长 - 有时快，有时慢
            const steps = Math.floor(Math.random() * 15) + 5;
            
            // 随机选择缓动函数
            const easingFn = getRandomEasing();
            
            // 进行滚动
            const startY = currentScrollY;
            const deltaY = targetScrollY - startY;
            
            for (let i = 0; i <= steps; i++) {
              const progress = i / steps;
              const easedProgress = easingFn(progress);
              currentScrollY = startY + deltaY * easedProgress;
              
              articleContent.scrollTo({
                top: currentScrollY,
                behavior: 'auto' // 使用'auto'而不是'smooth'以便我们自己控制平滑度
              });
              
              // 随机等待时间
              const stepDelay = Math.random() * 50 + 30;
              await new Promise(r => setTimeout(r, stepDelay));
            }
            
            // 随机暂停模拟阅读
            if (Math.random() < 0.4) {
              const pauseDuration = Math.random() * 2000 + 500;
              await new Promise(r => setTimeout(r, pauseDuration));
            }
          }
          
          // 返回顶部，模拟看完文章后的行为
          for (let i = 10; i >= 0; i--) {
            const progress = i / 10;
            articleContent.scrollTo({
              top: currentScrollY * progress,
              behavior: 'auto'
            });
            await new Promise(r => setTimeout(r, 50));
          }
          
        } catch (error) {
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '文章详情滚动出错',
            url: location.href,
            error: error.message
          });
        }
      }

      async function checkAndClickArticle() {
        try {
          await waitForResume();
          
          // 如果已达到目标文章数，发送完成通知并返回
          if(checkIsDone()) {
            notifyDone();
            return true;
          }
          if (viewedArticles.size >= targetArticleCount && targetArticleCount > 0) {
            return true; // 返回true表示任务完成
          }

          const noteItems = Array.from(document.querySelectorAll('.note-item'));
          const keywords = ${JSON.stringify(subTaskInfo.keywords)};
          const likeThreshold = ${subTaskInfo.likes || 0}; // 设置点赞阈值

          for (const noteItem of noteItems) {
            if(checkIsDone()) {
              notifyDone();
              return true;
            }
            // const playIcon = noteItem.querySelector('.play-icon');
            // if (playIcon) continue;
            
            const titleElement = noteItem.querySelector('a.title span');
            if (!titleElement) continue;

            const title = titleElement.textContent || '';
            
            // 检查是否已经查看过这篇文章
            if (viewedArticles.has(title)) continue;
            
            const hasKeyword = keywords.some(keyword => {
              return title == keyword;
            });
            
            if (hasKeyword) {
              console.log('找到新的匹配关键词的文章:', title);
              window.electronAPI.sendRendererLog({
                accountId: '${subTaskInfo.account_id}',
                message: '找到新的匹配关键词的文章',
                url: location.href
              });
              const coverLink = noteItem.querySelector('.cover');
              if (coverLink) {
                // 添加到已查看集合中
                viewedArticles.add(title);
                
                console.log('点击文章查看详情');
                window.electronAPI.sendRendererLog({
                  accountId: '${subTaskInfo.account_id}',
                  message: '点击文章查看详情',
                  url: location.href
                });
                
                // 模拟点击文章前的短暂停顿
                await new Promise(r => setTimeout(r, Math.random() * 800 + 200));
                coverLink.click();
                
                // 等待详情页加载
                await new Promise(r => setTimeout(r, Math.random() * 1000 + 1000));
                
                // 随机停留时间
                const viewDuration = Math.floor(
                  Math.random() * 
                  (scrollConfig.detailView.maxDuration - scrollConfig.detailView.minDuration) + 
                  scrollConfig.detailView.minDuration
                );
                
                // 执行文章内容的滚动阅读
                await simulateArticleReading(viewDuration);
                
                // 关闭详情页前的短暂停顿
                await new Promise(r => setTimeout(r, Math.random() * 800 + 200));
                
                // 关闭详情页
                const closeButton = document.querySelector('.close-box');
                if (closeButton) {
                  console.log('关闭详情页');
                  window.electronAPI.sendRendererLog({
                    accountId: '${subTaskInfo.account_id}',
                    message: '关闭详情页',
                    url: location.href
                  });
                  closeButton.click();
                  await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
                }
              }
            }
          }
        } catch (error) {
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '查看文章失败:',
            url: location.href,
            error: error.message
          });
        }
        return false; // 返回false表示任务未完成
      }

      return new Promise((resolve, reject) => {
        window.electronAPI.sendRendererLog({
          accountId: '${subTaskInfo.account_id}',
          message: '开始模拟滚动',
          url: location.href
        });
        
        // 当前滚动速度因子
        let currentSpeedFactor = 1.0;
        
        async function scroll() {
          try {
            await waitForResume();

            // 记录滚动前的位置
            const beforeScrollPosition = window.scrollY;
            
            // 尝试滚动一小段距离
            window.scrollBy(0, 2);
            
            // 等待一小段时间确保滚动已完成
            await new Promise(r => setTimeout(r, 50));
            
            // 检查滚动后的位置
            const afterScrollPosition = window.scrollY;
            
            // 如果位置没有变化，说明已经到达底部
            const isBottom = beforeScrollPosition === afterScrollPosition;

            const isTaskComplete = await checkAndClickArticle();
            window.electronAPI.sendRendererLog({
                accountId: '${subTaskInfo.account_id}',
                message: '执行滚动动作完成',
                url: location.href,
                isBottom: isBottom,
                beforeScrollPosition,
                afterScrollPosition,
                viewedArticles: viewedArticles.size,
                targetArticleCount: targetArticleCount,
                noteItems: Array.from(document.querySelectorAll('.note-item') || []).length,
                userPostedFeedsHeight: document.getElementById('userPostedFeeds') && document.getElementById('userPostedFeeds').style.height || 0
              });
            if (isTaskComplete || isBottom) {
              window.electronAPI.sendRendererLog({
                accountId: '${subTaskInfo.account_id}',
                message: isTaskComplete ? '已完成目标文章数' : '到达底部',
                url: location.href,
                isBottom: isBottom,
                beforeScrollPosition,
                afterScrollPosition,
                viewedArticles: viewedArticles.size,
                targetArticleCount: targetArticleCount,
                noteItems: Array.from(document.querySelectorAll('.note-item') || []).length,
                userPostedFeedsHeight: document.getElementById('userPostedFeeds') && document.getElementById('userPostedFeeds').style.height || 0
              });
              notifyDone();
              return resolve();
            }
            
            // 随机改变滚动速度
            if (Math.random() < scrollConfig.scrollSpeed.changeProb) {
              if (Math.random() > 0.5) {
                // 加速
                currentSpeedFactor *= (scrollConfig.scrollSpeed.acceleration.min + 
                  Math.random() * (scrollConfig.scrollSpeed.acceleration.max - scrollConfig.scrollSpeed.acceleration.min));
              } else {
                // 减速
                currentSpeedFactor *= (scrollConfig.scrollSpeed.deceleration.min + 
                  Math.random() * (scrollConfig.scrollSpeed.deceleration.max - scrollConfig.scrollSpeed.deceleration.min));
              }
              
              // 限制速度在合理范围内
              currentSpeedFactor = Math.max(0.6, Math.min(currentSpeedFactor, 1.8));
            }

            // 计算滚动距离并应用当前速度因子
            const baseDistance = Math.floor(Math.random() * (scrollConfig.maxDelta - scrollConfig.minDelta) + scrollConfig.minDelta);
            const deltaY = Math.floor(baseDistance * currentSpeedFactor);
            
            const startY = window.scrollY;
            const targetY = startY + deltaY;

            // 平滑滚动 - 使用随机缓动函数
            const easingFunction = getRandomEasing();
            // 随机步数，有时快有时慢
            const steps = Math.floor(Math.random() * 80) + 60;
            
            // 增加步数间隔时间的变化
            const baseStepTime = Math.random() * 2 + 0.8;
            
            for(let i = 0; i < steps; i++) {
              const progress = i / (steps - 1);
              const easedProgress = easingFunction(progress);
              const currentY = startY + (targetY - startY) * easedProgress;
              window.scrollTo(0, currentY);
              
              // 步骤之间的时间也有变化，模拟人类滚动
              const stepTime = baseStepTime * (0.8 + Math.random() * 0.4);
              await new Promise(r => setTimeout(r, stepTime));
            }

            // 随机停顿前检查暂停状态
            await waitForResume();
            if(Math.random() < scrollConfig.readingPause.probability) {
              // 模拟阅读时的短暂停留
              const pauseDuration = Math.floor(
                Math.random() * 
                (scrollConfig.readingPause.maxDuration - scrollConfig.readingPause.minDuration) + 
                scrollConfig.readingPause.minDuration
              );
              await new Promise(r => setTimeout(r, pauseDuration));
            }

            // 下一次滚动前的随机延迟
            const delay = Math.floor(Math.random() * (scrollConfig.maxDelay - scrollConfig.minDelay) + scrollConfig.minDelay);
            setTimeout(scroll, delay);
          } catch(error) {
            window.electronAPI.sendRendererLog({
              accountId: '${subTaskInfo.account_id}',
              message: 'scrollToBottom error,line294' + error,
              url: location.href,
              error: error.message
            });
            // 发送错误消息
            window.electronAPI.sendCollectArticleInteractionTaskStatus({
              accountId: '${subTaskInfo.account_id}',
              index: ${subTaskInfo.index},
              rule_id: '${subTaskInfo.parent_id}',
              subTaskInfo: ${JSON.stringify(subTaskInfo)},
              success: false,
              error: error.message
            });
            reject(error);
          }
        }

        scroll();
      });
    })()
    `;
}