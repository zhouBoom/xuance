import { IAntivirusManager, AntivirusStatus } from './types';
import { app } from 'electron';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 杀毒软件管理类
 * 负责检测杀毒软件、设置白名单等功能
 */
export class AntivirusManager implements IAntivirusManager {
  private static instance: AntivirusManager;
  private antivirusStatus: AntivirusStatus | null = null;
  private lastCheckTime = 0;
  private readonly cacheTimeout = 30000; // 30秒缓存

  // 已知的杀毒软件列表
  private readonly knownAntivirus = [
    'Windows Defender',
    '360安全卫士',
    '腾讯电脑管家',
    '金山毒霸',
    'Norton',
    'McAfee',
    'Kaspersky',
    'Avast',
    'AVG',
    'Bitdefender',
    'ESET',
    'Trend Micro',
    'Symantec',
    'Avira',
    'Malwarebytes'
  ];

  private constructor() {}

  public static getInstance(): AntivirusManager {
    if (!AntivirusManager.instance) {
      AntivirusManager.instance = new AntivirusManager();
    }
    return AntivirusManager.instance;
  }

  /**
   * 设置杀毒软件白名单
   */
  public async setupAntivirusWhitelist(): Promise<boolean> {
    try {
      console.log('开始设置杀毒软件白名单...');

      // 检查杀毒软件状态
      const status = await this.getAntivirusStatus();
      if (!status.isAvailable) {
        console.log('未检测到杀毒软件或无法管理');
        return true; // 没有杀毒软件也算成功
      }

      // 获取应用程序路径
      const appPath = app.getPath('exe');
      const appDir = path.dirname(appPath);
      
      console.log(`应用路径: ${appPath}`);
      console.log(`应用目录: ${appDir}`);

      // 尝试设置Windows Defender白名单
      const defenderResult = await this.setupWindowsDefenderWhitelist(appPath, appDir);
      
      // 尝试设置其他杀毒软件白名单（基于检测到的杀毒软件）
      const otherAntivirusResult = await this.setupOtherAntivirusWhitelist(appPath, appDir);

      const success = defenderResult || otherAntivirusResult;
      
      if (success) {
        console.log('杀毒软件白名单设置完成');
      } else {
        console.warn('杀毒软件白名单设置可能未成功，请手动添加');
      }

      return success;

    } catch (error) {
      console.error('设置杀毒软件白名单失败:', error);
      return false;
    }
  }

  /**
   * 应用启动时自动设置白名单
   */
  public async autoSetupWhitelistOnStartup(): Promise<void> {
    try {
      console.log('应用启动时自动设置杀毒软件白名单...');
      
      // 延迟执行，确保应用完全启动
      setTimeout(async () => {
        const success = await this.setupAntivirusWhitelist();
        if (success) {
          console.log('启动时杀毒软件白名单设置成功');
        } else {
          console.warn('启动时杀毒软件白名单设置失败，建议用户手动添加');
        }
      }, 5000); // 延迟5秒执行

    } catch (error) {
      console.error('自动设置杀毒软件白名单失败:', error);
    }
  }

  /**
   * 获取杀毒软件状态
   */
  public async getAntivirusStatus(): Promise<AntivirusStatus> {
    // 使用缓存避免频繁检测
    const now = Date.now();
    if (this.antivirusStatus && (now - this.lastCheckTime) < this.cacheTimeout) {
      return this.antivirusStatus;
    }

    try {
      this.antivirusStatus = await this.detectAntivirusStatus();
      this.lastCheckTime = now;
      return this.antivirusStatus;
    } catch (error) {
      console.error('检测杀毒软件状态失败:', error);
      this.antivirusStatus = {
        isAvailable: false,
        isEnterpriseManaged: false,
        reason: `检测失败: ${error}`
      };
      return this.antivirusStatus;
    }
  }

  /**
   * 检测杀毒软件状态
   */
  private async detectAntivirusStatus(): Promise<AntivirusStatus> {
    if (process.platform !== 'win32') {
      return {
        isAvailable: false,
        isEnterpriseManaged: false,
        reason: '非Windows系统'
      };
    }

    try {
      // 检测Windows Defender
      const defenderStatus = await this.checkWindowsDefender();
      
      // 检测其他杀毒软件
      const otherAntivirus = await this.checkOtherAntivirus();
      
      // 检测企业管理状态
      const isEnterpriseManaged = await this.checkEnterpriseManagement();

      return {
        isAvailable: defenderStatus.isActive || otherAntivirus.length > 0,
        isEnterpriseManaged,
        reason: this.buildStatusReason(defenderStatus, otherAntivirus, isEnterpriseManaged)
      };

    } catch (error) {
      throw new Error(`杀毒软件检测失败: ${error}`);
    }
  }

  /**
   * 检测Windows Defender状态
   */
  private async checkWindowsDefender(): Promise<{ isInstalled: boolean; isActive: boolean; version?: string }> {
    try {
      // 检查Windows Defender是否安装和激活
      const result = execSync(
        'powershell "Get-MpComputerStatus | Select-Object AntivirusEnabled, AMServiceEnabled, RealTimeProtectionEnabled"',
        { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
      );

      const isActive = result.includes('True');
      
      return {
        isInstalled: true,
        isActive,
        version: await this.getWindowsDefenderVersion()
      };

    } catch (error) {
      console.warn('检测Windows Defender失败:', error);
      return { isInstalled: false, isActive: false };
    }
  }

  /**
   * 获取Windows Defender版本
   */
  private async getWindowsDefenderVersion(): Promise<string | undefined> {
    try {
      const result = execSync(
        'powershell "Get-MpComputerStatus | Select-Object AMProductVersion"',
        { encoding: 'utf-8', windowsHide: true, timeout: 5000 }
      );
      
      const match = result.match(/(\d+\.\d+\.\d+\.\d+)/);
      return match ? match[1] : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 检测其他杀毒软件
   */
  private async checkOtherAntivirus(): Promise<string[]> {
    const detected: string[] = [];

    try {
      // 使用WMI查询安装的安全产品
      const wmiResult = execSync(
        'wmic /namespace:\\\\root\\SecurityCenter2 path AntiVirusProduct get displayName',
        { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
      );

      for (const antivirus of this.knownAntivirus) {
        if (wmiResult.toLowerCase().includes(antivirus.toLowerCase())) {
          detected.push(antivirus);
        }
      }

    } catch (error) {
      console.warn('通过WMI检测杀毒软件失败:', error);
    }

    return detected;
  }

  /**
   * 检测企业管理状态
   */
  private async checkEnterpriseManagement(): Promise<boolean> {
    try {
      // 检查组策略设置
      const result = execSync(
        'reg query "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender" /v DisableAntiSpyware',
        { encoding: 'utf-8', windowsHide: true, timeout: 5000 }
      );
      
      return result.includes('0x1'); // 如果禁用了反间谍软件，可能是企业管理
    } catch {
      // 注册表项不存在或无法访问，假设非企业管理
      return false;
    }
  }

  /**
   * 设置Windows Defender白名单
   */
  private async setupWindowsDefenderWhitelist(appPath: string, appDir: string): Promise<boolean> {
    try {
      console.log('设置Windows Defender白名单...');

      // 添加进程排除
      const addProcessExclusion = `Add-MpPreference -ExclusionProcess "${appPath}"`;
      
      // 添加路径排除
      const addPathExclusion = `Add-MpPreference -ExclusionPath "${appDir}"`;

      // 执行PowerShell命令
      execSync(
        `powershell -Command "& {${addProcessExclusion}; ${addPathExclusion}}"`,
        { windowsHide: true, timeout: 15000 }
      );

      console.log('Windows Defender白名单设置成功');
      return true;

    } catch (error) {
      console.warn('Windows Defender白名单设置失败，可能需要管理员权限:', error);
      return false;
    }
  }

  /**
   * 设置其他杀毒软件白名单
   */
  private async setupOtherAntivirusWhitelist(appPath: string, appDir: string): Promise<boolean> {
    // 这里可以根据检测到的杀毒软件类型执行相应的白名单设置
    // 由于不同杀毒软件的API差异很大，这里只提供示例框架
    
    console.log('尝试设置其他杀毒软件白名单...');
    
    // 示例：为特定杀毒软件设置白名单
    // 实际实现需要根据具体的杀毒软件API来调整
    
    return false; // 暂时返回false，表示未实现
  }

  /**
   * 构建状态描述
   */
  private buildStatusReason(
    defenderStatus: { isInstalled: boolean; isActive: boolean; version?: string },
    otherAntivirus: string[],
    isEnterpriseManaged: boolean
  ): string {
    const reasons: string[] = [];

    if (defenderStatus.isInstalled) {
      reasons.push(`Windows Defender ${defenderStatus.isActive ? '已激活' : '未激活'}`);
      if (defenderStatus.version) {
        reasons.push(`版本: ${defenderStatus.version}`);
      }
    }

    if (otherAntivirus.length > 0) {
      reasons.push(`检测到其他杀毒软件: ${otherAntivirus.join(', ')}`);
    }

    if (isEnterpriseManaged) {
      reasons.push('检测到企业管理策略');
    }

    return reasons.join('; ') || '无特殊状态';
  }

  /**
   * 清理缓存
   */
  public clearCache(): void {
    this.antivirusStatus = null;
    this.lastCheckTime = 0;
  }

  /**
   * 生成白名单设置指南
   */
  public generateWhitelistGuide(): string {
    const appPath = app.getPath('exe');
    const appName = app.getName();
    
    return `
杀毒软件白名单设置指南：

应用程序信息：
- 应用名称: ${appName}
- 应用路径: ${appPath}
- 应用目录: ${path.dirname(appPath)}

Windows Defender 设置方法：
1. 打开"Windows 安全中心"
2. 点击"病毒和威胁防护"
3. 点击"病毒和威胁防护设置"下的"管理设置"
4. 在"排除项"部分点击"添加或删除排除项"
5. 添加以下排除项：
   - 进程：${appPath}
   - 文件夹：${path.dirname(appPath)}

其他杀毒软件：
请参考各杀毒软件的白名单/信任区域设置方法，
将上述路径添加到白名单中。

注意：设置白名单可能需要管理员权限。
`;
  }
}

// 导出单例实例
export const antivirusManager = AntivirusManager.getInstance(); 