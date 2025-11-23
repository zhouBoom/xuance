// 测试信令服务器
const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });
const clients = new Map();
const streamers = new Map(); // 存储推流端信息

console.log('🚀 信令服务器启动中...');

wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substring(2, 15);
    clients.set(clientId, {
        ws: ws,
        type: null, // 'streamer' 或 'viewer'
        roomId: null,
        streamInfo: null
    });
    
    console.log(`✅ 客户端连接: ${clientId}`);
    console.log(`📊 当前连接数: ${clients.size}`);
    
    ws.send(JSON.stringify({
        type: 'welcome',
        clientId: clientId,
        message: '连接成功'
    }));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const client = clients.get(clientId);
            
            console.log(`📨 收到来自 ${clientId} 的消息:`, data.type);
            
            // 处理客户端类型设置
            if (data.type === 'join') {
                client.type = data.clientType; // 'streamer' 或 'viewer'
                client.roomId = data.roomId;
                
                if (data.clientType === 'streamer') {
                    // 推流端加入
                    client.streamInfo = data.streamInfo || {};
                    streamers.set(data.roomId, {
                        clientId: clientId,
                        streamInfo: client.streamInfo,
                        ws: ws
                    });
                    console.log(`🎥 推流端加入房间: ${data.roomId}`);
                    
                    // 通知房间内的观众有新的推流
                    notifyViewersInRoom(data.roomId, {
                        type: 'streamer-joined',
                        streamerId: clientId,
                        streamInfo: client.streamInfo
                    });
                    
                } else if (data.clientType === 'viewer') {
                    // 拉流端加入
                    console.log(`👀 拉流端加入房间: ${data.roomId}`);
                    
                    // 检查房间是否有推流端，如果有则发送推流端信息给新加入的拉流端
                    const streamer = streamers.get(data.roomId);
                    if (streamer && streamer.ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'streamer-info',
                            streamerId: streamer.clientId,
                            streamInfo: streamer.streamInfo,
                            message: '房间内有推流端'
                        }));
                        console.log(`📤 已向拉流端 ${clientId} 发送推流端信息`);
                        
                        // 通知推流端有新观众加入
                        streamer.ws.send(JSON.stringify({
                            type: 'viewer-joined',
                            viewerId: clientId,
                            message: '有新观众加入'
                        }));
                    } else {
                        ws.send(JSON.stringify({
                            type: 'no-streamer',
                            message: '房间内暂无推流端'
                        }));
                    }
                }
                
                ws.send(JSON.stringify({
                    type: 'join-success',
                    clientType: data.clientType,
                    roomId: data.roomId
                }));
                return;
            }
            
            // 根据客户端类型转发消息
            if (client.type === 'streamer') {
                // 推流端消息转发给同房间的拉流端
                forwardToViewersInRoom(client.roomId, data, clientId);
            } else if (client.type === 'viewer') {
                // 拉流端消息转发给同房间的推流端
                forwardToStreamerInRoom(client.roomId, data, clientId);
            } else {
                // 未设置类型的客户端，按原逻辑转发给所有其他客户端
                let forwardCount = 0;
                clients.forEach((clientInfo, id) => {
                    if (id !== clientId && clientInfo.ws.readyState === WebSocket.OPEN) {
                        clientInfo.ws.send(JSON.stringify(data));
                        forwardCount++;
                    }
                });
                console.log(`📤 消息已转发给 ${forwardCount} 个客户端`);
            }
            
        } catch (error) {
            console.error('❌ 解析消息失败:', error);
        }
    });
    
    ws.on('close', () => {
        const client = clients.get(clientId);
        if (client && client.type === 'streamer' && client.roomId) {
            // 推流端断开，通知房间内观众
            streamers.delete(client.roomId);
            notifyViewersInRoom(client.roomId, {
                type: 'streamer-left',
                streamerId: clientId,
                message: '推流端已断开'
            });
            console.log(`🎥 推流端断开: ${clientId}`);
        } else if (client && client.type === 'viewer' && client.roomId) {
            // 观众断开，通知推流端
            const streamer = streamers.get(client.roomId);
            if (streamer && streamer.ws.readyState === WebSocket.OPEN) {
                streamer.ws.send(JSON.stringify({
                    type: 'viewer-left',
                    viewerId: clientId,
                    message: '观众已离开'
                }));
            }
            console.log(`👀 拉流端断开: ${clientId}`);
        }
        
        clients.delete(clientId);
        console.log(`❌ 客户端断开: ${clientId}`);
        console.log(`📊 当前连接数: ${clients.size}`);
    });
    
    ws.on('error', (error) => {
        console.error(`🚨 WebSocket错误 (${clientId}):`, error);
    });
});

// 向房间内的观众转发消息
function forwardToViewersInRoom(roomId, data, senderId) {
    let forwardCount = 0;
    clients.forEach((clientInfo, id) => {
        if (id !== senderId && 
            clientInfo.type === 'viewer' && 
            clientInfo.roomId === roomId && 
            clientInfo.ws.readyState === WebSocket.OPEN) {
            clientInfo.ws.send(JSON.stringify(data));
            forwardCount++;
        }
    });
    console.log(`📤 消息已转发给房间 ${roomId} 内的 ${forwardCount} 个观众`);
}

// 向房间内的推流端转发消息
function forwardToStreamerInRoom(roomId, data, senderId) {
    const streamer = streamers.get(roomId);
    if (streamer && streamer.ws.readyState === WebSocket.OPEN) {
        streamer.ws.send(JSON.stringify(data));
        console.log(`📤 消息已转发给房间 ${roomId} 的推流端`);
    } else {
        console.log(`⚠️ 房间 ${roomId} 无可用推流端`);
    }
}

// 通知房间内所有观众
function notifyViewersInRoom(roomId, data) {
    let notifyCount = 0;
    clients.forEach((clientInfo, id) => {
        if (clientInfo.type === 'viewer' && 
            clientInfo.roomId === roomId && 
            clientInfo.ws.readyState === WebSocket.OPEN) {
            clientInfo.ws.send(JSON.stringify(data));
            notifyCount++;
        }
    });
    console.log(`📢 已通知房间 ${roomId} 内的 ${notifyCount} 个观众`);
    
    // 通知推流端当前观众数量
    const streamer = streamers.get(roomId);
    if (streamer && streamer.ws.readyState === WebSocket.OPEN) {
        const viewerCount = Array.from(clients.values()).filter(
            client => client.type === 'viewer' && client.roomId === roomId
        ).length;
        
        streamer.ws.send(JSON.stringify({
            type: 'viewer-count-update',
            count: viewerCount
        }));
    }
}

server.on('request', (req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            connections: clients.size,
            streamers: streamers.size,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        }));
    } else if (req.url === '/rooms') {
        // 新增：查看房间状态的接口
        const rooms = {};
        streamers.forEach((streamer, roomId) => {
            const viewers = Array.from(clients.values()).filter(
                client => client.type === 'viewer' && client.roomId === roomId
            ).length;
            rooms[roomId] = {
                streamerId: streamer.clientId,
                viewerCount: viewers,
                streamInfo: streamer.streamInfo
            };
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rooms));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(8080, () => {
    console.log('🎯 信令服务器运行在:');
    console.log('   WebSocket: ws://localhost:8080');
    console.log('   健康检查: http://localhost:8080/health');
});

process.on('SIGINT', () => {
    console.log('\n🔄 正在关闭服务器...');
    server.close(() => {
        console.log('✅ 服务器已关闭');
        process.exit(0);
    });
});