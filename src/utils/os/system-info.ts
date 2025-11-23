import { networkInterfaces } from "os";
import { ISystemInfo } from './types';

/**
 * 系统信息管理类
 * 负责获取操作系统版本、MAC地址、设备唯一ID等系统信息
 */
export class SystemInfo implements ISystemInfo {
  private static instance: SystemInfo;
  private cachedMacAddress: string | null = null;
  private cachedDeviceId: string | null = null;

  private constructor() {}

  public static getInstance(): SystemInfo {
    if (!SystemInfo.instance) {
      SystemInfo.instance = new SystemInfo();
    }
    return SystemInfo.instance;
  }

  /**
   * 获取操作系统版本信息
   * @returns 格式化的操作系统版本字符串
   */
  public getOsVersion(): string {
    const platform = process.platform;
    const release = require('os').release();

    switch (platform) {
      case 'win32':
        return `windows${release.split('.')[0]}`;
      case 'darwin':
        return `macos${release}`;
      case 'linux':
        return `linux${release}`;
      default:
        return 'windows10'; // 默认fallback值
    }
  }

  /**
   * 获取MAC地址
   * @returns MAC地址字符串（去除冒号）
   */
  public getMacAddress(): string {
    // 如果已有缓存且不是默认值，直接返回
    if (this.cachedMacAddress && this.cachedMacAddress !== 'unknownmac') {
      return this.cachedMacAddress;
    }

    const nets = networkInterfaces();
    let macAddress = '';
    
    // 第一轮：查找首选接口类型（非内部IPv4接口）
    for (const name of Object.keys(nets)) {
      const interfaces = nets[name];
      if (!interfaces) continue;
      
      for (const net of interfaces) {
        if (!net.internal && net.family === 'IPv4' && net.mac && net.mac !== '00:00:00:00:00:00') {
          macAddress = net.mac.replace(/:/g, '');
          break;
        }
      }
      
      if (macAddress) break;
    }
    
    // 第二轮：如果没找到，则考虑所有非内部接口
    if (!macAddress) {
      for (const name of Object.keys(nets)) {
        const interfaces = nets[name];
        if (!interfaces) continue;
        
        for (const net of interfaces) {
          if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
            macAddress = net.mac.replace(/:/g, '');
            break;
          }
        }
        
        if (macAddress) break;
      }
    }
    
    // 第三轮：如果还没找到，考虑所有具有有效MAC地址的接口（包括内部接口）
    if (!macAddress) {
      for (const name of Object.keys(nets)) {
        const interfaces = nets[name];
        if (!interfaces) continue;
        
        for (const net of interfaces) {
          if (net.mac && net.mac !== '00:00:00:00:00:00') {
            macAddress = net.mac.replace(/:/g, '');
            break;
          }
        }
        
        if (macAddress) break;
      }
    }
    
    // 将结果保存到缓存中（即使是默认值）
    this.cachedMacAddress = macAddress || 'unknownmac';
    
    return this.cachedMacAddress;
  }

  /**
   * 获取设备的唯一标识符
   * 在Windows系统上，尝试使用多种方法来获取稳定的设备唯一ID
   * @returns 设备唯一标识字符串
   */
  public getDeviceUniqueId(): string {
    // 如果已有缓存，直接返回
    if (this.cachedDeviceId) {
      return this.cachedDeviceId;
    }

    // 只在Windows系统上执行
    if (process.platform !== 'win32') {
      this.cachedDeviceId = this.getMacAddress(); // 非Windows系统使用MAC地址
      return this.cachedDeviceId;
    }

    try {
      // 导入子进程模块
      const { execSync } = require('child_process');
      
      // 方法1：获取计算机GUID（相对稳定）
      try {
        const result = execSync(
          'wmic csproduct get UUID',
          { encoding: 'utf-8', windowsHide: true }
        );
        const match = result.match(/[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}/i);
        if (match && match[0]) {
          this.cachedDeviceId = match[0].replace(/-/g, '');
          return this.cachedDeviceId;
        }
      } catch (e) {
        // 忽略错误，尝试下一种方法
      }
      
      // 方法2：获取主板序列号
      try {
        const result = execSync(
          'wmic baseboard get serialnumber',
          { encoding: 'utf-8', windowsHide: true }
        );
        const match = result.match(/\S+/g);
        if (match && match[1] && match[1] !== 'SerialNumber') {
          this.cachedDeviceId = match[1];
          return this.cachedDeviceId;
        }
      } catch (e) {
        // 忽略错误，尝试下一种方法
      }

      // 方法3：获取BIOS序列号
      try {
        const result = execSync(
          'wmic bios get serialnumber',
          { encoding: 'utf-8', windowsHide: true }
        );
        const match = result.match(/\S+/g);
        if (match && match[1] && match[1] !== 'SerialNumber') {
          this.cachedDeviceId = match[1];
          return this.cachedDeviceId;
        }
      } catch (e) {
        // 忽略错误，尝试下一种方法
      }
      
      // 方法4：获取硬盘序列号
      try {
        const result = execSync(
          'wmic diskdrive get serialnumber',
          { encoding: 'utf-8', windowsHide: true }
        );
        const lines = result.split('\n').filter(line => line.trim());
        if (lines.length >= 2) {
          this.cachedDeviceId = lines[1].trim();
          return this.cachedDeviceId;
        }
      } catch (e) {
        // 忽略错误，使用备选方法
      }
      
    } catch (error) {
      // 如果所有方法都失败，回退到使用MAC地址
      console.error('获取设备ID失败，回退到MAC地址', error);
    }
    
    // 最后的备选方案：使用MAC地址
    this.cachedDeviceId = this.getMacAddress();
    return this.cachedDeviceId;
  }

  /**
   * 清除缓存的系统信息
   */
  public clearCache(): void {
    this.cachedMacAddress = null;
    this.cachedDeviceId = null;
  }

  /**
   * 获取系统信息概要
   * @returns 包含所有系统信息的对象
   */
  public getSystemSummary() {
    return {
      osVersion: this.getOsVersion(),
      macAddress: this.getMacAddress(),
      deviceId: this.getDeviceUniqueId(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    };
  }
}

// 导出单例实例
export const systemInfo = SystemInfo.getInstance(); 