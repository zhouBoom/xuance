import { SubTask } from '../../../handler/receive-handler/collect-article';
export const getOnlyKeywordScript = (subTaskInfo: SubTask) => {
    return `
         (async () => {
            try {
                ${searchKeywords(subTaskInfo)}
                ${interceptArticle(subTaskInfo)}
                ${scrollToBottom(subTaskInfo)}
            } catch (error) {
                window.electronAPI.sendRendererLog({
                    accountId: '${subTaskInfo.account_id}',
                    message: '执行任务失败-onlyKeyword,line12',
                    url: location.href,
                    error: error.message
                });
                window.electronAPI.sendCollectArticleTaskStatus({
                    accountId: '${subTaskInfo.account_id}',
                    index: ${subTaskInfo.index},
                    subTaskInfo: ${JSON.stringify(subTaskInfo)},
                    success: false,
                    error: error.message
                });
            }
        })();
    `;
};

const searchKeywords = (subTaskInfo: SubTask) => {
    return `
        // 等待3-5秒再开始操作，模拟真人行为
        await new Promise(r => setTimeout(r, Math.random() * 2000 + 3000)); // 3000-5000ms
        
        // 1. 点击搜索框并输入关键词
        const searchInput = document.querySelector('#search-input');
        if(!searchInput) throw new Error('找不到搜索输入框');
        searchInput.click();
        
        // 模拟人工输入关键词，一个字符一个字符地输入
        const keyword = '${subTaskInfo.keyword}';
        await (async function typeKeyword() {
          for(let i = 0; i < keyword.length; i++) {
            searchInput.value = keyword.substring(0, i + 1);
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            // 每个字符输入间隔时间随机，模拟真人输入
            const delay = Math.floor(Math.random() * 150) + 50; // 50-200ms
            await new Promise(r => setTimeout(r, delay));
          }
        })();
        
        // 输入完成后稍等一下
        await new Promise(r => setTimeout(r, Math.random() * 500 + 500));
        
        // 2. 点击搜索按钮
        const searchBtn = document.querySelector('.search-icon');
        if(!searchBtn) throw new Error('找不到搜索按钮');
        searchBtn.click();

        // 3. 点击图文按钮
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000)); // 等待搜索结果加载, 增加随机性
        const noteBtn = document.querySelector('#image');
        if(!noteBtn) throw new Error('找不到图文按钮');
        noteBtn.click();
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
          url: url
        });
        const originalOnLoad = this.onload;
        this.onload = function() {
          try {
            const responseData = JSON.parse(this.responseText);
            if(JSON.stringify(responseData.data) == '{}') {
                window.electronAPI.sendRendererLog({
                    accountId: '${subTaskInfo.account_id}',
                    message: '处理响应数据失败-onlyKeyword,line66',
                    url: location.href,
                    error: 'responseData.data is empty'
                });
                return;
            }
            // 改用 ipcRenderer 发送消息
            window.electronAPI.sendArticleData({
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
                message: '处理响应数据失败-onlyKeyword,line82',
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
        window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '任务控制-onlyKeyword,line109' + type,
            url: location.href
        });
        if (type === 'pause') {
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '任务暂停',
            url: location.href
          });
          isPaused = true;
        } else if (type === 'resume') {
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

      const scrollConfig = {
        minDelta: 50, // 减小最小滚动距离，更自然
        maxDelta: 300, // 减小最大滚动距离，更自然
        minDelay: 200, // 增加最小延迟，减慢频率
        maxDelay: 800, // 增加最大延迟，减慢频率
        readingPause: {
          probability: 0.6, // 增加停顿概率
          minDuration: 800,
          maxDuration: 3000 // 增加最大停顿时间
        },
        detailView: {
          minDuration: 3000,  // 增加最小停留时间
          maxDuration: 8000   // 增加最大停留时间
        }
      };

      function easeInOutCubic(t) {
        return t < 0.5
          ? 4 * t * t * t
          : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }

      // 用Set存储已查看过的文章标题
      const viewedArticles = new Set();
      const targetArticleCount = ${subTaskInfo.limit * 2 || 200}; // 设置目标文章数，默认为10

      const checkIsDone = () => {
        return viewedArticles.size >= targetArticleCount && targetArticleCount > 0 && !isFinished;
      }
      const notifyDone = () => {
            console.log('已达到目标文章数或者已经到达底部:', targetArticleCount);
            window.electronAPI.sendRendererLog({
                accountId: '${subTaskInfo.account_id}',
                viewedArticles: viewedArticles.size,
                targetArticleCount: targetArticleCount,
                isDone: checkIsDone(),
                isTargetFinished: isFinished,
                message: '已达到目标文章数或者已经到达底部-onlyKeyword,line161',
                url: location.href
            });
            window.electronAPI.sendCollectArticleTaskStatus({
              accountId: '${subTaskInfo.account_id}',
              index: ${subTaskInfo.index},
              rule_id: '${subTaskInfo.parent_id}',
              subTaskInfo: ${JSON.stringify(subTaskInfo)},
              success: true,
              error: null
            });
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
            const playIcon = noteItem.querySelector('.play-icon');
            if (playIcon) continue;
            
            const titleElement = noteItem.querySelector('a.title span');
            if (!titleElement) continue;
            
            const title = titleElement.textContent || '';
            
            // 检查是否已经查看过这篇文章
            if (viewedArticles.has(title)) continue;

            const likeCountElement = noteItem.querySelector('.like-wrapper .count');
            const likeCount = likeCountElement ? parseInt(likeCountElement.textContent || '0', 10) : 0;
            
            const hasKeyword = true; // keywords.some(keyword => title.includes(keyword));
            
            if (hasKeyword && likeCount >= likeThreshold) {
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
                
                // 随机停顿一下再点击，模拟人在考虑是否点击
                await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
                coverLink.click();
                
                // 等待详情页加载
                await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));
                
                // 在文章详情页模拟真人滚动
                await (async function scrollArticleDetail() {
                  const detailContent = document.querySelector('.note-content');
                  if (!detailContent) return;
                  
                  const contentHeight = detailContent.scrollHeight;
                  const viewportHeight = detailContent.clientHeight;
                  let currentPosition = 0;
                  
                  // 计算需要滚动几次才能看完整篇文章
                  const scrollTimes = Math.min(
                    Math.floor(contentHeight / viewportHeight * 0.8), // 只看文章的80%
                    Math.floor(Math.random() * 5) + 3 // 最多滚动8次，最少3次
                  );
                  
                  for (let i = 0; i < scrollTimes; i++) {
                    // 每次滚动距离稍有不同，模拟真人
                    const scrollDistance = Math.floor(viewportHeight * (0.6 + Math.random() * 0.4));
                    currentPosition += scrollDistance;
                    
                    // 平滑滚动
                    const startPos = detailContent.scrollTop;
                    const targetPos = Math.min(currentPosition, contentHeight - viewportHeight);
                    const steps = 15 + Math.floor(Math.random() * 10);
                    
                    for (let j = 0; j < steps; j++) {
                      const progress = j / (steps - 1);
                      const easedProgress = easeInOutCubic(progress);
                      const scrollPos = startPos + (targetPos - startPos) * easedProgress;
                      detailContent.scrollTop = scrollPos;
                      // 滚动过程中每步稍微停顿
                      await new Promise(r => setTimeout(r, 10 + Math.random() * 20));
                    }
                    
                    // 每次滚动后停顿一段时间，模拟阅读
                    const readTime = Math.floor(Math.random() * 2000) + 1000;
                    await new Promise(r => setTimeout(r, readTime));
                  }
                })();
                
                // 随机停留时间
                const viewDuration = Math.floor(
                  Math.random() * 
                  (scrollConfig.detailView.maxDuration - scrollConfig.detailView.minDuration) + 
                  scrollConfig.detailView.minDuration
                );
                await new Promise(r => setTimeout(r, viewDuration));
                
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
                  // 关闭后等待一小段随机时间再继续
                  await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
                }
              }
            }
          }
        } catch (error) {
          console.error('查看文章失败:', error);
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '查看文章失败',
            url: location.href,
            error: error.message
          });
        }
        return false; // 返回false表示任务未完成
      }

      return new Promise((resolve, reject) => {
        console.log('开始模拟滚动');
        window.electronAPI.sendRendererLog({
          accountId: '${subTaskInfo.account_id}',
          message: '开始模拟滚动',
          url: location.href
        });
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

            // 计算滚动距离，增加随机性
            const deltaY = Math.floor(Math.random() * (scrollConfig.maxDelta - scrollConfig.minDelta) + scrollConfig.minDelta);
            const startY = window.scrollY;
            const targetY = startY + deltaY;

            // 平滑滚动，步数更多更细致
            const steps = Math.floor(Math.random() * 50) + 100; // 100-150步，更平滑
            for(let i = 0; i < steps; i++) {
              const progress = i / (steps - 1);
              const easedProgress = easeInOutCubic(progress);
              const currentY = startY + (targetY - startY) * easedProgress;
              window.scrollTo(0, currentY);
              // 滚动步骤间隔更短，但有随机性
              await new Promise(r => setTimeout(r, 8 + Math.random() * 12));
            }

            // 随机停顿前检查暂停状态
            await waitForResume();
            if(Math.random() < scrollConfig.readingPause.probability) {
              const pauseDuration = Math.floor(
                Math.random() * 
                (scrollConfig.readingPause.maxDuration - scrollConfig.readingPause.minDuration) + 
                scrollConfig.readingPause.minDuration
              );
              await new Promise(r => setTimeout(r, pauseDuration));
            }

            // 更自然的滚动间隔
            const delay = Math.floor(Math.random() * (scrollConfig.maxDelay - scrollConfig.minDelay) + scrollConfig.minDelay);
            setTimeout(scroll, delay);
          } catch(error) {
            window.electronAPI.sendRendererLog({
              accountId: '${subTaskInfo.account_id}',
              message: 'scrollToBottom error, line: 271' + error,
              url: location.href,
              error: error.message
            });
            // 发送错误消息
            window.electronAPI.sendCollectArticleTaskStatus({
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