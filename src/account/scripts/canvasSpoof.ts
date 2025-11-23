/**
 * Canvas 指纹伪装模块
 * 用于修改 Canvas 绘图结果，生成不同的 Canvas 指纹
 */

/**
 * 生成随机的 Canvas 指纹配置
 */
export const generateCanvasSpoofConfig = (): CanvasSpoofConfig => {
  return {
    // 随机的文本渲染偏移
    textOffset: {
      x: Math.random() * 0.2 - 0.1, // -0.1 到 0.1 之间的随机值
      y: Math.random() * 0.2 - 0.1
    },
    // 随机的颜色偏差
    colorDeviation: {
      r: Math.floor(Math.random() * 3) - 1, // -1 到 1 之间的随机值
      g: Math.floor(Math.random() * 3) - 1,
      b: Math.floor(Math.random() * 3) - 1,
      a: Math.random() * 0.02 - 0.01
    },
    // 随机的阴影效果
    shadowEffect: {
      enabled: Math.random() > 0.5,
      blur: Math.random() * 0.5,
      offsetX: Math.random() * 0.3 - 0.15,
      offsetY: Math.random() * 0.3 - 0.15
    },
    // 随机的路径变换
    pathTransform: {
      scale: 1 + (Math.random() * 0.02 - 0.01), // 0.99 到 1.01 之间的随机值
      rotation: Math.random() * 0.02 - 0.01
    }
  };
};

/**
 * Canvas 指纹伪装配置接口
 */
export interface CanvasSpoofConfig {
  textOffset: {
    x: number;
    y: number;
  };
  colorDeviation: {
    r: number;
    g: number;
    b: number;
    a: number;
  };
  shadowEffect: {
    enabled: boolean;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  pathTransform: {
    scale: number;
    rotation: number;
  };
}

/**
 * 生成 Canvas 指纹伪装的 JavaScript 代码
 * @param config 伪装配置，如果不提供则生成随机配置
 * @returns JavaScript 代码字符串，可注入到页面中
 */
export const generateCanvasSpoofScript = (config?: CanvasSpoofConfig): string => {
  const spoofConfig = config || generateCanvasSpoofConfig();
  
  return `
    (function() {
      // 保存原始的 Canvas 方法
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      const originalFillText = CanvasRenderingContext2D.prototype.fillText;
      const originalStrokeText = CanvasRenderingContext2D.prototype.strokeText;
      const originalFillRect = CanvasRenderingContext2D.prototype.fillRect;
      const originalStrokeRect = CanvasRenderingContext2D.prototype.strokeRect;
      const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
      const originalBeginPath = CanvasRenderingContext2D.prototype.beginPath;
      const originalFill = CanvasRenderingContext2D.prototype.fill;
      const originalStroke = CanvasRenderingContext2D.prototype.stroke;

      // 伪装配置
      const spoofConfig = ${JSON.stringify(spoofConfig)};

      // 修改颜色值
      function applyColorDeviation(color) {
        if (typeof color === 'string') {
          // 如果是颜色字符串，尝试解析并修改
          if (color.startsWith('#')) {
            // 处理十六进制颜色
            let r = parseInt(color.slice(1, 3), 16);
            let g = parseInt(color.slice(3, 5), 16);
            let b = parseInt(color.slice(5, 7), 16);
            let a = 255;
            
            if (color.length === 9) {
              a = parseInt(color.slice(7, 9), 16);
            }
            
            r = Math.max(0, Math.min(255, r + spoofConfig.colorDeviation.r));
            g = Math.max(0, Math.min(255, g + spoofConfig.colorDeviation.g));
            b = Math.max(0, Math.min(255, b + spoofConfig.colorDeviation.b));
            a = Math.max(0, Math.min(255, a + spoofConfig.colorDeviation.a * 255));
            
            return '#' + 
              r.toString(16).padStart(2, '0') +
              g.toString(16).padStart(2, '0') +
              b.toString(16).padStart(2, '0') +
              (color.length === 9 ? a.toString(16).padStart(2, '0') : '');
          }
          // 其他颜色格式暂不处理，返回原值
          return color;
        }
        return color;
      }

      // 修改 fillStyle 和 strokeStyle 属性的 setter
      const contextProto = CanvasRenderingContext2D.prototype;
      let originalFillStyle = contextProto.fillStyle;
      let originalStrokeStyle = contextProto.strokeStyle;

      Object.defineProperty(contextProto, 'fillStyle', {
        get: function() {
          return originalFillStyle;
        },
        set: function(value) {
          originalFillStyle = applyColorDeviation(value);
        }
      });

      Object.defineProperty(contextProto, 'strokeStyle', {
        get: function() {
          return originalStrokeStyle;
        },
        set: function(value) {
          originalStrokeStyle = applyColorDeviation(value);
        }
      });

      // 重写文本绘制方法，添加微小偏移
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
        // 应用文本偏移
        const offsetX = spoofConfig.textOffset.x;
        const offsetY = spoofConfig.textOffset.y;
        
        // 如果启用了阴影效果，应用随机阴影
        if (spoofConfig.shadowEffect.enabled) {
          const originalShadowBlur = this.shadowBlur;
          const originalShadowOffsetX = this.shadowOffsetX;
          const originalShadowOffsetY = this.shadowOffsetY;
          const originalShadowColor = this.shadowColor;
          
          this.shadowBlur = spoofConfig.shadowEffect.blur;
          this.shadowOffsetX = spoofConfig.shadowEffect.offsetX;
          this.shadowOffsetY = spoofConfig.shadowEffect.offsetY;
          this.shadowColor = 'rgba(0, 0, 0, 0.01)';
          
          originalFillText.call(this, text, x + offsetX, y + offsetY, maxWidth);
          
          // 恢复原始阴影设置
          this.shadowBlur = originalShadowBlur;
          this.shadowOffsetX = originalShadowOffsetX;
          this.shadowOffsetY = originalShadowOffsetY;
          this.shadowColor = originalShadowColor;
        } else {
          originalFillText.call(this, text, x + offsetX, y + offsetY, maxWidth);
        }
      };

      CanvasRenderingContext2D.prototype.strokeText = function(text, x, y, maxWidth) {
        const offsetX = spoofConfig.textOffset.x;
        const offsetY = spoofConfig.textOffset.y;
        originalStrokeText.call(this, text, x + offsetX, y + offsetY, maxWidth);
      };

      // 重写矩形绘制方法
      CanvasRenderingContext2D.prototype.fillRect = function(x, y, width, height) {
        // 应用微小的缩放变换
        const scale = spoofConfig.pathTransform.scale;
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        const offsetX = (width - scaledWidth) / 2;
        const offsetY = (height - scaledHeight) / 2;
        
        originalFillRect.call(this, x + offsetX, y + offsetY, scaledWidth, scaledHeight);
      };

      CanvasRenderingContext2D.prototype.strokeRect = function(x, y, width, height) {
        const scale = spoofConfig.pathTransform.scale;
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        const offsetX = (width - scaledWidth) / 2;
        const offsetY = (height - scaledHeight) / 2;
        
        originalStrokeRect.call(this, x + offsetX, y + offsetY, scaledWidth, scaledHeight);
      };

      // 重写 drawImage 方法，添加微小变换
      CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
        // 简单实现，仅在绘制时添加微小的缩放
        if (args.length >= 5) {
          const x = args[1];
          const y = args[2];
          let width = args[3];
          let height = args[4];
          
          const scale = spoofConfig.pathTransform.scale;
          const scaledWidth = width * scale;
          const scaledHeight = height * scale;
          const offsetX = (width - scaledWidth) / 2;
          const offsetY = (height - scaledHeight) / 2;
          
          args[3] = scaledWidth;
          args[4] = scaledHeight;
          args[1] = x + offsetX;
          args[2] = y + offsetY;
        }
        
        originalDrawImage.apply(this, [image, ...args]);
      };

      // 在 toDataURL 中添加随机噪声
      HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        // 获取原始的 dataURL
        const originalDataUrl = originalToDataURL.call(this, type, quality);
        
        // 创建一个新的 canvas 来处理数据
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');
        if (!tempContext) return originalDataUrl;
        
        tempCanvas.width = this.width;
        tempCanvas.height = this.height;
        
        // 创建图像对象
        const img = new Image();
        img.src = originalDataUrl;
        
        // 由于是同步执行，这里直接修改返回值，不等待图像加载
        // 在实际使用中，指纹检测通常会立即使用 toDataURL 的结果
        // 所以我们通过修改原始 canvas 的像素来达到目的
        
        try {
          const imageData = originalGetImageData.call(tempContext, 0, 0, tempCanvas.width, tempCanvas.height);
          const data = imageData.data;
          
          // 在图像数据中添加微小的随机噪声
          for (let i = 0; i < data.length; i += 4) {
            // 只为一小部分像素添加噪声，避免过度修改
            if (Math.random() < 0.01) {
              data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() * 2 - 1)));
              data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + (Math.random() * 2 - 1)));
              data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + (Math.random() * 2 - 1)));
              // 不修改 alpha 通道
            }
          }
          
          tempContext.putImageData(imageData, 0, 0);
          return tempCanvas.toDataURL(type, quality);
        } catch (e) {
          // 如果出现安全错误等问题，返回原始值
          return originalDataUrl;
        }
      };

      // 重写 getImageData 方法，添加噪声
      CanvasRenderingContext2D.prototype.getImageData = function(sx, sy, sw, sh) {
        const imageData = originalGetImageData.call(this, sx, sy, sw, sh);
        const data = imageData.data;
        
        // 在图像数据中添加微小的随机噪声
        for (let i = 0; i < data.length; i += 4) {
          if (Math.random() < 0.005) { // 更小的概率，避免性能问题
            data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() * 2 - 1)));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + (Math.random() * 2 - 1)));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + (Math.random() * 2 - 1)));
          }
        }
        
        return imageData;
      };

      // 记录 Canvas 指纹伪装已加载
      window._canvasFingerprintSpoofed = true;
      console.log('Canvas 指纹伪装已应用');
    })();
  `;
};

/**
 * 获取 Canvas 指纹伪装脚本，用于注入到页面
 * @param accountId 账户 ID，用于生成特定于账户的指纹
 * @returns JavaScript 代码字符串
 */
export const getCanvasSpoofScript = (accountId?: string): string => {
  // 如果提供了账户 ID，可以基于账户 ID 生成一致的指纹
  if (accountId) {
    // 使用账户 ID 生成一个种子值
    let seed = 0;
    for (let i = 0; i < accountId.length; i++) {
      seed += accountId.charCodeAt(i) * (i + 1);
    }
    
    // 使用种子生成确定性的随机配置
    const pseudoRandom = (min: number, max: number) => {
      seed = (seed * 9301 + 49297) % 233280;
      return min + (seed / 233280) * (max - min);
    };
    
    const config: CanvasSpoofConfig = {
      textOffset: {
        x: pseudoRandom(-0.1, 0.1),
        y: pseudoRandom(-0.1, 0.1)
      },
      colorDeviation: {
        r: Math.floor(pseudoRandom(-1, 1)),
        g: Math.floor(pseudoRandom(-1, 1)),
        b: Math.floor(pseudoRandom(-1, 1)),
        a: pseudoRandom(-0.01, 0.01)
      },
      shadowEffect: {
        enabled: pseudoRandom(0, 1) > 0.5,
        blur: pseudoRandom(0, 0.5),
        offsetX: pseudoRandom(-0.15, 0.15),
        offsetY: pseudoRandom(-0.15, 0.15)
      },
      pathTransform: {
        scale: 1 + pseudoRandom(-0.01, 0.01),
        rotation: pseudoRandom(-0.01, 0.01)
      }
    };
    
    return generateCanvasSpoofScript(config);
  }
  
  // 否则生成随机配置
  return generateCanvasSpoofScript();
};
