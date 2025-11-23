const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 参数：node test-playwright.cjs 关键词 
const keyword = process.argv[2] || '国家大事';
const MAX_NOTES = 10; // 最多爬取的笔记数量
const MAX_AUTHORS = 3; // 最多爬取的博主数量

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--window-size=1920,1080']
  });
  const context = await browser.newContext({
    viewport: { width: 920, height: 580 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
  });

  // 创建存储结果的目录
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir);
  }

  // 拦截API请求的结果
  const apiResponses = [];
  const notesData = [];
  const feedData = []; // 专门存储feed API数据
  const authorData = []; // 存储博主信息
  let searchResultsAPI = null;

  // 定义要捕获的API响应
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    
    // 继续请求
    await route.continue();
    
    // 检查是否匹配特定API
    const isEdithFeed = url.includes('edith.xiaohongshu.com/api/sns/web/v1/feed');
    const isSearchNotes = url.includes('/api/sns/web/v1/search/notes');
    const isNoteDetail = url.includes('/api/sns/web/v1/note/');
    const isFeedAPI = url.includes('/api/sns/web/v1/feed');
    const isUserAPI = url.includes('/api/sns/web/v1/user/');
    
    // 只拦截API响应
    if (isEdithFeed || isSearchNotes || isNoteDetail || isFeedAPI || isUserAPI) {
      try {
        const response = await route.request().response();
        if (response) {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const json = await response.json();
            
            // 所有API响应都保存一份
            apiResponses.push({
              url,
              data: json
            });
            
            // 保存搜索结果API
            if (isSearchNotes) {
              searchResultsAPI = json;
              console.log('已捕获搜索结果API数据');
            }
            
            // 保存笔记详情API
            if (isNoteDetail) {
              console.log(`已捕获笔记详情API数据: ${url}`);
              notesData.push(json);
            }
            
            // 保存edith feed API数据
            if (isEdithFeed) {
              console.log(`已捕获Edith Feed API数据: ${url}`);
              feedData.push({
                url,
                timestamp: new Date().toISOString(),
                data: json
              });
              console.log(JSON.stringify(json, null, 2));
            }
            // 保存其他feed API数据
            else if (isFeedAPI) {
              console.log(`已捕获Feed API数据: ${url}`);
              feedData.push({
                url,
                timestamp: new Date().toISOString(),
                data: json
              });
            }
            
            // 保存用户/博主API数据
            if (isUserAPI) {
              console.log(`已捕获博主信息API数据: ${url}`);
              authorData.push({
                url,
                timestamp: new Date().toISOString(),
                data: json
              });
            }
          }
        }
      } catch (err) {
        console.error('拦截API响应时出错:', err.message);
      }
    }
  });

  const page = await context.newPage();

  try {
    // 1. 打开小红书主页
    console.log('正在打开小红书首页...');
    await page.goto('https://www.xiaohongshu.com/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000 + Math.random() * 2000); // 随机等待

    // 2. 点击登录按钮，显示二维码
    console.log('正在显示登录二维码...');
    await page.click('text=登录');
    await page.waitForTimeout(2000 + Math.random() * 1000); // 随机等待
    
    console.log('请使用手机扫描二维码进行登录...');
    console.log('等待登录中，请扫码...');
    
    // 等待登录成功 - 检测页面变化或用户手动确认
    console.log('请在登录成功后，按回车键继续...');
    await new Promise(resolve => {
      process.stdin.once('data', data => {
        resolve();
      });
    });
    
    console.log('登录成功！继续执行后续操作...');
    await page.waitForTimeout(3000); // 登录成功后稍等片刻

    // 3. 搜索关键词
    console.log(`正在搜索关键词: ${keyword}...`);
    await page.fill('input[type="search"], input[placeholder*="搜索"]', keyword);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);

    // 4. 等待搜索结果加载
    await page.waitForSelector('.note-item, .note-card, .feed-item, article', { timeout: 30000 });
    
    // 5. 获取笔记列表
    console.log('正在获取笔记列表...');
    // 使用更通用的选择器匹配小红书的笔记元素
    const noteSelectors = [
      'article',
      '.note-item',
      '.feed-item', 
      '.note-card',
      '.browse-feed-item'
    ];
    
    const selector = noteSelectors.join(', ');
    const notes = await page.$$(selector);
    
    console.log(`找到 ${notes.length} 篇笔记，准备获取详情...`);
    
    // 收集博主信息，防止重复访问
    const visitedAuthors = new Set();
    
    // 6. 依次点击进入笔记详情页
    const processedNotes = Math.min(notes.length, MAX_NOTES);
    
    for (let i = 0; i < processedNotes; i++) {
      try {
        console.log(`正在处理第 ${i+1}/${processedNotes} 篇笔记...`);
        
        // 重新获取元素，避免stale element问题
        const currentNotes = await page.$$(selector);
        if (i >= currentNotes.length) break;
        
        // 滚动到元素位置
        await currentNotes[i].scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000 + Math.random() * 1000);
        
        // 点击进入详情页
        await currentNotes[i].click();
        await page.waitForTimeout(3000 + Math.random() * 2000);
        
        // 等待详情页加载完成
        await page.waitForSelector('.content, .note-content', { timeout: 10000 });
        
        console.log(`已加载笔记详情页 ${i+1}`);
        
        // 获取当前笔记的URL作为标识
        const noteUrl = page.url();
        console.log(`笔记链接: ${noteUrl}`);
        
        // 在详情页停留更长时间，确保API请求完成
        await page.waitForTimeout(5000);
        
        // 查找博主头像或链接并点击进入博主页面
        const authorSelectors = [
          'a.user-info, a.author-info', 
          '.user-nickname, .author-name',
          '.avatar-container a, .author a',
          'a[href*="/user/profile/"]'
        ];
        
        // 尝试查找作者链接
        let authorElement = null;
        for (const authorSelector of authorSelectors) {
          authorElement = await page.$(authorSelector);
          if (authorElement) break;
        }
        
        if (authorElement) {
          // 提取作者信息以避免重复访问
          let authorId = '';
          try {
            const href = await authorElement.getAttribute('href');
            if (href) {
              authorId = href.split('/').pop();
            }
          } catch (e) {
            console.log('无法获取作者ID:', e.message);
          }
          
          // 检查是否已经访问过该博主
          if (authorId && !visitedAuthors.has(authorId) && visitedAuthors.size < MAX_AUTHORS) {
            console.log(`找到博主链接，正在进入博主页面... ID: ${authorId}`);
            visitedAuthors.add(authorId);
            
            // 点击进入博主页面
            await authorElement.click();
            await page.waitForTimeout(3000 + Math.random() * 2000);
            
            // 等待博主页面加载
            await page.waitForSelector('.user-profile, .author-page', { timeout: 10000 });
            console.log('已进入博主页面');
            
            // 获取博主页面URL
            const authorUrl = page.url();
            console.log(`博主页面链接: ${authorUrl}`);
            
            // 在博主页面执行任务
            await processAuthorPage(page);
            
            // 返回笔记详情页
            await page.goBack();
            await page.waitForTimeout(2000 + Math.random() * 1000);
            
            // 确保已回到笔记详情页
            await page.waitForSelector('.content, .note-content', { timeout: 10000 });
          }
        } else {
          console.log('未找到博主链接');
        }
        
        // 返回搜索列表页
        await page.goBack();
        await page.waitForTimeout(2000 + Math.random() * 1000);
        
        // 等待笔记列表重新加载
        await page.waitForSelector(selector, { timeout: 10000 });
      } catch (error) {
        console.error(`处理第 ${i+1} 篇笔记时出错:`, error.message);
        // 尝试返回搜索页面继续
        try {
          await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`, 
                          { waitUntil: 'networkidle' });
          await page.waitForTimeout(3000);
        } catch (e) {
          console.error('无法恢复到搜索页面:', e.message);
        }
      }
    }

    // 7. 保存所有收集到的API数据
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    
    if (apiResponses.length > 0) {
      fs.writeFileSync(
        path.join(resultsDir, `api_responses_${keyword}_${timestamp}.json`), 
        JSON.stringify(apiResponses, null, 2)
      );
      console.log(`已保存所有API响应数据，共 ${apiResponses.length} 个`);
    }
    
    if (notesData.length > 0) {
      fs.writeFileSync(
        path.join(resultsDir, `notes_data_${keyword}_${timestamp}.json`), 
        JSON.stringify(notesData, null, 2)
      );
      console.log(`已保存笔记详情数据，共 ${notesData.length} 个`);
    }
    
    if (feedData.length > 0) {
      fs.writeFileSync(
        path.join(resultsDir, `feed_data_${keyword}_${timestamp}.json`), 
        JSON.stringify(feedData, null, 2)
      );
      console.log(`已保存Feed数据，共 ${feedData.length} 个`);
    }
    
    if (authorData.length > 0) {
      fs.writeFileSync(
        path.join(resultsDir, `author_data_${keyword}_${timestamp}.json`), 
        JSON.stringify(authorData, null, 2)
      );
      console.log(`已保存博主数据，共 ${authorData.length} 个`);
    }
    
    if (searchResultsAPI) {
      fs.writeFileSync(
        path.join(resultsDir, `search_results_${keyword}_${timestamp}.json`), 
        JSON.stringify(searchResultsAPI, null, 2)
      );
      console.log(`已保存搜索结果API数据`);
    }

  } catch (error) {
    console.error('发生错误:', error.message);
    // 保存错误页面截图
    await page.screenshot({ path: path.join(resultsDir, 'error.png') });
    console.log('已保存错误页面截图到 error.png');
  } finally {
    await browser.close();
    console.log('浏览器已关闭，爬取完成');
  }
})();

/**
 * 在博主页面执行任务
 * @param {Page} page Playwright页面对象
 */
async function processAuthorPage(page) {
  console.log('开始处理博主页面...');
  
  try {
    // 1. 获取博主基本信息
    const infoSelectors = {
      name: '.user-name, .author-name, .nickname',
      description: '.user-desc, .desc, .description',
      followers: '.count-item, .follow-count, .fans-count'
    };
    
    const authorInfo = {};
    
    for (const [key, selector] of Object.entries(infoSelectors)) {
      try {
        const element = await page.$(selector);
        if (element) {
          authorInfo[key] = await element.innerText();
        }
      } catch (e) {
        console.log(`获取博主${key}信息失败:`, e.message);
      }
    }
    
    console.log('博主信息:', authorInfo);
    
    // 2. 滚动页面加载更多内容
    console.log('滚动页面加载更多内容...');
    await autoScroll(page);
    
    // 3. 停留一段时间确保数据加载完成
    await page.waitForTimeout(5000);
    
    // 4. 尝试点击查看更多按钮
    try {
      const moreButtons = [
        'button:has-text("查看更多")', 
        'a:has-text("查看全部")',
        '.more, .view-more'
      ];
      
      for (const buttonSelector of moreButtons) {
        const button = await page.$(buttonSelector);
        if (button) {
          console.log('点击查看更多按钮');
          await button.click();
          await page.waitForTimeout(3000);
          break;
        }
      }
    } catch (e) {
      console.log('点击查看更多按钮失败:', e.message);
    }
    
    console.log('博主页面处理完成');
  } catch (error) {
    console.error('处理博主页面时出错:', error.message);
  }
}

/**
 * 自动滚动页面到底部
 * @param {Page} page Playwright页面对象
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}