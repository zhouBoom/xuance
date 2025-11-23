#!/usr/bin/env node
// @ts-nocheck
import path from 'path';
import fs from 'fs-extra';
const TalOss = require('./tal-oss');
import TalOss from './tal-oss';
export default TalOss;

// process.on('uncaughtException', function(err) {
//   const nodeVer = process.version.match(/(\d+)?\./)[1];
//   if (nodeVer < 10) {
//     console.error(' === tal-oss所需最低node版本 === ', '10.0.0');
//     console.error(' === 当前node版本 === ', process.version);
//   }
//   console.error('____执行报错信息: ', err);
//   process.kill(process.ppid);
//   process.reallyExit(1);
// });

// var config = loadConfig(__dirname, '../tal-oss.online.json');
// var forbiddenUploadTo = ['dist', 'output', 'test', 'target', 'src'];
// var cwd = process.cwd();

// const args = process.argv.slice(2);
// const command = args[0];

// if (command === 'upload') {
//   const options = parseArgs(args.slice(1));
//   handleUpload(options);
// } else if (command === 'uploadFile') {
//   const options = parseArgs(args.slice(1));
//   handleUploadFile(options);
// } else {
//   console.error('Unknown command');
// }

// function parseArgs(args) {
//   const options = {};
//   args.forEach((arg, index) => {
//     if (arg.startsWith('--')) {
//       const key = arg.slice(2);
//       const value = args[index + 1];
//       options[key] = value;
//     }
//   });
//   return options;
// }

// async function handleUpload(argv) {
//   console.log('项目执行路径: ', cwd);

//   if (argv.env === 'test') {
//     config = await loadConfig(__dirname, '../tal-oss.test.json');
//   }

//   if (argv.config) {
//     const configPath = path.resolve(cwd, argv.config);
//     config = Object.assign(config, await loadConfig(cwd, configPath), argv);
//   }
//   config = Object.assign(config, argv);

//   if (!config.uploadFrom || !config.uploadTo) {
//     throw Error('【uploadFrom】【uploadTo】 为必传参数');
//   }
//   if (forbiddenUploadTo.indexOf(config.uploadTo) > -1) {
//     throw Error('禁止使用dist、output、test、target、src...此类目录作为根路径, 避免命名冲突!!!');
//   }

//   new TalOss({
//     uploadFrom: config.uploadFrom,
//     uploadTo: config.uploadTo,
//     bucket: config.bucket,
//     limit: config.limit,
//     chunkSize: config.chunkSize,
//     accessKeyId: config.accessKeyId,
//     accessKeySecret: config.accessKeySecret,
//     success() {
//       console.log('================全部文件上传完毕================');
//     },
//     fail(err) {
//       console.log('================文件上传失败================', err);
//       process.reallyExit(1);
//     }
//   }).upload();
// }

// function handleUploadFile(argv) {
//   console.log('项目执行路径: ', cwd);
//   if (!argv.file || !argv.uploadTo) {
//     throw Error('【file】【uploadTo】 为必传参数');
//   }
//   if (forbiddenUploadTo.indexOf(argv.uploadTo) > -1) {
//     throw Error('禁止使用dist、output、test、target、src...此类目录作为根路径, 避免命名冲突!!!');
//   }

//   if (argv.env === 'test') {
//     config = loadConfig(__dirname, '../tal-oss.test.json');
//   }

//   if (argv.config) {
//     var configPath = path.resolve(cwd, argv.config);
//     config = Object.assign(config, loadConfig(cwd, configPath));
//   }
//   config = Object.assign(config, argv);

//   new TalOss({
//     uploadFrom: config.uploadFrom,
//     uploadTo: config.uploadTo || config.uploadFrom,
//     bucket: config.bucket,
//     filename: config.filename,
//     limit: config.limit,
//     chunkSize: config.chunkSize,
//     accessKeyId: config.accessKeyId,
//     accessKeySecret: config.accessKeySecret,
//     success() {
//       console.log('================全部文件上传完毕================');
//     },
//     fail(err) {
//       console.log('================文件上传失败================', err);
//       process.reallyExit(1);
//     }
//   }).uploadFile(path.resolve(cwd, argv.file));
// }

// async function loadConfig(cwd, configPath) {
//   const jsonFilePath = path.resolve(cwd, configPath);
//   let jsonConfig = {};
//   try {
//     jsonConfig = await fs.readJSON(jsonFilePath);
//   } catch (error) {
//     console.error(jsonFilePath, "not found");
//     throw new Error(error);
//   }
//   return jsonConfig;
// }

// export default class TalOss {
//   // 类的实现
// }