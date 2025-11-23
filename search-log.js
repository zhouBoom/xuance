#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { program } = require('commander');

// 命令行参数设置
program
  .name('search-log')
  .description('搜索日志文件中包含指定关键词的行')
  .argument('<logFile>', '要搜索的日志文件路径')
  .argument('<keywords...>', '要搜索的关键词，可指定多个')
  .option('-o, --output <file>', '输出文件路径(可选)')
  .option('-m, --mode <mode>', '搜索模式: or(默认)|and', 'or')
  .action(async (logFile, keywords, options) => {
    try {
      await searchLogFile(logFile, keywords, options.output, options.mode);
    } catch (error) {
      console.error('\x1b[31m错误: %s\x1b[0m', error.message);
      process.exit(1);
    }
  });

program.parse();

/**
 * 搜索日志文件中包含关键词的行
 * @param {string} logFile 日志文件路径
 * @param {string[]} keywords 关键词数组
 * @param {string} outputFile 输出文件路径(可选)
 * @param {string} mode 搜索模式: or(默认)|and
 */
async function searchLogFile(logFile, keywords, outputFile, mode) {
  // 检查日志文件是否存在
  if (!fs.existsSync(logFile)) {
    throw new Error(`日志文件不存在: ${logFile}`);
  }

  // 如果没有指定输出文件，生成一个
  if (!outputFile) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').substring(0, 15);
    const keywordPart = keywords.join('-').substring(0, 20);
    const logFileName = path.basename(logFile, path.extname(logFile));
    const outputDir = path.dirname(logFile);
    outputFile = path.join(outputDir, `搜索结果_${logFileName}_${keywordPart}_${timestamp}.log`);
  }

  console.log('\x1b[32m开始搜索...\x1b[0m');
  console.log('\x1b[36m日志文件: %s\x1b[0m', logFile);
  console.log('\x1b[36m关键词: %s\x1b[0m', keywords.join(', '));
  console.log('\x1b[36m输出文件: %s\x1b[0m', outputFile);
  console.log('\x1b[36m搜索模式: %s\x1b[0m', mode.toUpperCase());

  // 构建正则表达式
  const searchPattern = new RegExp(keywords.map(k => 
    k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
  
  // 计时开始
  const startTime = Date.now();
  
  // 创建读写流
  const fileStream = fs.createReadStream(logFile, { encoding: 'utf8' });
  const outputStream = fs.createWriteStream(outputFile, { encoding: 'utf8' });
  
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let lineCount = 0;
  let matchCount = 0;

  // 逐行处理
  for await (const line of rl) {
    lineCount++;
    
    // 根据模式选择不同的匹配逻辑
    let isMatch = false;
    if (mode.toLowerCase() === 'and') {
      // AND模式：必须包含所有关键词
      isMatch = keywords.every(keyword => 
        line.toLowerCase().includes(keyword.toLowerCase()));
    } else {
      // OR模式：包含任一关键词即可
      isMatch = keywords.some(keyword => 
        line.toLowerCase().includes(keyword.toLowerCase()));
    }
    
    if (isMatch) {
      outputStream.write(line + '\n');
      matchCount++;
    }
    
    // 每处理10000行打印进度
    if (lineCount % 10000 === 0) {
      process.stdout.write(`\r\x1b[33m已处理 ${lineCount} 行，找到 ${matchCount} 个匹配...\x1b[0m`);
    }
  }

  // 关闭写入流
  outputStream.end();

  // 计算耗时
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n\x1b[32m搜索完成!\x1b[0m');
  console.log('\x1b[36m处理了 %d 行\x1b[0m', lineCount);
  console.log('\x1b[36m找到 %d 行匹配内容\x1b[0m', matchCount);
  console.log('\x1b[36m结果已保存到: %s\x1b[0m', outputFile);
  console.log('\x1b[36m耗时: %s 秒\x1b[0m', duration);

  if (matchCount > 0) {
    console.log('\x1b[32m可以使用您喜欢的文本编辑器打开结果文件查看\x1b[0m');
  }
}