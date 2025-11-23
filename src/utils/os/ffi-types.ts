import * as koffi from 'koffi';

// 单例模式管理 FFI 类型定义，避免重复定义
class FFITypes {
  private static instance: FFITypes;
  private _POINT: any = null;
  private _initialized = false;

  private constructor() {}

  public static getInstance(): FFITypes {
    if (!FFITypes.instance) {
      FFITypes.instance = new FFITypes();
    }
    return FFITypes.instance;
  }

  /**
   * 初始化 FFI 类型定义
   */
  public init(): void {
    if (this._initialized) {
      return;
    }

    try {
      // 定义 POINT 结构体 - 只定义一次
      this._POINT = koffi.struct('POINT', {
        x: 'long',
        y: 'long'
      });

      this._initialized = true;
    } catch (error) {
      console.warn('FFI 类型初始化失败:', error);
      throw error;
    }
  }

  /**
   * 获取 POINT 结构体类型
   */
  public get POINT() {
    if (!this._initialized) {
      this.init();
    }
    return this._POINT;
  }

  /**
   * 检查是否已初始化
   */
  public get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 重置类型定义（用于测试或重新初始化）
   */
  public reset(): void {
    this._POINT = null;
    this._initialized = false;
  }
}

// 导出单例实例
export const ffiTypes = FFITypes.getInstance();

// 便捷导出
export const initFFITypes = () => ffiTypes.init();
export const getPointType = () => ffiTypes.POINT; 