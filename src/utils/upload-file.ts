// @ts-nocheck
import TalOss from './tal-oss/tal-oss';
import path from 'path';
import { XuanceModule } from '../types/xuance-module';

interface TalOssConfig {
  uploadTo: string;
  bucket: string;
  limit: number;
  accessKeyId: string;
  accessKeySecret: string;
  success: (res: any) => void;
  fail: () => void;
}

async function uploadFile(localPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    new TalOss({
      uploadTo: 'wecom-tool',
      bucket: 'udc-s-wx-common',
      limit: 100,
      accessKeyId: 'c45e54ec061865a375e4206e38b58f0d',
      accessKeySecret: '43c207c78f6630bd55665c7e7d69b905',
      success(res) {
        resolve(
          'https://static0.xesimg.com/udc-s-wx-common/wecom-tool/' +
            path.basename(localPath)
        );
      },  
      fail() {
        Logger.error(XuanceModule.COMMON.UPLOAD_FILE, 'oss', '上传文件失败，================若为测试环境, 请检查是否绑定测试环境hosts: 120.52.32.211 upload.xueersi.com', localPath ? localPath : 'localPath is undefined');
      },
    } as TalOssConfig).uploadFile(localPath);
  });
}

export { uploadFile };
