// @ts-nocheck
import { setHeader, axiosPut, axiosPost, getFileSize, paramsFilter } from './_util';

const reqMultipart = 'multipart/form-data;charset=UTF-8';
const TSS = {};

(function () {
  class StorageClient {
    constructor(params = {}) {
      this.initData = params;
      // 设置头部字段
      let headers = {};
      if (params.headers && JSON.stringify(params.headers) !== '{}') {
        headers = params.headers;
      }
      // headers['x-tss-security-token'] = params.securityToken;
      setHeader(headers);
    }

    /*
    * @discribe 上传
    * @method putObject
    * @param {
    *   data: {
    *     body: <Binary String>,
          bucket: "examplebucket",
          key: "exampleobject",
          checkMd5: true
    *   }
    *   success: function() {}
    *   fail: function() {}
    * } 参数
    * */
    putObject(putParams) {
      let { headers } = putParams;
      let contentType = headers['Content-Type'];
      let p = Object.assign(this.initData, putParams);
      let url = `/v3/${this.initData.data.bucket}/${this.initData.data.key}`;
      axiosPut(url, p, contentType);
    }

    /*
    * @discribe 分片上传
    * @method multipartUpload
    * @param {
    *   data: {
    *     body: <Binary String>,
          bucket: "examplebucket",
          key: "exampleobject",
          checkMd5: true
    *   }
    *   success: function() {}
    *   fail: function() {}
    *   onprogress: function() {}
    * } 参数
    * */
    multipartUpload(putParams) {
      if (!paramsFilter) {
        return;
      }
      // 获取upload_id
      let { headers, data: paramsData } = putParams;
      let chunkSize = 10 * 1024 * 1024;
      let contentType = headers['Content-Type'];
      let key = paramsData.key.replace(new RegExp('^/'), '');
      let initUploadUrl = `/v3/${paramsData.bucket}/${key}?uploads=1`;
      let newParams = {
        data: paramsData,
        ...this.initData,
        success: (res) => {
          if (res.data && res.data.upload_id) {
            this.sliceFile(res.data.upload_id, putParams, chunkSize, paramsData, key);
          } else {
            putParams.fail(res);
          }
        },
        fail: (newError) => {
          putParams.fail(newError);
        }
      };
      axiosPost(initUploadUrl, newParams, contentType);
    }

    sliceFile(upload_id, putParams, chunkSize, paramsData, key) {
      this.fileSlices((allChunks) => {
        let isEnd = false;
        let retryTime = 0; // 重试
        let fileSize = getFileSize(paramsData.body);
        let etagArr = [];
        const uploadPart = (index) => {
          let newChunks = allChunks[index];
          if (allChunks.length === index + 1) {
            isEnd = true;
          }
          let url = `/v3/${paramsData.bucket}/${key}?part_number=${index + 1}&upload_id=${upload_id}`;
          let newPutParams = {
            data: {
              body: newChunks,
              bucket: paramsData.bucket,
              key: key,
              checkMd5: paramsData.checkMd5
            },
            ...this.initData,
            success: (newRes) => {
              retryTime = 0;
              if (putParams.onprogress && (typeof putParams.onprogress === 'function')) {
                let loadSize = chunkSize * (index + 1);
                putParams.onprogress({
                  loadedSize: loadSize > fileSize ? fileSize : loadSize,
                  totalSize: fileSize,
                  loaded: Math.floor((index + 1) / allChunks.length * 100),
                  total: 100
                });
              }
              let newObj = {
                etag: newRes.data,
                part_number: index + 1
              };
              etagArr.push(newObj);
              if (isEnd) {
                this.completeUpload(upload_id, etagArr, putParams, paramsData, key);
              } else {
                uploadPart(index + 1);
              }
            },
            fail: (newPutError) => {
              ++retryTime;
              if (retryTime > 5) {
                putParams.fail(newPutError);
              } else {
                uploadPart(index);
              }
            }
          };
          axiosPut(url, newPutParams, reqMultipart);
        };
        // 首次开始进入
        uploadPart(0);
      }, paramsData, chunkSize);
    }

    fileSlices(callback, paramsData, chunkSize) {
      let chunks = [];
      let file = paramsData.body;
      let blobSlice = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
      let fileSize = getFileSize(file);
      let chunksNum = Math.ceil(fileSize / chunkSize);
      let currentChunk = 0;
      const frOnload = (e) => {
        chunks[currentChunk] = e.target.result;
        currentChunk++;
        if (currentChunk < chunksNum) {
          loadNextFile();
        } else {
          callback(chunks);
        }
      };
      const frOnerror = () => {
        putParams.fail('read file error');
      };
      const loadNextFile = () => {
        let fileReader = new FileReader();
        fileReader.onload = frOnload;
        fileReader.onerror = frOnerror;
        let start = currentChunk * chunkSize,
          end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;
        let blobPacket = blobSlice.call(file, start, end);
        fileReader.readAsArrayBuffer(blobPacket);
      };
      loadNextFile();
    }

    completeUpload(upload_id, etagArr, putParams, paramsData, key) {
      let completeUrl = `/v3/${paramsData.bucket}/${key}?upload_id=${upload_id}`;
      let completeParams = {
        data: paramsData,
        ...this.initData,
        params: JSON.stringify(etagArr),
        success: (comRes) => {
          putParams.success(comRes);
        },
        fail: (comErr) => {
          putParams.fail(comErr);
        }
      };
      axiosPost(completeUrl, completeParams, reqMultipart);
    }

    /*
    * @discribe 上传
    * @method upload
    * @param {
    *   data: {
    *     body: <Binary String>,
          bucket: "examplebucket",
          key: "exampleobject",
          checkMd5: true
    *   }
    *   success: function() {}
    *   fail: function() {}
    *   onprogress: function() {}
    * } 参数
    * */
    upload(putParams) {
      if (!paramsFilter) {
        return;
      }
      if (getFileSize(putParams.data.body) < 5 * 1024 * 1024) {
        this.putObject(putParams);
      } else {
        this.multipartUpload(putParams);
      }
    }
  }

  TSS.StorageClient = StorageClient;
})();

export default TSS;