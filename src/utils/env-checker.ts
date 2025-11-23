import * as dns from 'dns';
import { promisify } from 'util';
import { app, dialog, net } from 'electron';
import { DialogHelper, DialogType } from './dialog-helper';
import { getMainWindow } from '../main';
import { XuanceModule } from '../types/xuance-module';
import { apiRequest } from '../api/request';

// 将回调式API转换为Promise式API
const resolve4 = promisify(dns.resolve4);
const lookup = promisify(dns.lookup);

/**
 * 检测域名是否指向特定IP地址
 * @param domain 要检测的域名
 * @param targetIP 目标IP地址
 * @returns Promise<boolean> 域名是否指向目标IP
 */
export async function isDomainPointingToIP(domain: string, targetIP: string): Promise<boolean> {
  try {
    // 方法1: 使用lookup (考虑本地hosts文件)
    const lookupResult = await lookup(domain);
    if (lookupResult.address === targetIP) {
      console.log(`通过lookup检测: ${domain} -> ${lookupResult.address}`);
      return true;
    }

    // 方法2: 使用resolve4 (直接查询DNS服务器)
    const addresses = await resolve4(domain);
    console.log(`域名 ${domain} 解析结果: ${addresses.join(', ')}`);
    
    // 检查是否有匹配的IP
    return addresses.includes(targetIP);
  } catch (error) {
    console.error(`解析域名 ${domain} 时出错:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * 检测网络连接是否正常
 * @returns Promise<boolean> 网络是否正常
 */
export async function isNetworkConnected(): Promise<boolean> {
  try {
    // 尝试访问几个常用网站检测网络连接
    const testUrls = [
      'https://www.baidu.com',
      'https://www.qq.com',
      'https://www.aliyun.com'
    ];
    
    // 使用Electron的net模块进行请求
    for (const url of testUrls) {
      try {
        const request = net.request(url);
        const connected = await new Promise<boolean>((resolve) => {
          request.on('response', () => {
            resolve(true);
          });
          
          request.on('error', () => {
            resolve(false);
          });
          
          // 设置超时
          setTimeout(() => {
            resolve(false);
          }, 5000);
          
          request.end();
        });
        
        if (connected) {
          return true; // 只要有一个能连通就认为网络正常
        }
      } catch (err) {
        console.log(`测试连接 ${url} 出错:`, err);
        // 继续尝试下一个URL
      }
    }
    
    return false; // 所有网站都连不上，网络可能有问题
  } catch (error) {
    console.error('网络连接检测出错:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * 特定检测upload.xueersi.com域名是否指向182.92.149.75
 * @returns Promise<boolean> 是否指向目标IP
 */
export async function isXueersiUploadValid(): Promise<boolean> {
  const domain = 'upload.xueersi.com';
  const targetIP = '182.92.149.75';
  
  const result = await isDomainPointingToIP(domain, targetIP);
  console.log(`${domain} ${result ? '指向' : '不指向'} ${targetIP}`);
  
  return result;
}


// 导出其他可能需要的函数
export async function validateAllEnvironment() {
  const networkStatus = await isNetworkConnected();
  const mainWindow = getMainWindow();
  if(!networkStatus){
    mainWindow && DialogHelper.showNonModalDialog(
        mainWindow,
        {
            title: '网络连接异常',
            message: '检测到网络连接异常',
            detail: '请检查您的网络连接是否正常，然后重试。',
            type: DialogType.WARNING,
            buttons: [
                {
                    text: '确认',
                    id: 0,
                    isDefault: true,
                    action: () => {
                        Logger.info(XuanceModule.SYSTEM.APP.RELAUNCH, 'system', '用户点击确认按钮重启程序');
                        app.relaunch();
                        app.exit(0);
                    }
                }
            ],
            defaultId: 0,
            cancelId: 0
        },
        'account-logged-in-elsewhere'
    );
    return false;
  }
  const dnsStatus = await isXueersiUploadValid();
  if(dnsStatus){
    mainWindow && DialogHelper.showNonModalDialog(
        mainWindow,
        {
            title: 'DNS配置异常',
            message: '检测到DNS配置异常',
            detail: '请检查您的DNS配置指向到测试环境，请修改配置，然后重试。',
            type: DialogType.WARNING,
            buttons: [
                {
                    text: '确认',
                    id: 0,
                    isDefault: true,
                    action: () => {
                        Logger.info(XuanceModule.SYSTEM.APP.RELAUNCH, 'system', '用户点击确认按钮重启程序');
                        app.relaunch();
                        app.exit(0);
                    }
                }
            ],
            defaultId: 0,
            cancelId: 0
        },
        'account-logged-in-elsewhere'
    );
    return false;
  }

  apiRequest.getTimeNow().then(time => {
    if(Math.abs(time - Date.now()) > 1 * 60 * 1000){
      mainWindow && DialogHelper.showNonModalDialog(
        mainWindow,
        {
            title: '本地时间异常',
            message: '您的电脑时间和服务器不一致',
            detail: '请检查您的电脑时间，然后重试。',
            type: DialogType.WARNING,
            buttons: [
                {
                    text: '确认',
                    id: 0,
                    isDefault: true,
                    action: () => {
                        Logger.info(XuanceModule.SYSTEM.APP.RELAUNCH, 'system', '用户点击确认按钮重启程序');
                        app.relaunch();
                        app.exit(0);
                    }
                }
            ],
            defaultId: 0,
            cancelId: 0
        },
        'account-logged-in-elsewhere'
    );
    }
  })
  // const send = await apiRequest.sendNotice(['211513'], '收到通知了吧')
  // console.log(time);

  return true;
}

