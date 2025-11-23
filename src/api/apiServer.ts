import express from 'express';
import cors from 'cors';
import accountRoutes from './accountRoutes';
export function createApiServer() {
    const app = express();
    const PORT = 3009; // 你可以根据需要调整端口

    app.use(express.json());//配置跨域
    app.use(cors({
        origin: 'https://www.xiaohongshu.com',
        credentials: true
    }));

    app.use(accountRoutes)

    // 启动 API 服务器
    app.listen(PORT, () => {
        console.log(`API server running on http://localhost:${PORT}`);
    });
}