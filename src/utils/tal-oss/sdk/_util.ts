// @ts-nocheck
import axios from 'axios';
import md5 from 'crypto-js/md5';
import hmacsha1 from 'crypto-js/hmac-sha1';
import Base64 from 'crypto-js/enc-base64';
import is from 'is-type-of';

var reqApplication: string = 'application/x-www-form-urlencoded; charset=UTF-8';
var header: Record<string, string> = {};
var host: string = 'https://upload.xueersi.com';
var DOMAIN: string = 'upload.xueersi.com';

/**
* 封装axios请求
* param     {String} str   字符串
* @return   {String} 返回str
*/
axios.interceptors.request.use((res) => {
  for (var i in header) {
    res.headers[i] = header[i];
  }
  return res;
});

const _util = {
  setHeader: function (headers: Record<string, string>): void {
    header = headers;
  },
  /**
    * 解析字符串，将key=main_choose_grade_id&value=3这样的字符串转换成一个带有=前键值的对象方法
    * param     {String} str   字符串
    * @return   {Object} 返回str转换后的对象
    */
  parseStrToObject: function (str: string): Record<string, string> {
    var changeObject: Record<string, string> = {}, arr: string[] = [];
    // 将字符串以&为分割点转换成数组
    arr = str.split('&');
    // 循环字符串转换为了对应键值的对象,字符串必须是ey=main_choose_grade_id&value=3格式
    for(var i = 0; i < arr.length; i ++) {
      changeObject[decodeURIComponent(arr[i].split('=')[0])] = decodeURIComponent((arr[i].split('='))[1]);
    }
    return changeObject;
  },
  /*
    * @discribe 用于对传入字段进行MD5加密
    * @method md5Code
    * @param {message}
    * @return {String} 返回MD5加密后的字符串
    * TODO 未处理对象的字段目前暂未定义完全
    * */
  md5Code: function (message: string): string {
    return md5(message).toString();
  },
  /*
    * @discribe 获取时间戳
    * @method timstamp
    * @param {resolver} 初始化对象的回调函数
    * @return {Object} 返回一个Promise对象
    * TODO 未处理对象的字段目前暂未定义完全
    * */
  getTimstamp: function (): number {
    return parseInt(new Date().getTime().toString());
  },
  /*
    * @discribe axios的get方法
    * @method axiosGet
    * @param {res} 请求的url {params} 请求参数
    * @return {Promise} 返回一个Promise对象
    * TODO 未处理对象的字段目前暂未定义完全
    * */
  axiosGet: function (url: string, params: { data?: any, success?: Function, fail?: Function }): void {
    // var _t = this;
    axios.get(url, {
      params: params.data ? params.data : {},
    }).then(function (res) {
      params.success ? params.success(res) : function () {};
      // params.complete ? params.complete(res) : function (complete) {}
    }).catch(function (fail) {
      params.fail ? params.fail(fail) : function () {
      };
      // params.complete ? params.complete(fail) : function (fail) {
      // }
    });
  },
  /*
    * @discribe axios的post方法
    * @method axiosPost
    * @param {res} 请求的url {params} 请求参数
    * @return {Promise} 返回一个Promise对象
    * TODO 未处理对象的字段目前暂未定义完全
    * */
  axiosPost: function (url: string, params: { params?: any, success?: Function, fail?: Function }, headers?: string): void {
    delete header['Authorization'];
    delete header['Content-Type'];
    delete header['x-tss-date'];
    let reWriteHeader = {
      'Content-Type': headers || reqApplication
    };
    let date = new Date();
    header['x-tss-date'] = date.toGMTString();
    let authorization = this.createAuthorization(url, 'POST', params);
    reWriteHeader['Authorization'] = authorization;
    header = Object.assign(header, reWriteHeader);
    let completeUrl = host + url;
    axios.post(completeUrl, params.params || {}).then(function (res) {
      params.success ? params.success(res) : function () {};
    }).catch(function (fail) {
      params.fail ? params.fail(fail) : function () {};
    });
  },
  /*
    * @discribe axios的put方法
    * @method axiosPut
    * @param {res} 请求的url {params} 请求参数
    * @return {Promise} 返回一个Promise对象
    * TODO 未处理对象的字段目前暂未定义完全
    * */
  axiosPut: function (url: string, params: { data?: any, success?: Function, fail?: Function }, headers?: string): void {
    delete header['Authorization'];
    delete header['Content-Type'];
    delete header['x-tss-date'];
    if (!params.data) return false;
    var checkMd5 = params.data.checkMd5 || false;
    var reWriteHeader = {
      'Content-Type': headers || reqApplication
    };
    var date = new Date();
    // header['x-tss-date'] = 'Tue, 11 Aug 2020 10:28:46 GMT';
    header['x-tss-date'] = date.toGMTString();
    // var formData = new FormData();
    // for (var i in params.data) {
    //   formData.append(i, params.data[i]);
    // }
    if (checkMd5) {
      var contentMD5 = this.md5Code(params.data.body);
      reWriteHeader['Content-MD5'] = Base64.stringify(contentMD5);
    }
    var authorization = this.createAuthorization(url, 'PUT', params);
    reWriteHeader['Authorization'] = authorization;
    header = Object.assign(header, reWriteHeader);
    var completeUrl = host + url;
    // axios.put(completeUrl, params.data.body).then(function (res) {
    //   params.success ? params.success(res) : function () {
    //   };
    //   // params.complete ? params.complete(res) : function (res) {
    //   // }
    // }).catch(function (fail) {
    //   params.fail ? params.fail(fail) : function () {
    //   };
    //   // params.complete ? params.complete(fail) : function (fail) {
    //   // }
    // });

    import('got').then(got => {
      got.got.put(completeUrl, {
        headers: {
          ...header
        },
        body: params.data.body
      }).then(function(res){
        params.success ? params.success(res) : function () {};
      }).catch(err=>{
        params.fail ? params.fail(err) : function () {};
      });
    })
   
  },
  /*
    * @discribe 拼接鉴权头。
    * @method createAuthorization
    * @param {
    *   url:请求的接口url
    *   method:请求方法，大写,
    *   checkMD5: 请求体是否需要md5
    * }
    * @return {String} 返回一个鉴权字符串
    * TODO 未处理对象的字段目前暂未定义完全
    * */
  createAuthorization: function (url: string, method: string, params: { accessKeyId: string, data: { checkMd5?: boolean } }): string {
    var authorization = 'TSS1-HMAC-SHA1 ';
    // 计算 signedHeaders
    var signedHeaders = 'host';
    if (params.data.checkMd5) {
      signedHeaders += ';content-md5';
    }
    for (var key in header) {
      signedHeaders += `;${key}`;
    }
    // signedHeaders = 'host;x-tss-version;x-tss-date;x-tss-security-token';
    var signature = this.createSignature(url, method, params);
    authorization += `AccessKeyId=${params.accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}`;
    return authorization;
  },
  /*
    * @discribe 生成签名。
    * @method createSignature
    * @param {
    *   url:请求的url包括?和后面的参数
    *   method:请求的方法，大写，如：PUT
    *   parmas:请求的参数
    * }
    * @return {String} 返回一个加密签名字符串
    * */
  createSignature: function (url: string, method: string, params: { accessKeySecret: string }): string {
    var queryString = '';
    var canonicalQueryString = '';
    // 判断URL中是否有参数
    if (url.indexOf('?') > -1 && url.split('?')[1]) {
      queryString = this.getUrlParmas(url);
      canonicalQueryString = this.getCanonicalQueryString(queryString);
    }
    var uri = url.split('?')[0];
    var canonicalHeaders = this.getCanonicalHeaders();
    var canonicalRequest = `${method}\n${uri}\n${canonicalQueryString}\n${canonicalHeaders}`;
    var dateStr = this.timestampUTC(header['x-tss-date']);
    var stringToSign = `TSS1-HMAC-SHA1\n${dateStr}\n${canonicalRequest}`;
    var signature = hmacsha1(stringToSign, params.accessKeySecret);
    return signature;
  },
  /*
    * @discribe 获取CanonicalQueryString。
    * @method getCanonicalQueryString
    * @param {
    *   data: 请求参数
    * }
    * @return {String} 返回一个排序后的字符串
    * */
  getCanonicalQueryString: function (queryParam: Record<string, string>): string {
    var queryArr = Object.keys(queryParam).sort();
    var queryString = '';
    queryArr.forEach(key => {
      queryString += `${encodeURIComponent(key)}=${encodeURIComponent(queryParam[key])}&`;
    })
    queryString = queryString.slice(0, queryString.length - 1);
    return queryString;
  },
  /*
    * @discribe 获取getCanonicalHeaders。
    * @method getCanonicalHeaders
    * @param {
    *   headers: 请求头对象
    * }
    * @return {String} 返回一个排序后的字符串
    * */
  getCanonicalHeaders: function (): string {
    var newHeader = {
      'host': DOMAIN
    };
    for (var key in header){
      newHeader[key.toLowerCase()] = header[key];
    }
    var newKey = Object.keys(newHeader).sort();
    var queryString = '';
    for(let i = 0; i < newKey.length; i ++) {
      queryString += `${newKey[i]}:${this.trim(newHeader[newKey[i]])}\n`;
    }

    return queryString;
  },
  /*
    * @discribe 验证是否是一个数字
    * @method validNum
    * @param {data} 需要验证的对象
    * @return {Boolean} 返回一个布尔值作为对象信息的验证
    * */
  validNum: function (num: any): boolean {
    var a = /^\d/g;
    return a.test(num);
  },
  /*
    * @discribe 对字符串去空格
    * @method trim
    * @param {str} 需要验证的对象
    * @return {String} 返回一个处理后的字符串
    * */
  trim: function (str: string): string {
    if (String.prototype.trim) {
      return str.trim();
    } else {
      return str.replace(/^\s+|\s+$/g, '');
    }
  },
  validEmpty: function (str: string): boolean {
    return /^\s*$/.test(str) || str.length === 0;
  },
  axios: axios,
  // 事件绑定
  addEvent: function (event: string[], el: HTMLElement, fn: EventListener): void {
    if (el.addEventListener) {
      el.addEventListener(event[0], fn, true);
    } else if (el.attachEvent) {
      el.attachEvent(event[event.length > 1 ? 1 : 0], fn);
    }
  },
  parseStr: function (str: string): Record<string, string> {
    if (str) {
      var changeObject: Record<string, string> = {};
      var arr: string[] = [];
      // 将字符串以&为分割点转换成数组
      arr = str.split('&');
      // 此处过滤��无效参数，兼容url结尾& 【hasModifiy】
      arr = arr.filter(x => /\w+=\w*/.test(x));
      // 循环字符串转换为了对应键值的对象,字符串必须是ey=main_choose_grade_id&value=3格式
      for (var i = 0; i < arr.length; i++) {
        changeObject[arr[i].split('=')[0].toLowerCase()] = arr[i].split('=')[1];
      }
      return changeObject;
    } else {
      return {};
    }
  },
  /* @discribe 获取url参数
    * @method getUrlParmas
    * @param {data} 全局变量中的header对象
    * @return {object}} 返回一个对象
    * */
  getUrlParmas: function (url: string): Record<string, string> {
    let vars: Record<string, string> = {};
    url.replace(/[?&]+([^=&]+)=([^&#]*)/gi, function (m, key, value) {
      vars[key] = value;
    });
    return vars;
  },
  /**
     * 补齐数字位数
     * @return {string}
     */
  getNumTwoBit: function (n: number): string {
    n = Number(n);
    return (n > 9 ? '' : '0') + n;
  },
  /**
     * 时间戳转换为UTC日期格式
     * @return {String}
     */
  timestampUTC: function (date: string): string {
    date = new Date(date);
    var timestamp = date.getTime() + new Date().getTimezoneOffset() * 60 * 1000;
    date = new Date(timestamp);
    var dateStr = '';
    dateStr = `${date.getFullYear()}${this.getNumTwoBit((date.getMonth() + 1))}${this.getNumTwoBit(date.getDate())}T${this.getNumTwoBit(date.getHours())}${this.getNumTwoBit(date.getMinutes())}${this.getNumTwoBit(date.getSeconds())}Z`;
    return dateStr;
  },
  /**
   * 检测是否是文件类型
   * @return {Boolean}
   */
  isFile: function (file: any): boolean {
    return typeof(file) !== 'undefined' && file instanceof File;
  },
  /**
   * 获取文件大小
   * @return {Boolean}
   */
  getFileSize: function (file: any): number {
    if (is.buffer(file)) {
      return file.length;
    } else if (this.isFile(file)) {
      return file.size;
    } if (is.string(file)) {
      return file.length;
    }
    throw new Error('is Buffer/File/String type');
  },
  /**
   * 参数判断
   * @return {Boolean}
   */
  paramsFilter: function (obj: { data?: { body?: any }, success?: Function, fail?: Function }): boolean {
    if (!obj || !obj.data || !obj.data.body) {
      throw new Error('data error');
    }
    if (obj.success && (typeof obj.success  !== 'function')) {
      throw new Error('success not a function');
    }
    if (obj.fail && (typeof obj.fail  !== 'function')) {
      throw new Error('fail not a function');
    }
    return true;
  },
  /**
   * @description: 获取上传的token
   * @param {*}
   * @return {*}
   */
  getUploadToken: function (url: string, params: { bucket: string, key: string, contentMD5?: string, postobjectSuccessRedirect?: string, postobjectSuccessStatus?: string, duration_seconds?: number }): Promise<any> {
    header = {}
    let date = new Date();
    header['x-tss-date'] = date.toGMTString();
    let policy: Record<string, any> = {}
    policy["version"] = "1.0"
    let expiration = new Date(new Date().getTime() + 3600 * 1000)
    policy["expiration"] = expiration.toGMTString();
    policy["bucket"] = params.bucket
    policy["key"] = params.key
    //下面非必传
    policy["content-md5"] = params.contentMD5
    policy["postobject_success_redirect"] = params.postobjectSuccessRedirect
    policy["postobject_success_status"] = params.postobjectSuccessStatus
    if (!params.duration_seconds) {
      params.duration_seconds = 3600
    }
    let policyBase64 = Buffer.from(JSON.stringify(policy)).toString('base64')
    let sigUrl = url + '?duration_seconds=' + params.duration_seconds + '&policy=' + policyBase64;
    header['Authorization'] = this.createAuthorization(sigUrl, 'GET', params);
    header['Host'] = DOMAIN;
    let completeUrl = host + url
    return axios.get(completeUrl, {
      params: {
        policy: policyBase64,
        duration_seconds: JSON.stringify(params.duration_seconds)
      }
    })
  }
};

export default _util;
