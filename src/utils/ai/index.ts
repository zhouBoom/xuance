// @ts-ignore
import OpenAI from "openai";

// const openai = new OpenAI({
//   baseURL: 'http://ai-service.tal.com/openai-compatible/v1',
//   apiKey: '1000081441:e53cfe4489e64f22a347dec6d8b15b07'
// });

const openai = new OpenAI({
  baseURL: 'http://ai-service.tal.com/openai-compatible/v1',
  apiKey: '1000081607:b48059abb8bd9e6956e95dd633ded034'
});

const getTemplate = (articleInfo: string, keywords: string, prompt: string) => {
  return `
    角色：你是语义级内容匹配专家，专注于比较关键词keywords的内容和文章内容articleInfo的关联程度 
    任务： 基于输入参数articleInfo的内容和参数keywords的内容相似度（keywords为数组，其中一个元素满足即可）判断是否有强关联而且语言情感倾向为积极的或者中性的，如果是则输出为true，如果不是则输出为false。判断articleInfo和keywords是否内容有关联的维度如下：   
    1. 直接关键词提及    
    2. 同义/近义表达   
    3. 隐含语义关联   
    4. 情感倾向匹配   
    5. 上下文逻辑关联
    如果输入参数中prompt有值，则以prompt参数的内容为返回true或者false的主要依据。  
    如果输入的keywords参数为空，则判断文章内容是否语言情感倾向为积极或者中性，如果是则输出为true，如果不是则输出为false。
    处理规范: {   
      "输入要求": {
        "keywords": ${keywords || ''},    
        "articleInfo": ${articleInfo},
        "prompt": ${prompt || ''}
      },   
      "输出规范": true/false  
    }
    请牢牢记住：关键词与文章存在关联（keywords为数组，其中一个元素满足即可）为true，否则为false，只需要返回true或者false，不需要返回分析过程 `; 
};

export async function analyzeTextSentiment(articleInfo: string, keywords: string, prompt: string): Promise<boolean> {
  try {
    const template = getTemplate(articleInfo, keywords, prompt);
    console.log('template', template);
    const completion = await openai.chat.completions.create({
      messages: [{
        role: "system", 
        content: template 
      }],
      model: "deepseek-chat-search",
    });
    
    const result = completion.choices[0].message.content.trim().toLowerCase();
    return result === 'true';
  } catch (error) {
    Logger.error('AI分析文本时出错:', error);
    return true;
  }
}

export default {
  analyzeTextSentiment
};
