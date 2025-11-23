/**
 * WebGL 指纹伪装模块
 * 用于修改 WebGL 渲染特征和参数，生成不同的 WebGL 指纹
 */

/**
 * 生成随机的 WebGL 指纹配置
 */
export const generateWebglSpoofConfig = (): WebglSpoofConfig => {
  return {
    // 模拟的 GPU 信息
    vendor: generateRandomVendor(),
    renderer: generateRandomRenderer(),
    // 模拟的扩展列表
    extensions: generateRandomExtensions(),
    // WebGL 参数修改
    parameterOverrides: generateRandomParameterOverrides(),
    // 着色器程序修改
    shaderModifications: {
      enabled: Math.random() > 0.3,
      precisionModifiers: {
        highp: Math.random() > 0.5 ? 'highp' : 'mediump',
        mediump: Math.random() > 0.5 ? 'mediump' : 'lowp'
      },
      addNoise: Math.random() > 0.7
    },
    // 渲染结果修改
    renderingModifications: {
      precision: Math.random() * 0.001,
      colorNoise: Math.random() * 0.002,
      patternShift: Math.random() > 0.6
    }
  };
};

/**
 * 生成随机的 GPU 厂商名称
 */
function generateRandomVendor(): string {
  const vendors = [
    'Google Inc.',
    'Intel Inc.',
    'NVIDIA Corporation',
    'ATI Technologies Inc.',
    'Microsoft Corporation',
    'Apple Inc.',
    'Advanced Micro Devices, Inc.',
    'ARM Ltd.',
    'Imagination Technologies'
  ];
  return vendors[Math.floor(Math.random() * vendors.length)] + 
         (Math.random() > 0.8 ? ' ' + (1000 + Math.floor(Math.random() * 9000)) : '');
}

/**
 * 生成随机的渲染器名称
 */
function generateRandomRenderer(): string {
  const renderers = [
    'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'AMD Radeon Pro 555 OpenGL Engine',
    'Intel(R) Iris(TM) Plus Graphics OpenGL Engine',
    'WebKit WebGL',
    'Mozilla',
    'Google SwiftShader',
    'NVIDIA GeForce RTX 3070/PCIe/SSE2',
    'Apple M1',
    'ARM Mali-G78',
    'Adreno (TM) 650'
  ];
  return renderers[Math.floor(Math.random() * renderers.length)] + 
         (Math.random() > 0.7 ? ' ' + (Math.floor(Math.random() * 10)) : '');
}

/**
 * 生成随机的扩展列表
 */
function generateRandomExtensions(): string[] {
  const allExtensions = [
    'ANGLE_instanced_arrays',
    'EXT_blend_minmax',
    'EXT_color_buffer_half_float',
    'EXT_float_blend',
    'EXT_frag_depth',
    'EXT_shader_texture_lod',
    'EXT_texture_compression_bptc',
    'EXT_texture_compression_rgtc',
    'EXT_texture_filter_anisotropic',
    'WEBKIT_EXT_texture_filter_anisotropic',
    'OES_element_index_uint',
    'OES_fbo_render_mipmap',
    'OES_standard_derivatives',
    'OES_texture_float',
    'OES_texture_float_linear',
    'OES_texture_half_float',
    'OES_texture_half_float_linear',
    'OES_vertex_array_object',
    'WEBGL_color_buffer_float',
    'WEBGL_compressed_texture_astc',
    'WEBGL_compressed_texture_etc',
    'WEBGL_compressed_texture_etc1',
    'WEBGL_compressed_texture_pvrtc',
    'WEBGL_compressed_texture_s3tc',
    'WEBGL_compressed_texture_s3tc_srgb',
    'WEBGL_debug_renderer_info',
    'WEBGL_debug_shaders',
    'WEBGL_depth_texture',
    'WEBGL_draw_buffers',
    'WEBGL_lose_context',
    'WEBKIT_WEBGL_lose_context',
    'WEBKIT_WEBGL_compressed_texture_s3tc'
  ];
  
  // 随机选择 80% 到 95% 的扩展
  const numExtensions = Math.floor(allExtensions.length * (0.8 + Math.random() * 0.15));
  const selectedExtensions = [...allExtensions].sort(() => 0.5 - Math.random()).slice(0, numExtensions);
  
  // 可能添加一个自定义扩展
  if (Math.random() > 0.8) {
    selectedExtensions.push(`WEBGL_custom_extension_${Math.floor(Math.random() * 10000)}`);
  }
  
  return selectedExtensions;
}

/**
 * 生成随机的参数覆盖
 */
function generateRandomParameterOverrides(): Record<number, any> {
  const overrides: Record<number, any> = {};
  
  // WebGL 参数值
  const parameterKeys = [
    0x0D55, // WEBGL_debug_renderer_info.UNMASKED_VENDOR_WEBGL
    0x0D56, // WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL
    0x0C50, // gl.ALIASED_POINT_SIZE_RANGE
    0x0C52, // gl.ALIASED_LINE_WIDTH_RANGE
    0x0D33, // gl.MAX_TEXTURE_SIZE
    0x0D35, // gl.MAX_VIEWPORT_DIMS
    0x8B4B, // gl.MAX_TEXTURE_IMAGE_UNITS
    0x8DF2, // gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS
    0x8B4D, // gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS
    0x8DFD, // gl.MAX_RENDERBUFFER_SIZE
    0x8DC7, // gl.MAX_FRAGMENT_UNIFORM_VECTORS
    0x8DFB, // gl.MAX_VERTEX_UNIFORM_VECTORS
    0x8DD9, // gl.MAX_VARYING_VECTORS
    0x8B4A  // gl.MAX_VERTEX_ATTRIBS
  ];
  
  // 随机选择一些参数进行修改
  parameterKeys.forEach(key => {
    if (Math.random() > 0.5) {
      switch (key) {
        case 0x0C50: // ALIASED_POINT_SIZE_RANGE
          overrides[key] = [1, 1024 + Math.floor(Math.random() * 1024)];
          break;
        case 0x0C52: // ALIASED_LINE_WIDTH_RANGE
          overrides[key] = [1, 10 + Math.floor(Math.random() * 20)];
          break;
        case 0x0D33: // MAX_TEXTURE_SIZE
          overrides[key] = 4096 + Math.floor(Math.random() * 8192);
          break;
        case 0x0D35: // MAX_VIEWPORT_DIMS
          overrides[key] = [8192 + Math.floor(Math.random() * 8192), 8192 + Math.floor(Math.random() * 8192)];
          break;
        case 0x8B4B: // MAX_TEXTURE_IMAGE_UNITS
          overrides[key] = 16 + Math.floor(Math.random() * 16);
          break;
        case 0x8DF2: // MAX_COMBINED_TEXTURE_IMAGE_UNITS
          overrides[key] = 32 + Math.floor(Math.random() * 32);
          break;
        case 0x8B4D: // MAX_VERTEX_TEXTURE_IMAGE_UNITS
          overrides[key] = 16 + Math.floor(Math.random() * 16);
          break;
        case 0x8DFD: // MAX_RENDERBUFFER_SIZE
          overrides[key] = 4096 + Math.floor(Math.random() * 8192);
          break;
        case 0x8DC7: // MAX_FRAGMENT_UNIFORM_VECTORS
          overrides[key] = 256 + Math.floor(Math.random() * 256);
          break;
        case 0x8DFB: // MAX_VERTEX_UNIFORM_VECTORS
          overrides[key] = 128 + Math.floor(Math.random() * 128);
          break;
        case 0x8DD9: // MAX_VARYING_VECTORS
          overrides[key] = 16 + Math.floor(Math.random() * 16);
          break;
        case 0x8B4A: // MAX_VERTEX_ATTRIBS
          overrides[key] = 16 + Math.floor(Math.random() * 8);
          break;
      }
    }
  });
  
  return overrides;
}

/**
 * WebGL 指纹伪装配置接口
 */
export interface WebglSpoofConfig {
  vendor: string;
  renderer: string;
  extensions: string[];
  parameterOverrides: Record<number, any>;
  shaderModifications: {
    enabled: boolean;
    precisionModifiers: {
      highp: string;
      mediump: string;
    };
    addNoise: boolean;
  };
  renderingModifications: {
    precision: number;
    colorNoise: number;
    patternShift: boolean;
  };
}

/**
 * 生成 WebGL 指纹伪装的 JavaScript 代码
 * @param config 伪装配置，如果不提供则生成随机配置
 * @returns JavaScript 代码字符串，可注入到页面中
 */
export const generateWebglSpoofScript = (config?: WebglSpoofConfig): string => {
  const spoofConfig = config || generateWebglSpoofConfig();
  
  return `
    (function() {
      // 保存原始的 WebGL 方法
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      let glInstance = null;
      let webgl2Instance = null;
      
      // 伪装配置
      const spoofConfig = ${JSON.stringify(spoofConfig)};
      
      // WebGL 参数映射
      const GL_PARAMETERS = {
        UNMASKED_VENDOR_WEBGL: 0x0D55,
        UNMASKED_RENDERER_WEBGL: 0x0D56,
        ALIASED_POINT_SIZE_RANGE: 0x0C50,
        ALIASED_LINE_WIDTH_RANGE: 0x0C52,
        MAX_TEXTURE_SIZE: 0x0D33,
        MAX_VIEWPORT_DIMS: 0x0D35,
        MAX_TEXTURE_IMAGE_UNITS: 0x8B4B,
        MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8DF2,
        MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8B4D,
        MAX_RENDERBUFFER_SIZE: 0x8DFD,
        MAX_FRAGMENT_UNIFORM_VECTORS: 0x8DC7,
        MAX_VERTEX_UNIFORM_VECTORS: 0x8DFB,
        MAX_VARYING_VECTORS: 0x8DD9,
        MAX_VERTEX_ATTRIBS: 0x8B4A
      };
      
      // 修改着色器代码
      function modifyShaderSource(source, type) {
        if (!spoofConfig.shaderModifications.enabled) {
          return source;
        }
        
        let modifiedSource = source;
        
        // 修改精度声明
        if (type === 'fragment') {
          modifiedSource = modifiedSource.replace(
            /precision\s+highp\s+float;/g,
            'precision ' + spoofConfig.shaderModifications.precisionModifiers.highp + ' float;'
          );
          modifiedSource = modifiedSource.replace(
            /precision\s+mediump\s+float;/g,
            'precision ' + spoofConfig.shaderModifications.precisionModifiers.mediump + ' float;'
          );
        }
        
        // 添加微小的噪声函数
        if (spoofConfig.shaderModifications.addNoise && Math.random() > 0.7) {
          const noiseFunction = `
            // 微小的噪声函数，几乎不影响渲染但改变指纹
            float tinyNoise(vec2 uv) {
              return (fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.001;
            }
          `;
          
          // 尝试在 main 函数前插入噪声函数
          if (modifiedSource.includes('void main()')) {
            modifiedSource = modifiedSource.replace(
              'void main()',
              noiseFunction + '\nvoid main()'
            );
          }
        }
        
        return modifiedSource;
      }
      
      // 创建被劫持的 WebGL 上下文
      function createSpoofedWebGLContext(canvas, contextType, contextAttributes) {
        const isWebGL2 = contextType === 'webgl2';
        const originalContext = originalGetContext.call(canvas, contextType, contextAttributes);
        
        if (!originalContext) {
          return null;
        }
        
        // 保存实例引用
        if (isWebGL2) {
          webgl2Instance = originalContext;
        } else {
          glInstance = originalContext;
        }
        
        // 创建代理对象
        const glProxy = new Proxy(originalContext, {
          get: function(target, prop, receiver) {
            // 处理扩展相关方法
            if (prop === 'getExtension') {
              return function(extensionName) {
                // 检查是否在我们模拟的扩展列表中
                if (spoofConfig.extensions.includes(extensionName)) {
                  const originalExtension = target.getExtension(extensionName);
                  
                  // 特别处理 WEBGL_debug_renderer_info 扩展
                  if (extensionName === 'WEBGL_debug_renderer_info' && originalExtension) {
                    return new Proxy(originalExtension, {
                      get: function(extTarget, extProp) {
                        // 劫持参数常量
                        if (extProp === 'UNMASKED_VENDOR_WEBGL') {
                          return GL_PARAMETERS.UNMASKED_VENDOR_WEBGL;
                        }
                        if (extProp === 'UNMASKED_RENDERER_WEBGL') {
                          return GL_PARAMETERS.UNMASKED_RENDERER_WEBGL;
                        }
                        return extTarget[extProp];
                      }
                    });
                  }
                  
                  return originalExtension;
                }
                return null;
              };
            }
            
            // 处理获取扩展列表的方法
            if (prop === 'getSupportedExtensions') {
              return function() {
                return spoofConfig.extensions.slice();
              };
            }
            
            // 处理获取参数的方法
            if (prop === 'getParameter') {
              return function(parameter) {
                // 检查是否有参数覆盖
                if (spoofConfig.parameterOverrides[parameter] !== undefined) {
                  return spoofConfig.parameterOverrides[parameter];
                }
                
                // 特别处理厂商和渲染器信息
                if (parameter === GL_PARAMETERS.UNMASKED_VENDOR_WEBGL) {
                  return spoofConfig.vendor;
                }
                if (parameter === GL_PARAMETERS.UNMASKED_RENDERER_WEBGL) {
                  return spoofConfig.renderer;
                }
                
                // 对于 MAX_VIEWPORT_DIMS 和其他数组参数，添加微小修改
                const originalValue = target.getParameter(parameter);
                if (Array.isArray(originalValue)) {
                  return originalValue.map(val => {
                    if (typeof val === 'number') {
                      return Math.round(val * (1 + (Math.random() - 0.5) * spoofConfig.renderingModifications.precision));
                    }
                    return val;
                  });
                }
                
                return originalValue;
              };
            }
            
            // 处理着色器编译
            if (prop === 'shaderSource') {
              return function(shader, source) {
                const shaderType = target.getShaderParameter(shader, target.SHADER_TYPE);
                const isFragmentShader = shaderType === target.FRAGMENT_SHADER;
                const modifiedSource = modifyShaderSource(source, isFragmentShader ? 'fragment' : 'vertex');
                return target.shaderSource(shader, modifiedSource);
              };
            }
            
            // 处理 readPixels，添加微小噪声
            if (prop === 'readPixels') {
              return function(x, y, width, height, format, type, pixels) {
                const result = target.readPixels(x, y, width, height, format, type, pixels);
                
                // 只在 30% 的情况下修改像素数据，减少性能影响
                if (Math.random() < 0.3 && pixels) {
                  const pixelCount = width * height;
                  const bytesPerPixel = type === target.UNSIGNED_BYTE ? 1 : 
                                      (type === target.FLOAT ? 4 : 2);
                  const components = format === target.RGBA ? 4 : 
                                   (format === target.RGB ? 3 : 1);
                  
                  for (let i = 0; i < pixelCount; i++) {
                    // 只为一小部分像素添加噪声
                    if (Math.random() < 0.05) {
                      const baseIndex = i * components * bytesPerPixel;
                      for (let j = 0; j < components; j++) {
                        const index = baseIndex + j * bytesPerPixel;
                        if (index < pixels.length) {
                          if (type === target.UNSIGNED_BYTE) {
                            pixels[index] = Math.max(0, Math.min(255, pixels[index] + Math.floor((Math.random() - 0.5) * spoofConfig.renderingModifications.colorNoise * 255)));
                          } else if (type === target.FLOAT) {
                            pixels[index] = pixels[index] + (Math.random() - 0.5) * spoofConfig.renderingModifications.colorNoise;
                          }
                        }
                      }
                    }
                  }
                }
                
                return result;
              };
            }
            
            // 处理绘制操作，添加微小变换
            const drawFunctions = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'];
            if (drawFunctions.includes(prop)) {
              return function(...args) {
                // 在极少数情况下应用微小的模型视图变换
                if (spoofConfig.renderingModifications.patternShift && Math.random() < 0.05) {
                  const originalProgram = target.getParameter(target.CURRENT_PROGRAM);
                  if (originalProgram) {
                    const uModelViewLocation = target.getUniformLocation(originalProgram, 'uModelViewMatrix');
                    if (uModelViewLocation) {
                      // 创建一个几乎是单位矩阵的变换矩阵，但有微小差异
                      const matrix = new Float32Array([
                        1 + (Math.random() - 0.5) * spoofConfig.renderingModifications.precision,
                        (Math.random() - 0.5) * spoofConfig.renderingModifications.precision,
                        0,
                        0,
                        (Math.random() - 0.5) * spoofConfig.renderingModifications.precision,
                        1 + (Math.random() - 0.5) * spoofConfig.renderingModifications.precision,
                        0,
                        0,
                        0,
                        0,
                        1,
                        0,
                        (Math.random() - 0.5) * spoofConfig.renderingModifications.precision,
                        (Math.random() - 0.5) * spoofConfig.renderingModifications.precision,
                        0,
                        1
                      ]);
                      target.uniformMatrix4fv(uModelViewLocation, false, matrix);
                    }
                  }
                }
                
                return target[prop].apply(target, args);
              };
            }
            
            // 默认行为
            const value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value;
          }
        });
        
        return glProxy;
      }
      
      // 劫持 getContext 方法
      HTMLCanvasElement.prototype.getContext = function(contextType, contextAttributes) {
        // 只处理 webgl 和 experimental-webgl
        if (['webgl', 'experimental-webgl', 'webgl2'].includes(contextType)) {
          return createSpoofedWebGLContext(this, contextType, contextAttributes);
        }
        
        // 其他上下文类型使用原始方法
        return originalGetContext.call(this, contextType, contextAttributes);
      };
      
      // 劫持 WebGLRenderingContext 和 WebGL2RenderingContext 的原型方法（如果需要）
      if (window.WebGLRenderingContext) {
        const originalWebGLRenderingContext = window.WebGLRenderingContext;
        window.WebGLRenderingContext = new Proxy(originalWebGLRenderingContext, {
          construct: function(target, args) {
            const instance = new target(...args);
            return new Proxy(instance, {
              get: function(instTarget, prop) {
                // 处理常量
                if (prop === 'UNMASKED_VENDOR_WEBGL') return GL_PARAMETERS.UNMASKED_VENDOR_WEBGL;
                if (prop === 'UNMASKED_RENDERER_WEBGL') return GL_PARAMETERS.UNMASKED_RENDERER_WEBGL;
                return instTarget[prop];
              }
            });
          }
        });
      }
      
      // 记录 WebGL 指纹伪装已加载
      window._webglFingerprintSpoofed = true;
      console.log('WebGL 指纹伪装已应用');
    })();
  `;
};

/**
 * 获取 WebGL 指纹伪装脚本，用于注入到页面
 * @param accountId 账户 ID，用于生成特定于账户的指纹
 * @returns JavaScript 代码字符串
 */
export const getWebglSpoofScript = (accountId?: string): string => {
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
    
    // 生成基于种子的厂商和渲染器
    const vendors = [
      'Google Inc.',
      'Intel Inc.',
      'NVIDIA Corporation',
      'ATI Technologies Inc.',
      'Microsoft Corporation',
      'Apple Inc.',
      'Advanced Micro Devices, Inc.'
    ];
    const renderers = [
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'AMD Radeon Pro 555 OpenGL Engine',
      'Intel(R) Iris(TM) Plus Graphics OpenGL Engine',
      'WebKit WebGL',
      'Mozilla',
      'Google SwiftShader'
    ];
    
    const vendorIndex = Math.floor(pseudoRandom(0, vendors.length));
    const rendererIndex = Math.floor(pseudoRandom(0, renderers.length));
    
    // 生成扩展列表
    const allExtensions = [
      'ANGLE_instanced_arrays',
      'EXT_blend_minmax',
      'EXT_color_buffer_half_float',
      'EXT_frag_depth',
      'EXT_shader_texture_lod',
      'OES_element_index_uint',
      'OES_standard_derivatives',
      'OES_texture_float',
      'OES_vertex_array_object',
      'WEBGL_color_buffer_float',
      'WEBGL_compressed_texture_s3tc',
      'WEBGL_debug_renderer_info',
      'WEBGL_debug_shaders',
      'WEBGL_depth_texture',
      'WEBGL_draw_buffers',
      'WEBGL_lose_context'
    ];
    
    const numExtensions = Math.floor(allExtensions.length * (0.8 + pseudoRandom(0, 0.15)));
    const selectedExtensions = [];
    for (let i = 0; i < numExtensions; i++) {
      const index = Math.floor(pseudoRandom(0, allExtensions.length));
      if (!selectedExtensions.includes(allExtensions[index])) {
        selectedExtensions.push(allExtensions[index]);
      }
    }
    
    const config: WebglSpoofConfig = {
      vendor: vendors[vendorIndex] + ' ' + (1000 + Math.floor(pseudoRandom(0, 9000))),
      renderer: renderers[rendererIndex],
      extensions: selectedExtensions,
      parameterOverrides: {
        0x0D33: 4096 + Math.floor(pseudoRandom(0, 8192)), // MAX_TEXTURE_SIZE
        0x0D35: [8192 + Math.floor(pseudoRandom(0, 8192)), 8192 + Math.floor(pseudoRandom(0, 8192))], // MAX_VIEWPORT_DIMS
        0x8B4B: 16 + Math.floor(pseudoRandom(0, 16)), // MAX_TEXTURE_IMAGE_UNITS
        0x8DFD: 4096 + Math.floor(pseudoRandom(0, 8192)) // MAX_RENDERBUFFER_SIZE
      },
      shaderModifications: {
        enabled: pseudoRandom(0, 1) > 0.3,
        precisionModifiers: {
          highp: pseudoRandom(0, 1) > 0.5 ? 'highp' : 'mediump',
          mediump: pseudoRandom(0, 1) > 0.5 ? 'mediump' : 'lowp'
        },
        addNoise: pseudoRandom(0, 1) > 0.7
      },
      renderingModifications: {
        precision: pseudoRandom(0, 0.001),
        colorNoise: pseudoRandom(0, 0.002),
        patternShift: pseudoRandom(0, 1) > 0.6
      }
    };
    
    return generateWebglSpoofScript(config);
  }
  
  // 否则生成随机配置
  return generateWebglSpoofScript();
};
