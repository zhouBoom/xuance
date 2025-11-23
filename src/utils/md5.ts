import crypto from 'crypto';
import fs from 'fs';

export function getMd5(originStr: string): string {
  const signature = crypto
    .createHash('md5')
    .update(originStr, 'utf-8')
    .digest('hex');
  return signature;
}

export function getMd5ByFilePath(filePath: string): Promise<string> {
  const hash = crypto.createHash('md5');
  const stream = fs.createReadStream(filePath);
  return new Promise<string>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      hash.update(chunk);
    });
    stream.on('end', () => {
      const md5 = hash.digest('hex');
      resolve(md5);
    });
    stream.on('error', (err: Error) => {
      reject(err);
    });
  });
}
