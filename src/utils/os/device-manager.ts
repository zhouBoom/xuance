import md5 from 'md5';
import { IDeviceManager } from './types';
import { systemInfo } from './system-info';

/**
 * 设备管理类
 * 负责设备ID的生成、管理和映射
 */
export class DeviceManager implements IDeviceManager {
  private static instance: DeviceManager;
  private deviceMap = new Map<string, {red_uid: string, red_id: string, index: number}>();

  private constructor() {}

  public static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  /**
   * 生成WebSocket设备ID
   * @param red_uid 用户红包UID
   * @param red_id 红包ID
   * @param index 索引编号，默认为1
   * @returns 生成的设备ID
   */
  public getWSDeviceID(red_uid: string, red_id: string, index: number = 1): string {
    const deviceUniqueId = systemInfo.getDeviceUniqueId();
    const id = 'XC' + md5(red_uid + '_' + red_id + '_' + deviceUniqueId)
      .toUpperCase()
      .slice(0, 13) + (index + '').padStart(2, '0');
    
    this.deviceMap.set(id, {
      red_uid,
      red_id,
      index
    });
    
    return id;
  }

  /**
   * 根据设备ID获取红包ID
   * @param deviceID 设备ID
   * @returns 红包ID或undefined
   */
  public getRedIdByWSDeviceID(deviceID: string): string | undefined {
    return this.deviceMap.get(deviceID)?.red_id;
  }

  /**
   * 根据设备ID获取用户红包UID
   * @param deviceID 设备ID
   * @returns 用户红包UID或undefined
   */
  public getRedUidByWSDeviceID(deviceID: string): string | undefined {
    return this.deviceMap.get(deviceID)?.red_uid;
  }

  /**
   * 根据设备ID获取索引
   * @param deviceID 设备ID
   * @returns 索引或undefined
   */
  public getIndexByWSDeviceID(deviceID: string): number | undefined {
    return this.deviceMap.get(deviceID)?.index;
  }

  /**
   * 获取设备映射信息
   * @param deviceID 设备ID
   * @returns 完整的设备映射信息或undefined
   */
  public getDeviceInfo(deviceID: string) {
    return this.deviceMap.get(deviceID);
  }

  /**
   * 获取所有设备映射
   * @returns 设备映射的Map对象
   */
  public getAllDevices() {
    return new Map(this.deviceMap);
  }

  /**
   * 清除设备映射
   * @param deviceID 设备ID，如果不指定则清除所有
   */
  public clearDevice(deviceID?: string): void {
    if (deviceID) {
      this.deviceMap.delete(deviceID);
    } else {
      this.deviceMap.clear();
    }
  }

  /**
   * 检查设备ID是否存在
   * @param deviceID 设备ID
   * @returns 是否存在
   */
  public hasDevice(deviceID: string): boolean {
    return this.deviceMap.has(deviceID);
  }

  /**
   * 获取设备数量
   * @returns 当前管理的设备数量
   */
  public getDeviceCount(): number {
    return this.deviceMap.size;
  }

  /**
   * 验证设备ID格式
   * @param deviceID 设备ID
   * @returns 是否为有效格式
   */
  public validateDeviceID(deviceID: string): boolean {
    // XC + 13位MD5大写字符 + 2位数字索引
    const pattern = /^XC[A-F0-9]{13}\d{2}$/;
    return pattern.test(deviceID);
  }

  /**
   * 重新生成设备ID（基于新的设备唯一ID）
   * @param red_uid 用户红包UID
   * @param red_id 红包ID
   * @param index 索引编号
   * @returns 重新生成的设备ID
   */
  public regenerateWSDeviceID(red_uid: string, red_id: string, index: number = 1): string {
    // 清除旧的缓存
    systemInfo.clearCache();
    
    // 重新生成
    return this.getWSDeviceID(red_uid, red_id, index);
  }
}

// 导出单例实例
export const deviceManager = DeviceManager.getInstance(); 