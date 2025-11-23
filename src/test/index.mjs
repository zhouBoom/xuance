// Please install OpenAI SDK first: `npm install openai`

import OpenAI from "openai";

const openai = new OpenAI({
        baseURL: 'http://ai-service.tal.com/openai-compatible/v1',
        apiKey: '1000081441:e53cfe4489e64f22a347dec6d8b15b07'
});
const getTemplate = async (title, content, comments) => {
   return `
    # 语义级内容匹配专家系统指令
      ## 核心任务
      基于语义相似度判断标题、正文、评论（含子评论）是否与目标关键词产生且情感为正向或中性 **实质性关联**，需识别：
      1. 直接关键词提及 
      2. 同义/近义表达
      3. 隐含语义关联
      4. 情感倾向匹配
      5. 上下文逻辑关联

      ## 参数配置
      **目标语义维度**（需综合判断）：
      {
        "产品相关": ["学而思", "学习机", "学练机"],
        "情绪类型": ["效果满意", "功能满意", "外观满意", "性价比满意", "使用满意", "服务满意", "物流满意", "售后满意", "其他满意", "好奇了解"],
        "用户行为": ["购买", "夸赞", '了解']
      }

      匹配规则：
        三级置信度判断：
          确信匹配（直接证据）
          推测匹配（逻辑关联）
          无关内容
        情感极性强化：
          正向评价自动加权
          中性描述需附加条件
        关联扩散机制：
          价格比较（>50%价差触发）
          功能对比（3项以上差异）
          品牌提及（竞品对比）

处理规范:
{
  "输入要求": {
    "keywords": ['关键词1', '关键词2'],
    "title": "带分析标题",
    "content": "正文内容",
    "comments": [
      {
        "comment_id": "唯一ID",
        "content": "评论内容",
        "sub_comments": [
          {
            "sub_comment_id": "子评论ID", 
            "content": "子评论内容"
          }
        ]
      }
    ]
  },
  "输出规范": true/false // 匹配且情感为正向或者中性为true，否则为false，只需要返回true/false，不需要分析过程
}


输入内容：

{
  "keywords": ['学而思学习机', '学练机'],
    "title": "${title}",
    "content": "${content}",
    "comments": ${JSON.stringify(comments)}
}
`;
}

async function main() {
  try {
    const res = await fetch("https://udc.100tal.com/bifang/api/articlecollect/list", {
      "headers": {
        "accept": "application/json, text/plain, */*",
        "accept-language": "zh,en-US;q=0.9,en;q=0.8",
        "business-id": "5",
        "cache-control": "no-cache",
        "content-type": "application/json",
        "pragma": "no-cache",
        "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-requested-with": "XMLHttpRequest",
        "cookie": "udc_token=ZW5_eEFjQmhRMC1tcVpNMnN3c2lZQW1LWmUyUm5BbVl1Sjhjal95ODFLTnFxYjRZUGpVS28zMFVuY3VzSktSTjhzbk1zY0MydEdkOFhIMnFyTnBQZEdDQ2x3SGloajJNYmQ2cEQtd1Eydjk3alVEUVdKdnFTN0JhYWhFTzRkQlNQMVFySklfVEhPTWhKTng5UUpUbndZWjFWTm1nWDJpRXVYQ1ctcEhBbTRPdkdDT1NGTmMzTVFTTzcxSXFuVkNlZHVDVWJGb2RUX1VhS1BYQzNoZ1NMRUVHTUJiVUxEdEwxUmgxeUlkLVBSb3FoaDdHRnctM2xrN2xMbnNLYjhoUG1odHcwdTVPaXFMelhlRFliTEd6ZEJHWWk0a0NuSEhwYWdIbUNMVFYtek1VMV9NNFZiZkw4VGVVd0E1NVRmcGZSUXN2NXFfQy1QTmVSejFQanItTnZDclpCSHFfcnNreXZUbU5SRzJXc0RNS25SZEZGcXpZeEE2NTJmMWJDYzlZZ0p5WXNKY3Ftak1uT0x1cDE5Z1gxTC12Z0YzMWkyd21NcjR6V1lXdGp2cDJwaTdEMmFfd0FSa1VyXzZDU1V2b3NmUDJ5T0ltWEprMkZFdkhNQjZ0aVNlOW5XeHpqVTdfaXpsX1U3TFlFOU01Zmcc; udc_sdk_uid=211513",
        "Referer": "https://udc.100tal.com/bifang/article-operate/article-spider/article-result",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      },
      "body": "{\"publishTime\":[],\"collectTime\":[],\"page\":1,\"page_size\":20}",
      "method": "POST"
    });
    
    const data = await res.json();
    
    // 使用Promise.all处理所有请求
    await Promise.all(data.data.list.map(async (item) => {
      try {
        const detailRes = await fetch("https://udc.100tal.com/bifang/api/articlecollect/detail", {
          "headers": {
            "accept": "application/json, text/plain, */*",
            "accept-language": "zh,en-US;q=0.9,en;q=0.8",
            "business-id": "5",
            "cache-control": "no-cache",
            "content-type": "application/json",
            "pragma": "no-cache",
            "sec-ch-ua": "\"Chromium\";v=\"134\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"134\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-requested-with": "XMLHttpRequest",
            "cookie": "udc_token=ZW5_eEFjQmhRMC1tcVpNMnN3c2lZQW1LWmUyUm5BbVl1Sjhjal95ODFLTnFxYjRZUGpVS28zMFVuY3VzSktSTjhzbk1zY0MydEdkOFhIMnFyTnBQZEdDQ2x3SGloajJNYmQ2cEQtd1Eydjk3alVEUVdKdnFTN0JhYWhFTzRkQlNQMVFySklfVEhPTWhKTng5UUpUbndZWjFWTm1nWDJpRXVYQ1ctcEhBbTRPdkdDT1NGTmMzTVFTTzcxSXFuVkNlZHVDVWJGb2RUX1VhS1BYQzNoZ1NMRUVHTUJiVUxEdEwxUmgxeUlkLVBSb3FoaDdHRnctM2xrN2xMbnNLYjhoUG1odHcwdTVPaXFMelhlRFliTEd6ZEJHWWk0a0NuSEhwYWdIbUNMVFYtek1VMV9NNFZiZkw4VGVVd0E1NVRmcGZSUXN2NXFfQy1QTmVSejFQanItTnZDclpCSHFfcnNreXZUbU5SRzJXc0RNS25SZEZGcXpZeEE2NTJmMWJDYzlZZ0p5WXNKY3Ftak1uT0x1cDE5Z1gxTC12Z0YzMWkyd21NcjR6V1lXdGp2cDJwaTdEMmFfd0FSa1VyXzZDU1V2b3NmUDJ5T0ltWEprMkZFdkhNQjZ0aVNlOW5XeHpqVTdfaXpsX1U3TFlFOU01Zmcc; udc_sdk_uid=211513",
            "Referer": "https://udc.100tal.com/bifang/article-operate/article-spider/article-result",
            "Referrer-Policy": "strict-origin-when-cross-origin"
          },
          "body": JSON.stringify({"collect_id": item.collect_id}),
          "method": "POST"
        });
        
        const detailData = await detailRes.json();
        const template = await getTemplate(
          detailData.data.title, 
          detailData.data.content, 
          detailData.data.comments || []
        );
        
        const completion = await openai.chat.completions.create({
          messages: [{ 
            role: "system", 
            content: template 
          }],
          model: "deepseek-chat-search",
        });
        
        console.log(`文章ID: ${item.collect_id} - 结果: ${completion.choices[0].message.content}`);
      } catch (error) {
        console.error(`处理文章 ${item.collect_id} 时出错:`, error);
      }
    }));
    
    console.log('所有文章处理完成');
  } catch (error) {
    console.error('主程序执行出错:', error);
  }
}

main();

// 定时执行
const interval = 60000; // 每分钟执行一次
setInterval(() => {
  console.log('开始新一轮处理...');
  main().catch(err => console.error('定时任务执行出错:', err));
}, interval);