import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { uploadFile } from './upload-file';
import os from 'os';
import { XuanceModule } from '../types/xuance-module';
import { downloadImageWithProxy } from './proxy';

export const downloadAndUploadImage = async (imageUrl: string): Promise<string> => {
    try {
        const localPath = await downloadImageWithProxy(imageUrl);
        // 上传到OSS
        const ossUrl = await uploadFile(localPath);
        // 清理临时文件
        fs.unlinkSync(localPath);
        Logger.info(XuanceModule.COMMON.UPLOAD_FILE, '', '图片上传成功', ossUrl)
        return ossUrl;
    } catch (error) {
        Logger.error(XuanceModule.COMMON.UPLOAD_FILE, '','下载或上传图片失败', error);
        throw error;
    }
}