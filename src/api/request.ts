import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { createHash } from 'crypto';
import { EnvConfig } from '../config/env';
import { app } from 'electron';
import { XuanceModule } from '../types/xuance-module';
import { Logger } from '../utils/logger';

// API配置信息
interface ApiConfig {
  appId: string;
  appKey: string;
  baseURL: string;
  appVersion: string;
  appVc: string;
  timeout: number;
}

// API响应格式
interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// 沙箱和生产环境配置
const getApiConfig = (): ApiConfig => {
  const isSandbox = EnvConfig.IS_SANDBOX;
  
  return {
    appId: isSandbox ? '41234567890123456' : '41234567890123456', // 替换为实际的AppID
    appKey: isSandbox ? 'MEcQ9wKXGNcMTd5ANzb5dz79g5qF9aNtr' : 'MEcQ9wKXGNcMTd5ANzb5dz79g5qF9aNtr', // 替换为实际的AppKey
    baseURL: isSandbox ? 'https://test-openwechat.100tal.com' : 'https://openwechat.100tal.com',
    appVersion: app.getVersion(),
    appVc: process.env.APP_VC || '1',
    timeout: 30000
  };
};

class ApiRequest {
  private axiosInstance: AxiosInstance;
  private config: ApiConfig;

  constructor() {
    this.config = getApiConfig();
    this.axiosInstance = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // 请求拦截器 - 添加签名和其他头信息
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const timestamp = Date.now().toString();
        const sign = this.generateSign(timestamp);

        // 添加请求头
        config.headers['x-bf-appid'] = this.config.appId;
        config.headers['x-bf-sign'] = sign;
        config.headers['x-bf-timestamp'] = timestamp;
        config.headers['x-bf-app-version'] = this.config.appVersion;
        config.headers['x-bf-app-vc'] = this.config.appVc;
        config.headers['x-bf-app-debug'] = process.env.NODE_ENV === 'development' ? '1' : '0';

        Logger.debug(XuanceModule.SYSTEM.API, 'default', 'API请求:', {
          url: config.url,
          method: config.method,
          headers: config.headers,
          data: config.data
        });

        return config;
      },
      (error) => {
        Logger.error(XuanceModule.SYSTEM.API, 'default', '请求拦截器错误:', error);
        return Promise.reject(error);
      }
    );

    // 响应拦截器 - 处理响应和错误
    this.axiosInstance.interceptors.response.use(
      (response) => {
        const { data } = response;
        
        Logger.debug(XuanceModule.SYSTEM.API, 'default', 'API响应:', {
          url: response.config.url,
          status: response.status,
          data
        });
        
        // 根据API的响应格式进行处理
        if (data.code === 0) {
          return data;
        }
        
        // 处理业务错误
        const error = new Error(data.message || '未知错误');
        error.name = 'ApiError';
        (error as any).code = data.code;
        (error as any).response = response;
        
        return Promise.reject(error);
      },
      (error) => {
        // 处理网络错误或服务器错误
        if (error.response) {
          Logger.error(XuanceModule.SYSTEM.API, 'default', '响应错误:', {
            url: error.config.url,
            status: error.response.status,
            data: error.response.data
          });
        } else {
          Logger.error(XuanceModule.SYSTEM.API, 'default', '网络错误:', {
            url: error.config?.url,
            message: error.message
          });
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * 生成API签名
   * @param timestamp 毫秒时间戳
   * @returns 签名字符串
   */
  private generateSign(timestamp: string): string {
    // 按照文档要求: md5(【AppID】+ & + 【毫秒时间戳】+ 【AppKey】)
    const signStr = `${this.config.appId}&${timestamp}${this.config.appKey}`;
    return createHash('md5').update(signStr).digest('hex');
  }

  /**
   * 发送请求
   * @param config 请求配置
   * @returns Promise<ApiResponse<T>>
   */
  public async request<T = any>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      return await this.axiosInstance.request(config);
    } catch (error) {
      Logger.error(XuanceModule.SYSTEM.API, 'default', '请求失败:', error);
      throw error;
    }
  }

  /**
   * GET请求
   * @param url 请求路径
   * @param params 查询参数
   * @returns Promise<ApiResponse<T>>
   */
  public async get<T = any>(url: string, params?: any): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'get',
      url,
      params
    });
  }

  /**
   * POST请求
   * @param url 请求路径
   * @param data 请求体数据
   * @returns Promise<ApiResponse<T>>
   */
  public async post<T = any>(url: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'post',
      url,
      data
    });
  }

  // 示例API接口实现

  /**
   * 获取服务器当前时间
   * @returns Promise<number> 服务器当前时间戳(毫秒)
   */
  public async getTimeNow(): Promise<number> {
    Logger.info('开始请求系统时间')
    const response = await this.post<{ timenow: number }>('/bfapi/common/timenow');
    Logger.info(JSON.stringify(response.data))
    return response.data as any as number;
  }

  /**
   * 发送通知
   * @param workcodeList 接收人工号列表
   * @param content 通知内容
   * @returns Promise<void>
   */
  public async sendNotice(workcodeList: string[], content: string): Promise<void> {
    Logger.info('开始发送通知')
    await this.post('/bfapi/common/sendnotice', {
      workcode_list: workcodeList,
      content
    });
  }

  /**
   * 检测API服务器连接
   * @returns Promise<boolean> 连接是否正常
   */
  public async checkConnection(): Promise<boolean> {
    try {
      await this.getTimeNow();
      return true;
    } catch (error) {
      Logger.error(XuanceModule.SYSTEM.API, 'default', 'API连接检测失败:', error);
      return false;
    }
  }
}

// 导出API请求实例
export const apiRequest = new ApiRequest();

// 导出用于类型定义的接口
export type { ApiResponse };
