import { Router } from 'express';
import { envDataManager } from '../account/envDataManager';

const router = Router();

router.get('/api/accounts', async (req, res) => {
    // 发送账号数据到渲染进程
    const accounts = await envDataManager.loadAccountList();
    res.json({
        data: accounts
    })
});

router.post('/api/saveArticle', async (req, res) => {
    // 发送账号数据到渲染进程
    console.log('saveArticle', req.body);
    res.json({
        success: true
    })
});

export default router;