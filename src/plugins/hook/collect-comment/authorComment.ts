//  采集用户评论
import { SubTask } from '../../../handler/receive-handler/collect-comment';

export const getAuthorCommentScript = (subTaskInfo: SubTask) => {
  return `
    (async () => {
      try {
        if(location.href.includes('https://www.xiaohongshu.com/explore')) {
          ${serchAndJump(subTaskInfo)}
        } else if(location.href.includes('https://www.xiaohongshu.com/user/profile/')) {
          ${interceptComment(subTaskInfo)}
          ${scrollToBottom(subTaskInfo)}
          console.log('进入用户主页');
        }
      } catch (error) {
        window.electronAPI.sendRendererLog({
          accountId: '${subTaskInfo.account_id}',
          message: '执行任务失败-authorComment',
          url: location.href,
          error: error.message
        });
        window.electronAPI.sendCollectCommentTaskStatus({
          accountId: '${subTaskInfo.account_id}',
          index: ${subTaskInfo.index},
          subTaskInfo: ${JSON.stringify(subTaskInfo)},
          success: false,
          error: error.message + ' line 27: ' + error
        });
      }
    })();
  `;
};
// 拦截评论数据/api/sns/web/v2/comment/page
export const interceptComment = (subTaskInfo: SubTask) => {
  return `
    (function() {
      const originalXHR = window.XMLHttpRequest.prototype.open;
      // 获取文章相关的信息
      const getArticleInfo = () => {
        const articleBox = document.querySelector('.note-detail-mask');
        let note = {};
        if (articleBox) {
          const noteId = articleBox?.getAttribute('note-id');
          const title = articleBox?.querySelector('.interaction-container .note-content .title')?.textContent;
          const cover = articleBox?.querySelector('.swiper-wrapper .swiper-slide-active .img-container .note-slider-img')?.getAttribute('src');
          note = {
            id: noteId,
            cover,
            title,
          }
          return note;
        }
        return note;
      }
      // 获取作者信息class：author-wrapper，头像class：avatar-item的url，昵称class：username，id是author-wrapper元素下的a标签href
      const getAuthorInfo = () => {
        const authorWrapper = document.querySelector('.author .author-wrapper');
        let authorInfo = {};
        if(authorWrapper) {
          const avatar = authorWrapper.querySelector('.avatar-item')?.getAttribute('src');
          const nickname = authorWrapper.querySelector('.username')?.textContent;
          const hrefUrl = authorWrapper.querySelector('a')?.getAttribute('href');
          const id = hrefUrl && hrefUrl.split("/profile/")[1]?.split("?")[0] || null;
          authorInfo = {
            avatar,
            nickname,
            id
          }
          return authorInfo;
        }
        return authorInfo;
      }
      window.XMLHttpRequest.prototype.open = function(...args) {
        const url = args[1];
        if (url && url.includes('/api/sns/web/v2/comment/page')) {
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '拦截到评论数据',
            url: location.href
          });
          const originalOnLoad = this.onload;
          this.onload = function() {
            try {
              const responseData = JSON.parse(this.responseText);
              if(JSON.stringify(responseData.data) == '{}') {
                window.electronAPI.sendRendererLog({
                    accountId: '${subTaskInfo.account_id}',
                    message: '处理响应数据失败,line88',
                    url: location.href,
                    error: 'responseData.data is empty'
                });
                return;
              }
              const noteData = getArticleInfo();
              const author = getAuthorInfo();
              window.electronAPI.sendCommentData({
                accountId: '${subTaskInfo.account_id}',
                index: ${subTaskInfo.index},
                rule_id: '${subTaskInfo.parent_id}',
                trace_id: '${subTaskInfo.trace_id}',
                penetrate: '${subTaskInfo.penetrate}',
                subTaskInfo: ${JSON.stringify(subTaskInfo)},
                success: true,
                response: this.responseText,
                note: noteData,
                author
              });
            } catch (error) {
              window.electronAPI.sendRendererLog({
                accountId: '${subTaskInfo.account_id}',
                message: '处理响应数据失败,line111',
                url: location.href,
                error: error.message
              });
            }
            if (originalOnLoad) {
              originalOnLoad.apply(this, arguments);
            }
          }
        }
        return originalXHR.apply(this, args);
      };
      return true; // 返回一个可序列化的值
    })();
  `;
}

const serchAndJump = (subTaskInfo: SubTask) => {
  return `
    // 等待3-5秒再开始操作，模拟真人行为
    await new Promise(r => setTimeout(r, Math.random() * 2000 + 3000)); // 3000-5000ms

    // 1. 点击搜索框并输入
    const searchInput = document.querySelector('#search-input');
    if(!searchInput) throw new Error('找不到搜索输入框');
    searchInput.click();
    searchInput.value = '${subTaskInfo.authorId}';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      
    // 2. 点击搜索按钮
    await new Promise(r => setTimeout(r, 2000)); // 等待输入完成
    const searchBtn = document.querySelector('.search-icon');
    if(!searchBtn) throw new Error('找不到搜索按钮');
    searchBtn.click();

    // 3.如果搜索到了目标元素直接点击
    await new Promise(r => setTimeout(r, 2000)); 
    const firstTargetUser = Array.from(document.querySelectorAll('.user-desc')).find(
      el => el.textContent?.includes('${subTaskInfo.authorId}')
    );
    if(firstTargetUser){ 
      firstTargetUser.closest('a')?.click();
      return
    }

    // 4. 点击用户按钮
    await new Promise(r => setTimeout(r, 2000));
    const userTab = document.querySelector('.content-container').querySelector('#user');
    if(!userTab) {
      window.electronAPI.sendRendererLog({
        accountId: '${subTaskInfo.account_id}',
        message: '没找到用户标签',
        url: location.href,
        error: ''
      });
      window.electronAPI.sendCollectCommentTaskStatus({
        accountId: '${subTaskInfo.account_id}',
        index: ${subTaskInfo.index},
        rule_id: '${subTaskInfo.parent_id}',
        success: false,
        error: '没找到用户标签+line168'
      });
      return;
    }
    userTab.click();

    // 5. 查找并点击目标用户
    await new Promise(r => setTimeout(r, 2000)); // 等待用户列表加载
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
      window.electronAPI.sendCollectCommentTaskStatus({
        accountId: '${subTaskInfo.account_id}',
        index: ${subTaskInfo.index},
        rule_id: '${subTaskInfo.parent_id}',
        subTaskInfo: ${JSON.stringify(subTaskInfo)},
        success: false,
        error: '找不到目标用户+line192'
      });
      return;
    }
    targetUser.closest('a')?.click();
  `;
}

export const scrollToBottom = (subTaskInfo: SubTask) => {
  return `
  (function() {
    let isPaused = false;
    
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
    // 滚动配置
    const scrollConfig = {
      minDelta: 100,
      maxDelta: 800,
      minDelay: 50,
      maxDelay: 200,
      readingPause: {
        probability: 0.4,
        minDuration: 600,
        maxDuration: 2000
      },
      detailView: {
        minDuration: 1000,  // 1秒
        maxDuration: 3000   // 3秒
      }
    };
    // 平滑滚动
    function easeInOutCubic(t) {
      return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // 用Set存储已查看过的文章标题
    const viewedArticles = new Set();
    const targetArticleCount = 0; // 设置目标文章数，默认为10
    // 检查是否达到目标文章数
    const checkIsDone = () => {
      return viewedArticles.size >= targetArticleCount && targetArticleCount > 0;
    }

    // 通知任务完成
    const notifyDone = () => {
      console.log('已达到目标文章数或者已经滑动到底部:', viewedArticles);
      window.electronAPI.sendRendererLog({
        accountId: '${subTaskInfo.account_id}',
        message: '已达到目标文章数或者已经滑动到底部-userAndKeyword,line274',
        url: location.href,
        viewedArticles: viewedArticles.size,
        targetArticleCount: targetArticleCount,
        isDone: checkIsDone()
      });
      window.electronAPI.sendCollectCommentTaskStatus({
        accountId: '${subTaskInfo.account_id}',
        index: ${subTaskInfo.index},
        rule_id: '${subTaskInfo.parent_id}',
        subTaskInfo: ${JSON.stringify(subTaskInfo)},
        success: true,
        error: null
      });
    }

    // 滚动评论到底部
    async function scrollCommentToBottom() {
      return new Promise(async (resolve, reject) => {
        const noteScroller = document.querySelector('.note-container');
        if(!noteScroller) {
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: '没找到noteScroller',
            url: location.href
          });
          await new Promise(r => setTimeout(r, 5000));
          return resolve();
        }
        async function scroll() {
          try {
            await waitForResume();
            const endContainer = document.querySelector('.end-container')
            const noCommentsText = document.querySelector('.no-comments-text')
            if (endContainer || noCommentsText) {
              const text = endContainer?.textContent || noCommentsText?.textContent;
              if (text.includes('THE END') || text.includes('这是一片荒地')) {
                window.electronAPI.sendRendererLog({
                  accountId: '${subTaskInfo.account_id}',
                  message: '评论到达底部',
                  url: location.href,
                  beforeScrollPosition: noteScroller.scrollY,
                  afterScrollPosition: noteScroller.scrollY,
                  viewedArticles: viewedArticles.size,
                  targetArticleCount: targetArticleCount,
                  noteItems: Array.from(document.querySelectorAll('.note-item') || []).length,
                  userPostedFeedsHeight: document.getElementById('userPostedFeeds') && document.getElementById('userPostedFeeds').style.height || 0
                });
                // 随机停留1-3秒
                const viewDuration = Math.floor(
                  Math.random() * 
                  (scrollConfig.detailView.maxDuration - scrollConfig.detailView.minDuration) + 
                  scrollConfig.detailView.minDuration
                );
                await new Promise(r => setTimeout(r, viewDuration));
                return resolve();
              }
            }

            // 计算滚动距离
            const deltaY = Math.floor(Math.random() * (scrollConfig.maxDelta - scrollConfig.minDelta) + scrollConfig.minDelta);
            const startY = noteScroller.scrollTop;
            const targetY = startY + deltaY;

            // 平滑滚动
            const steps = 120;
            for(let i = 0; i < steps; i++) {
              const progress = i / (steps - 1);
              const easedProgress = easeInOutCubic(progress);
              const currentY = startY + (targetY - startY) * easedProgress;
              noteScroller.scrollTop = currentY;
              await new Promise(r => setTimeout(r, 20));
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

            const delay = Math.floor(Math.random() * (scrollConfig.maxDelay - scrollConfig.minDelay) + scrollConfig.minDelay);
            setTimeout(scroll, delay);
          } catch(error) {
            window.electronAPI.sendRendererLog({
              accountId: '${subTaskInfo.account_id}',
              message: 'scrollToBottom error,line363' + error,
              url: location.href,
              error: error.message
            });
            // 发送错误消息
            window.electronAPI.sendCollectCommentTaskStatus({
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
        for (const noteItem of noteItems) {
          if(checkIsDone()) {
            notifyDone();
            return true;
          }
          // 视频的文章不抓取
          const playIcon = noteItem.querySelector('.play-icon');
          if (playIcon) continue;
          // 获取文章id
          const href = noteItem.querySelector('div:first-child a:first-child').href;
          const articleId = href.split('explore/')[1];
          if (!articleId) continue;
          
          // 检查是否已经查看过这篇文章
          if (viewedArticles.has(articleId)) continue;
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            articleId: articleId,
            message: '找到新的匹配关键词的文章',
            url: location.href
          });
          const coverLink = noteItem.querySelector('.cover');
          if (coverLink) {
            // 添加到已查看集合中
            viewedArticles.add(articleId);
            console.log('点击文章查看详情');
            window.electronAPI.sendRendererLog({
              accountId: '${subTaskInfo.account_id}',
              message: '点击文章查看详情',
              url: location.href
            });
            coverLink.click();
            await new Promise(r => setTimeout(r, 1000));
            
            // 随机停留1-3秒
            const viewDuration = Math.floor(
              Math.random() * 
              (scrollConfig.detailView.maxDuration - scrollConfig.detailView.minDuration) + 
              scrollConfig.detailView.minDuration
            );
            await new Promise(r => setTimeout(r, viewDuration));

            // 滚动评论到底部
            await scrollCommentToBottom();

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
              await new Promise(r => setTimeout(r, 500));
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

          // 计算滚动距离
          const deltaY = Math.floor(Math.random() * (scrollConfig.maxDelta - scrollConfig.minDelta) + scrollConfig.minDelta);
          const startY = window.scrollY;
          const targetY = startY + deltaY;

          // 平滑滚动
          const steps = 120;
          for(let i = 0; i < steps; i++) {
            const progress = i / (steps - 1);
            const easedProgress = easeInOutCubic(progress);
            const currentY = startY + (targetY - startY) * easedProgress;
            window.scrollTo(0, currentY);
            await new Promise(r => setTimeout(r, 20));
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

          const delay = Math.floor(Math.random() * (scrollConfig.maxDelay - scrollConfig.minDelay) + scrollConfig.minDelay);
          setTimeout(scroll, delay);
        } catch(error) {
          window.electronAPI.sendRendererLog({
            accountId: '${subTaskInfo.account_id}',
            message: 'scrollToBottom error,line552' + error,
            url: location.href,
            error: error.message
          });
          // 发送错误消息
          window.electronAPI.sendCollectCommentTaskStatus({
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