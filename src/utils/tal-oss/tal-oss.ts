// @ts-nocheck
import md5 from 'md5';
import fs from 'fs-extra';
// import { stdout as slog } from 'single-line-log';
import path from 'path';
import glob from 'glob';
import tssUtils from './sdk/_util';
import { parallelLimit } from 'async';
import { cwd } from 'process';
var uploadQueue = []; // async functions
var maxRetryCount = 6; // 重试次数
var config = {
  "bucket": "xiaohou",
  "limit": "100",
  "chunkSize": 5,
  "accessKeyId": "3b8d5e3f881b56173e67820e722e3686",
  "accessKeySecret": "7335517da8351a827b56a591f35a3106"
}; // 默认线上配置项
var reqMultipart = '*';
// var reqMultipart = 'multipart/form-data;charset=UTF-8';

export default function TalOss({
  uploadFrom,
  uploadTo,
  bucket,
  env,
  filename,
  limit,
  chunkSize,
  accessKeyId,
  accessKeySecret,
  success,
  fail
}) {
  var that = this;
  if (env === 'test') {
    config = {
      "bucket": "monkey-test",
      "limit": "100",
      "chunkSize": 5,
      "accessKeyId": "5f5f758101d658b7742968c8186f392f",
      "accessKeySecret": "220dc29dcda3419d6ec7524b0c0de00f"
    }; // 默认线上配置项
  }
  that.uploadFrom = uploadFrom; // 要上传的目标文件夹
  that.uploadTo = uploadTo.replace(/@/g, '%40'); // 带@符号的文件名会鉴权失败; // 要上传的目标文件夹
  that.bucket = bucket || config.bucket; // 要上传的目标文件夹
  that.filename = filename; // 要上传的目标文件夹
  that.chunkSize = chunkSize * 1024 * 1024; // 分片上传时的大小限制
  that.fileIndex = 0; // 文件计数器
  that.successIndex = 0; // 上传成功文件计数器
  that.success = success; // 是否完成文件读取
  that.fail = fail; // 是否完成文件读取
  that.timer = setTimeout(() => { // 超时控制器
    if (that.successIndex < that.fileIndex) {
      console.error('文件上传超时; timeout: 5min;');
      that.fail && that.fail({
        type: 'timeout',
        msg: '文件上传超时; timeout: 5min;'
      });
    }
  }, 5 * 60 * 1000);
  that.retryList = {}; // 失败重试list   最多支持5次失败重传
  that.upload = function upload(dir = that.uploadFrom) { // 文件遍历器
    if (!this.uploadFrom || !this.uploadTo) { // 入参校验
      throw Error('【uploadFrom】【uploadTo】 为必传参数');
    }
    var pattern = path.join('**', '*.*');
    glob(pattern, {
      cwd: dir,
      dot: true
    }, function (er, files) {
      if (!files.length) {
        throw Error('【'+ cwd() + path.sep + dir +'】中无可上传文件');
      }
      that.fileIndex = files.length;
      files.forEach((item, index) => {
        var targetFile = path.join(dir, item);
        uploadQueue.push(function (callback) {
          // callback()
          fs.readFile(targetFile, (err, data) => {
            if (err) {
              Logger.error("COMMON.UPLOAD_FILE", '', '文件读取失败', err);
              that.fail && that.fail({
                type: 'fileRead',
                msg: err
              });
              return
            }
            that._uploadFile_(data, item, (err, results) => {
              callback(err, results)
            })
          })
        })
      })
      parallelLimit(uploadQueue, limit || config.limit, function (err, results) {
        if (err) {
          Logger.error("COMMON.UPLOAD_FILE", '', '文件上传失败', err);
        }
      })
    })
  }
  that.uploadFile = function upload(dir) { // 文件遍历器
    if (!that.uploadTo) { // 入参校验
      throw Error('【uploadTo】 为必传参数');
    }
    that.fileIndex = 1;
    // var fileName = path.sep + path.basename(dir);
    var fileName = that.filename || path.basename(dir);
    // console.log(fileName);
    var filePath = path.resolve(that.uploadFrom || process.cwd(), dir);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        Logger.error("COMMON.UPLOAD_FILE", '', '文件读取失败', err);
        that.fail && that.fail({
          type: 'fileRead',
          msg: err
        });
        return
      }
      that._uploadFile_(data, fileName, (err, results) => {})
    })
  }
  that.uploadFileData = function(...args) {
    that._uploadFile_(...args);
  }
  that._uploadFile_ = function _uploadFile_(content, filename, callback) {

    var contentMd5 = md5(content);

    var headers = {
      'content-md5': contentMd5,
    }
    tssUtils.setHeader(headers);
    filename = filename.replace(/@/g, '%40'); // 带@符号的文件名会鉴权失败
    filename = filename.replace(new RegExp('^/'), ''); // 排除首字符为/的路径
    filename = filename.replace(/[\u4e00-\u9fa5]+/g, str => encodeURIComponent(str));

    let uploadPath = `/v3/${that.bucket}/${that.uploadTo}/${filename}`;
    // 支持上传文件到根路径
    if (that.uploadTo === '/') {
      uploadPath = `/v3/${that.bucket}/${filename}`;
    }

    if (content.length > that.chunkSize) {
      // 超过5M分片上传
      that.multipartUpload({
        headers: {
          'Content-Type': '*' //可以设置image/jpeg，image/gif，*等
        },
        data: {
          body: content, //上传的二进制文件
          bucket: that.bucket, //bucket name
          key: `${that.uploadTo}/${filename}`, //文件名称，可以携带具体文件夹，比如a/b/c.jpg
          checkMd5: false //是否校验md5
        },
        success: function (res) { //成功回调
          that.countControl(filename, callback);
        },
        fail: function (err) { //失败回调
          Logger.error("COMMON.UPLOAD_FILE", '', '大文件上传失败', err);
          that.fail && that.fail({
            type: 'uploadFail',
            msg: '大文件上传失败',
            err,
          });
        },
        onprogress: function () {} //进度回调
      })
    } else {
      // 直接传
      tssUtils.axiosPut(uploadPath, {
        data: {
          body: content,
          checkMd5: false
        },
        accessKeyId: accessKeyId || config.accessKeyId,
        accessKeySecret: accessKeySecret || config.accessKeySecret,
        success: res => {
          that.countControl(filename, callback);
        },
        fail: (err) => {
          Logger.error("COMMON.UPLOAD_FILE", '', '错误 err' + 'url=' + uploadPath, '数据太大不展示' + err.message)
          if (that.retryList.hasOwnProperty(filename) && that.retryList[filename] > maxRetryCount) {
            Logger.error("COMMON.UPLOAD_FILE", '', '文件上传重试失败', err);
            that.fail && that.fail({
              type: 'uploadFail',
              msg: '文件上传重试失败',
              err,
            });
            callback('file post failed');
          } else if (that.retryList.hasOwnProperty(filename)) {
            that.retryList[filename]++;
            _uploadFile_(content, filename, callback);
          } else {
            that.retryList[filename] = 1;
            _uploadFile_(content, filename, callback);
          }
          Logger.error("COMMON.UPLOAD_FILE", '', `第${that.retryList[filename]}次上传失败: `, filename);
        }
      })
    }

  }
  that.countControl = function(filename, callback) {
    that.successIndex++;
    if (that.successIndex === 1) {
      Logger.info("COMMON.UPLOAD_FILE", '', filename, '文件上传中')
    }
    Logger.info("COMMON.UPLOAD_FILE", '', `第${that.retryList[filename] && that.retryList[filename] + 1 || 1}次上传成功: `, filename)
    callback(null, {
      fileName: filename
    });
    if (that.successIndex === that.fileIndex) {
      try {
        that.success && that.success();
      } catch (e) {
        Logger.error("COMMON.UPLOAD_FILE", '', 'success callback error: ', e);
        process.reallyExit(1);
      }
      clearTimeout(that.timer);
    }
  }
  // 获取用于上传请求的令牌
  that.getUploadToken = function getUploadToken() {
    return tssUtils.getUploadToken('/sts/upload_token', {
      accessKeyId: accessKeyId || config.accessKeyId,
      accessKeySecret: accessKeySecret || config.accessKeySecret,
      bucket: bucket,
      key: '*',
      data: {
        checkMd5: false
      }
    });
  }

  that.multipartUpload = function (putParams) {
    // 分片上传  https://cloud.xesv5.com/docs/storage/api.html#uploadpart
    if (!tssUtils.paramsFilter) {
      return;
    }
    // 获取upload_id
    let {
      headers,
      data: paramsData
    } = putParams;
    let contentType = headers['Content-Type'];
    let key = paramsData.key.replace(new RegExp('^/'), '').replace(/[\u4e00-\u9fa5]+/g, str => encodeURIComponent(str));
    let initUploadUrl = `/v3/${paramsData.bucket}/${key}?uploads=1`;
    let newParams = {
      data: paramsData,
      accessKeyId,
      accessKeySecret,
      success: function (res) {
        if (res.data && res.data.upload_id) {
          sliceFile(res.data.upload_id);
        } else {
          putParams.fail(res);
        }
      },
      fail: function (newError) {
        putParams.fail(newError);
      }
    };
    tssUtils.axiosPost(initUploadUrl, newParams, contentType);

    // 分片上传
    function sliceFile(upload_id) {
      fileSlices(function (allChunks) {
        let isEnd = false;
        let retryTime = 0; // 重试
        let fileSize = tssUtils.getFileSize(paramsData.body);
        let etagArr = [];
        function uploadPart(index) {
          let newChunks = allChunks[index];
          if (allChunks.length === index + 1) {
            isEnd = true;
          }
          let url = `/v3/${paramsData.bucket}/${key}?part_number=${index+1}&upload_id=${upload_id}`;
          let newPutParams = {
            data: {
              body: newChunks,
              checkMd5: paramsData.checkMd5
            },
            accessKeyId,
            accessKeySecret,
            success: function (newRes) {
              retryTime = 0;
              if (putParams.onprogress && (typeof putParams.onprogress === 'function')) {
                let loadSize = that.chunkSize * (index+1);
                putParams.onprogress({
                  loadedSize: loadSize > fileSize ? fileSize : loadSize,
                  totalSize: fileSize,
                  loaded: Math.floor((index + 1) / allChunks.length * 100),
                  total: 100
                });
              }
              let newObj = {
                etag: JSON.parse(newRes.body),
                part_number: index+1
              };
              etagArr.push(newObj);
              if (isEnd) {
                completeUpload (upload_id, etagArr);
              } else {
                uploadPart (index+1);
              }
            },
            fail: function (newPutError) {
              ++retryTime;
              if (retryTime > 5) {
                putParams.fail(newPutError);
              } else {
                uploadPart (index);
              }
            }
          };
          // 分片上传不校验md5, 切需要清空header中的content-md5字段方可. 后端字段的优先级处理有问题
          tssUtils.setHeader({});

          tssUtils.axiosPut(url, newPutParams);
        }
        // 首次开始进入
        uploadPart (0);
      });
    }
    // 处理切片文件
    let fileSlices = function (callback) {
      let chunks = [];
      let file = paramsData.body;
      let fileSize = tssUtils.getFileSize(file);
      let chunksNum = Math.ceil(fileSize / that.chunkSize);
      let currentChunk = 0;
      let frOnload = function (e) {
        chunks[currentChunk] = e.target.result;
        currentChunk++;
        if (currentChunk < chunksNum) {
          loadNextFile();
        } else {
          callback(chunks);
        }
      };
      function loadNextFile() {
        let start = currentChunk * that.chunkSize,
          end = ((start + that.chunkSize) >= file.size) ? file.size : start + that.chunkSize;
        let blobPacket = file.slice(start, end);
        frOnload({
          target: {
            result: blobPacket
          }
        })
      }
      loadNextFile();
    };
    let completeUpload = function (upload_id, etagArr) {
      let completeUrl = `/v3/${paramsData.bucket}/${key}?upload_id=${upload_id}`;
      let completeParams = {
        data: paramsData,
        accessKeyId,
        accessKeySecret,
        params: JSON.stringify(etagArr),
        success: function (comRes) {
          putParams.success(comRes);
        },
        fail: function (comErr) {
          putParams.fail(comErr);
        }
      };
      tssUtils.axiosPost(completeUrl, completeParams, reqMultipart);
    };
  };
}

function loadConfig(cwd, configPath) {
  let jsonFilePath = path.resolve(cwd, configPath);
  let jsonConfig = {};
  try {
    jsonConfig = fs.readJSONSync(jsonFilePath);
  } catch (error) {
    console.error(jsonFilePath, "not found");
    throw new Error(error);
  }
  return jsonConfig;
}