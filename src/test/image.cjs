const fs = require('fs');

const axios = require('axios').default;
const apiUrl = 'http://api.ttshitu.com/predict';
const base64data = fs.readFileSync('./image_center.png', 'base64');
const base64dataBack = fs.readFileSync('./image_bg.png', 'base64');


// const fs = require('fs');
// const apiUrl = 'http://api.ttshitu.com/predict';
// const imageFile = 'captcha.gif';//填写自己的文件路径
// let buff = fs.readFileSync(imageFile);
// let base64data = buff.toString('base64');

axios.post(apiUrl, {
    'username': 'xcdebw123',//用户名
    'password': 'xcdebW123',//密码
    'typeid': '1029',
    'image': base64data,
    'imageback ': base64dataBack
}).then(function (response) {
    let d = response.data;
    if (d.success){
        // handle success
        let {id, result} = d.data;
        console.log(result)
    } else {
        console.log(d.message)
    }
});