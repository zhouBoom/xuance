const express = require('express');
const puppeteer = require('puppeteer');
const Queue = require('better-queue');
const app = express();
const port = 9000;

// 浏览器实例池
class BrowserPool {
  constructor(maxSize = 5) {
    this.browsers = [];
    this.maxSize = maxSize;
    this.initPromise = this.initialize();
  }
  
  async initialize() {
    console.log("初始化浏览器池...");
    // 预先启动一个浏览器实例
    const browser = await this.createBrowser();
    this.browsers.push({
      browser,
      inUse: false,
      lastUsed: Date.now()
    });
    console.log("浏览器池初始化完成");
  }
  
  async createBrowser() {
    return await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-software-rasterizer', // 禁用软件光栅化
        '--no-zygote',
        '--single-process', // 单进程模式提高启动速度 (有稳定性风险)
        '--disable-extensions',
        '--disable-component-extensions-with-background-pages', 
        '--disable-default-apps',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-ipc-flooding-protection'
      ],
      ignoreHTTPSErrors: true,
      handleSIGINT: false, // 防止Puppeteer捕获SIGINT信号
      handleSIGTERM: false, // 防止Puppeteer捕获SIGTERM信号
      handleSIGHUP: false, // 防止Puppeteer捕获SIGHUP信号
    });
  }
  
  async getBrowser() {
    // 等待初始化完成
    await this.initPromise;
    
    // 查找空闲浏览器
    const availableBrowser = this.browsers.find(b => !b.inUse);
    
    if (availableBrowser) {
      // 有空闲浏览器，标记为使用中
      availableBrowser.inUse = true;
      availableBrowser.lastUsed = Date.now();
      return availableBrowser.browser;
    }
    
    // 没有空闲浏览器，如果没达到最大数量则创建新的
    if (this.browsers.length < this.maxSize) {
      console.log(`创建新浏览器实例 (${this.browsers.length + 1}/${this.maxSize})`);
      const browser = await this.createBrowser();
      const browserObj = {
        browser,
        inUse: true,
        lastUsed: Date.now()
      };
      this.browsers.push(browserObj);
      return browser;
    }
    
    // 已达到最大数量，等待一个浏览器变为可用
    console.log("浏览器池已满，等待空闲浏览器...");
    return new Promise(resolve => {
      const checkInterval = setInterval(() => {
        const availableBrowser = this.browsers.find(b => !b.inUse);
        if (availableBrowser) {
          clearInterval(checkInterval);
          availableBrowser.inUse = true;
          availableBrowser.lastUsed = Date.now();
          resolve(availableBrowser.browser);
        }
      }, 100);
    });
  }
  
  releaseBrowser(browser) {
    const index = this.browsers.findIndex(b => b.browser === browser);
    if (index !== -1) {
      this.browsers[index].inUse = false;
      this.browsers[index].lastUsed = Date.now();
    }
  }
  
  // 清理长时间不用的浏览器
  async cleanup() {
    const now = Date.now();
    const inactiveTimeout = 5 * 60 * 1000; // 5分钟
    
    for (let i = this.browsers.length - 1; i >= 0; i--) {
      const browserObj = this.browsers[i];
      if (!browserObj.inUse && now - browserObj.lastUsed > inactiveTimeout) {
        // 保留至少一个实例
        if (this.browsers.length > 1) {
          console.log("关闭长时间不用的浏览器实例");
          await browserObj.browser.close();
          this.browsers.splice(i, 1);
        }
      }
    }
  }
}

// 创建浏览器池
const browserPool = new BrowserPool(6); // 从3增加到6

// 定时清理浏览器池
setInterval(() => browserPool.cleanup(), 60 * 1000);

// 添加简单的内存缓存
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 缓存30分钟

// 添加简单负载监控
let activeRequests = 0;
let totalRequests = 0;
let failedRequests = 0;

app.get('/metrics', (req, res) => {
  const uptime = process.uptime();
  res.json({
    activeRequests,
    totalRequests,
    failedRequests,
    requestsPerMinute: totalRequests / (uptime / 60),
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    memoryUsage: process.memoryUsage(),
    browserPool: {
      size: browserPool.browsers.length,
      available: browserPool.browsers.filter(b => !b.inUse).length
    }
  });
});

// 队列定义部分保持不变
const scrapingQueue = new Queue(async (task, callback) => {
  try {
    const result = await fetchRedbookContent(task.url);
    callback(null, result);
  } catch (err) {
    callback(err);
  }
}, { 
  concurrent: 6,  // 同时处理的任务数
  maxRetries: 2,  // 失败重试次数
  retryDelay: 1000 // 重试延迟
});

// 修改 API 端点以使用队列
app.get('/fetch-redbook', async (req, res) => {
  const url = req.query.url;
  
  if (!url || !url.includes('xiaohongshu.com')) {
    return res.status(400).json({ error: '请提供有效的小红书URL' });
  }
  
  // 检查缓存
  const cacheKey = url;
  if (cache.has(cacheKey)) {
    const cachedData = cache.get(cacheKey);
    
    // 检查缓存是否过期
    if (Date.now() - cachedData.timestamp < CACHE_TTL) {
      console.log(`使用缓存数据: ${cacheKey}`);
      return res.json({ 
        success: true, 
        content: cachedData.content,
        fromCache: true,
        cachedAt: new Date(cachedData.timestamp).toISOString()
      });
    } else {
      // 缓存过期，移除
      cache.delete(cacheKey);
    }
  }
  
  // 通过队列处理请求
  scrapingQueue.push({ url }, (err, result) => {
    if (err) {
      console.error('获取内容失败:', err);
      return res.status(500).json({ error: '获取内容失败: ' + err.message });
    }
    
    // 存入缓存
    cache.set(cacheKey, {
      content: result,
      timestamp: Date.now()
    });
    
    res.json({ 
      success: true, 
      content: result,
      queued: true
    });
  });
});

// 添加查看队列状态的端点
app.get('/queue-status', (req, res) => {
  res.json({
    length: scrapingQueue.length,
    running: scrapingQueue.running,
    concurrency: scrapingQueue.concurrency,
    stats: {
      total: scrapingQueue.stats.total,
      average: scrapingQueue.stats.average,
      successRate: scrapingQueue.stats.successRate
    }
  });
});

async function fetchRedbookContent(url) {
  // 提取笔记ID
  let noteId = '';
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    noteId = pathParts[pathParts.length - 1].split('?')[0]; 
    console.log(`检测到笔记ID: ${noteId}`);
  } catch (e) {
    console.log('无法从URL提取笔记ID:', e);
  }
  
  // 从池中获取浏览器实例
  const browser = await browserPool.getBrowser();
  
  try {
    // 复用浏览器，创建新页面
    const page = await browser.newPage();
    const pageCreateTime = Date.now();
    
    try {
      // 页面设置
      await Promise.all([
        page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'),
        page.setDefaultNavigationTimeout(15000),
        page.setViewport({ width: 1280, height: 800 }),
        page.setJavaScriptEnabled(true) // 确保JS启用
      ]);
      
      // 资源拦截
      await page.setRequestInterception(true);
      page.on('request', request => {
        const resourceType = request.resourceType();
        const url = request.url();
        
        if (
          ['image', 'font', 'media'].includes(resourceType) ||
          url.includes('.png') || url.includes('.jpg') || url.includes('.gif') ||
          url.includes('tracker') || url.includes('analytics') || url.includes('stat')
        ) {
          request.abort();
        } else {
          request.continue();
        }
      });
      
      console.log('正在访问URL:', url);
      await Promise.race([
        page.goto(url, { waitUntil: 'domcontentloaded' }),
        new Promise(resolve => setTimeout(resolve, 5000)) // 从8秒减少到5秒
      ]);
      
      console.log(`页面加载完成，耗时: ${Date.now() - pageCreateTime}ms`);
      
      // 立即尝试获取数据，不等待其他资源
      const quickCheck = await page.evaluate(() => {
        if (window.__INITIAL_STATE__?.note?.noteDetailMap) {
          return { hasData: true };
        }
        return { hasData: false };
      });
      
      // 如果已有数据立即提取，否则再等待
      let noteData = null;
      if (quickCheck.hasData) {
        noteData = await page.evaluate((noteId) => {
          if (window.__INITIAL_STATE__?.note?.noteDetailMap) {
            if (noteId && window.__INITIAL_STATE__.note.noteDetailMap[noteId]?.note) {
              return window.__INITIAL_STATE__.note.noteDetailMap[noteId].note;
            } else {
              const keys = Object.keys(window.__INITIAL_STATE__.note.noteDetailMap);
              if (keys.length > 0) {
                return window.__INITIAL_STATE__.note.noteDetailMap[keys[0]].note;
              }
            }
          }
          return null;
        }, noteId);
      } else {
        // 短暂等待后再次尝试
        await new Promise(resolve => setTimeout(resolve, 2000));
        noteData = await page.evaluate((noteId) => {
          if (window.__INITIAL_STATE__?.note?.noteDetailMap) {
            if (noteId && window.__INITIAL_STATE__.note.noteDetailMap[noteId]?.note) {
              return window.__INITIAL_STATE__.note.noteDetailMap[noteId].note;
            } else {
              const keys = Object.keys(window.__INITIAL_STATE__.note.noteDetailMap);
              if (keys.length > 0) {
                return window.__INITIAL_STATE__.note.noteDetailMap[keys[0]].note;
              }
            }
          }
          return null;
        }, noteId);
      }
      
      // 添加元数据
      const result = {
        ...noteData,
        sourceUrl: url,
        noteId,
        timestamp: new Date().toISOString()
      };
      
      return result;
    } finally {
      // 关闭页面释放资源，但保留浏览器实例
      await page.close();
      
      // 在某些情况下手动触发垃圾回收
      if (global.gc) {
        global.gc();
      }
    }
  } finally {
    // 释放浏览器回到池中
    browserPool.releaseBrowser(browser);
  }
}

// 添加CORS支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// 添加健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    pool: {
      size: browserPool.browsers.length,
      available: browserPool.browsers.filter(b => !b.inUse).length
    }
  });
});

// 确保在应用退出时清理浏览器实例
process.on('SIGINT', async () => {
  console.log('接收到SIGINT信号，关闭所有浏览器...');
  for (const browserObj of browserPool.browsers) {
    await browserObj.browser.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('接收到SIGTERM信号，关闭所有浏览器...');
  for (const browserObj of browserPool.browsers) {
    await browserObj.browser.close();
  }
  process.exit(0);
});

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});