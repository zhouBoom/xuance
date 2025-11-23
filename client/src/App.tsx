// client/src/App.tsx
import React, { useState } from 'react';
import { Grid, Paper, Backdrop, CircularProgress } from '@mui/material';
import { AccountManager } from './components/AccountManager';
import { AccountInfo } from './components/AccountInfo';
import { ToastContainer } from 'react-toastify';
import { useEffect } from 'react';

// 屏幕共享管理器
class ScreenShareHandler {
    private peerConnection: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;
    private localStream: MediaStream | null = null;
    private signalSocket: WebSocket | null = null;
    private config: any = null;
    private roomId: string = 'default-room';
    private clientId: string | null = null;
    private viewerCount: number = 0; // 添加观众计数
    private isStreaming: boolean = false; // 添加推流状态标识
    private pendingViewers: string[] = []; // 等待连接的观众列表

    async handleScreenShareStart(data: { sources: any[], config: any }): Promise<void> {
        try {
            console.log('收到屏幕共享启动请求，屏幕源数量:', data.sources.length);
            console.log('📊 完整的屏幕源列表:', data.sources);
            this.config = data.config;
            this.roomId = data.config.roomId || 'default-room'; // 从配置获取房间ID

            // 分类屏幕源
            const screenSources = data.sources.filter(s => s.type === 'screen');
            const windowSources = data.sources.filter(s => s.type === 'window');
            
            console.log(`可用显示器: ${screenSources.length} 个`);
            console.log(`可用窗口: ${windowSources.length} 个`);
            
            // 打印屏幕源详细信息
            console.log('🖥️ 显示器列表:');
            screenSources.forEach((source, index) => {
                console.log(`  显示器 ${index}: ${source.name} (ID: ${source.id})`);
            });
            
            // 打印所有可用窗口信息，便于调试
            console.log('🪟 窗口列表:');
            windowSources.forEach((source, index) => {
                console.log(`  窗口 ${index}: ${source.name} (ID: ${source.id})`);
                console.log(`    - 应用名称: ${source.appIcon ? '有图标' : '无图标'}`);
                console.log(`    - 详细信息:`, source);
            });

            // 检查是否有其他类型的源
            const otherSources = data.sources.filter(s => s.type !== 'screen' && s.type !== 'window');
            if (otherSources.length > 0) {
                console.log('🔍 其他类型源:');
                otherSources.forEach((source, index) => {
                    console.log(`  其他 ${index}: ${source.name} (类型: ${source.type}, ID: ${source.id})`);
                });
            }

            // 优先选择指定程序的窗口
            let selectedSource;
            
            // 检查配置中是否指定了目标程序名称
            const targetAppName = '玄策'; // 例如: "Visual Studio Code", "Chrome", "WeChat"
            const targetWindowTitle = '玄策'; // 例如: "玄策", "微信"
            
            // if (targetAppName || targetWindowTitle) {
            //     // 根据程序名称或窗口标题查找匹配的窗口
            //     const matchedWindow = windowSources.find(source => {
            //         const name = source.name.toLowerCase();
            //         if (targetAppName && name.includes(targetAppName.toLowerCase())) {
            //             return true;
            //         }
            //         if (targetWindowTitle && name.includes(targetWindowTitle.toLowerCase())) {
            //             return true;
            //         }
            //         return false;
            //     });
                
            //     if (matchedWindow) {
            //         selectedSource = matchedWindow;
            //         console.log(`找到目标程序窗口: ${selectedSource.name}`);
            //     } else {
            //         console.warn(`未找到目标程序窗口 (应用: ${targetAppName}, 标题: ${targetWindowTitle})`);
            //         console.log('将使用默认选择策略...');
            //     }
            // }
            
            // 如果没有找到指定窗口，使用默认选择策略
            if (!selectedSource) {
                if (screenSources.length > 0) {
                    selectedSource = screenSources[0];  // 备选：选择第一个显示器（主屏幕）
                    console.log(`选择显示器进行共享: ${selectedSource.name}`);
                } else if (windowSources.length > 0) {
                    selectedSource = windowSources[1];   // 优先选择第一个窗口
                    console.log(`选择默认窗口进行共享: ${selectedSource.name}`);
                } else {
                    throw new Error('没有可用的屏幕源');
                }
            }

            // 先获取屏幕流，但不立即创建PeerConnection
            await this.captureScreen(selectedSource.id);

            // 只连接信令服务器，等待观众加入
            await this.connectSignalServer();

            console.log('屏幕共享准备就绪，等待观众加入...');
        } catch (error) {
            console.error('启动屏幕共享失败:', error);
        }
    }

    async handleScreenShareStop(): Promise<void> {
        try {
            await this.cleanup();
            console.log('屏幕共享已停止');
        } catch (error) {
            console.error('停止屏幕共享失败:', error);
        }
    }

    private async captureScreen(sourceId: string): Promise<void> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    // @ts-ignore - Electron 特定的约束
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: 1280,
                        maxWidth: 1920,
                        minHeight: 720,
                        maxHeight: 1080,
                        minFrameRate: 10,
                        maxFrameRate: 30
                    }
                }
            });

            this.localStream = stream;
            console.log('屏幕捕获成功, 流 ID:', stream.id);
        } catch (error) {
            console.error('屏幕捕获失败:', error);
            throw error;
        }
    }

    private async connectSignalServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.signalSocket = new WebSocket(this.config.signalServerUrl);

                this.signalSocket.onopen = () => {
                    console.log('信令服务器连接成功');
                    
                    // 发送加入消息，标识为推流端
                    this.sendSignal({
                        type: 'join',
                        clientType: 'streamer',
                        roomId: this.roomId,
                        streamInfo: {
                            title: '玄策屏幕共享',
                            quality: '1080p',
                            timestamp: new Date().toISOString()
                        }
                    });
                    
                    resolve();
                };

                this.signalSocket.onerror = (error) => {
                    console.error('信令服务器连接失败:', error);
                    reject(error);
                };

                this.signalSocket.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleSignal(message);
                    } catch (error) {
                        console.error('解析信令消息失败:', error);
                    }
                };

                this.signalSocket.onclose = () => {
                    console.log('信令服务器连接已关闭');
                };

            } catch (error) {
                console.error('创建 WebSocket 连接失败:', error);
                reject(error);
            }
        });
    }

    private async handleSignal(message: any): Promise<void> {
        try {
            console.log('收到信令消息:', message.type);

            switch (message.type) {
                case 'welcome':
                    this.clientId = message.clientId;
                    console.log(`已分配客户端ID: ${this.clientId}`);
                    break;
                    
                case 'join-success':
                    console.log(`成功加入房间 ${message.roomId} 作为 ${message.clientType}`);
                    console.log('📺 推流端已就绪，等待观众连接...');
                    break;
                    
                case 'viewer-joined':
                    console.log(`🎯 观众加入: ${message.viewerId}`);
                    this.viewerCount++;
                    console.log(`👥 当前观众数量: ${this.viewerCount}`);
                    
                    // 第一个观众加入时开始推流
                    if (this.viewerCount === 1 && !this.isStreaming) {
                        console.log('🚀 开始推流...');
                        await this.startStreaming();
                    } else if (this.isStreaming) {
                        // 已经在推流，为新观众创建连接
                        await this.createOfferForNewViewer();
                    }
                    break;
                    
                case 'viewer-left':
                    console.log(`👋 观众离开: ${message.viewerId}`);
                    this.viewerCount = Math.max(0, this.viewerCount - 1);
                    console.log(`👥 当前观众数量: ${this.viewerCount}`);
                    
                    // 没有观众时停止推流
                    if (this.viewerCount === 0 && this.isStreaming) {
                        console.log('⏸️ 暂停推流（无观众）...');
                        await this.pauseStreaming();
                    }
                    break;
                    
                case 'answer':
                    await this.handleAnswer(message.sdp);
                    break;
                    
                case 'ice-candidate':
                    await this.handleIceCandidate(message.candidate);
                    break;
                    
                default:
                    console.warn('未知的信令消息类型:', message.type);
            }
        } catch (error) {
            console.error('处理信令消息失败:', error);
        }
    }

    private async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
        if (!this.peerConnection) {
            throw new Error('PeerConnection 未初始化');
        }

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log('SDP Answer 已设置');
    }

    private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (!this.peerConnection) {
            throw new Error('PeerConnection 未初始化');
        }

        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('ICE Candidate 已添加');
    }

    private setupDataChannel(dataChannel: RTCDataChannel): void {
        dataChannel.onopen = () => {
            console.log('鼠标控制数据通道已打开');
        };

        dataChannel.onclose = () => {
            console.log('鼠标控制数据通道已关闭');
        };

        dataChannel.onerror = (error) => {
            console.error('数据通道错误:', error);
        };

        dataChannel.onmessage = (event) => {
            try {
                const mouseEvent = JSON.parse(event.data);
                this.handleMouseEvent(mouseEvent);
            } catch (error) {
                console.error('解析鼠标事件失败:', error);
            }
        };
    }

    private async handleMouseEvent(event: any): Promise<void> {
        try {
            // 通过 IPC 发送给主进程处理
            const result = await (window as any).electronAPI?.sendMouseEvent(event);
            if (!result?.success) {
                console.error('处理鼠标事件失败:', result?.error);
            }
        } catch (error) {
            console.error('发送鼠标事件失败:', error);
        }
    }

    private sendSignal(message: any): void {
        if (this.signalSocket && this.signalSocket.readyState === WebSocket.OPEN) {
            this.signalSocket.send(JSON.stringify(message));
        } else {
            console.error('信令服务器未连接，无法发送消息');
        }
    }

    // 开始推流（仅在有观众时调用）
    private async startStreaming(): Promise<void> {
        try {
            if (this.isStreaming) {
                console.log('已在推流中，跳过重复启动');
                return;
            }

            console.log('🎬 创建WebRTC连接并开始推流...');
            
            // 创建 RTCPeerConnection
            await this.createPeerConnection();
            
            // 创建 SDP Offer
            await this.createOffer();
            
            this.isStreaming = true;
            console.log('✅ 推流已启动');
            
        } catch (error) {
            console.error('启动推流失败:', error);
        }
    }

    // 暂停推流（无观众时调用）
    private async pauseStreaming(): Promise<void> {
        try {
            console.log('⏸️ 暂停推流，释放WebRTC资源...');
            
            // 关闭数据通道
            if (this.dataChannel) {
                this.dataChannel.close();
                this.dataChannel = null;
            }

            // 关闭 PeerConnection（但保留屏幕流）
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }

            this.isStreaming = false;
            console.log('✅ 推流已暂停，屏幕捕获保持活跃');
            
        } catch (error) {
            console.error('暂停推流失败:', error);
        }
    }

    // 为新观众创建连接
    private async createOfferForNewViewer(): Promise<void> {
        try {
            console.log('🔄 为新观众创建连接...');
            // 重新创建 Offer 给新加入的观众
            await this.createOffer();
        } catch (error) {
            console.error('为新观众创建连接失败:', error);
        }
    }

    private async createPeerConnection(): Promise<void> {
        try {
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            console.log('📡 RTCPeerConnection 已创建');

            // 监听连接状态变化
            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection?.connectionState;
                console.log('WebRTC 连接状态变化:', state);
                
                if (state === 'connected') {
                    console.log('🎉 观众连接成功！');
                } else if (state === 'disconnected' || state === 'failed') {
                    console.log('❌ 观众连接断开');
                }
            };

            // 监听 ICE 候选
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate && this.signalSocket) {
                    this.sendSignal({
                        type: 'ice-candidate',
                        candidate: event.candidate
                    });
                }
            };

            // 添加屏幕流到 PeerConnection
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection!.addTrack(track, this.localStream!);
                });
                console.log('🎥 屏幕流已添加到 PeerConnection');
            }

            // 创建数据通道用于鼠标控制
            this.dataChannel = this.peerConnection.createDataChannel('mouseControl', {
                ordered: true
            });

            this.setupDataChannel(this.dataChannel);

        } catch (error) {
            console.error('创建 RTCPeerConnection 失败:', error);
            throw error;
        }
    }

    private async createOffer(): Promise<void> {
        if (!this.peerConnection) {
            throw new Error('PeerConnection 未初始化');
        }

        try {
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false
            });

            await this.peerConnection.setLocalDescription(offer);

            // 发送 Offer 到信令服务器
            this.sendSignal({
                type: 'offer',
                sdp: offer
            });

            console.log('SDP Offer 已发送');
        } catch (error) {
            console.error('创建 SDP Offer 失败:', error);
            throw error;
        }
    }

    private async cleanup(): Promise<void> {
        console.log('🧹 清理所有资源...');
        
        this.isStreaming = false;
        this.viewerCount = 0;
        
        // 关闭数据通道
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        // 关闭 PeerConnection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // 停止本地流
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // 关闭信令连接
        if (this.signalSocket) {
            this.signalSocket.close();
            this.signalSocket = null;
        }

        this.config = null;
        console.log('✅ 所有资源已清理');
    }
}

const App: React.FC = () => {
    const [isShowLoading, setIsShowLoading] = useState(false);
    const [isSandbox, setIsSandbox] = useState(false);
    const [isScreenShareStart, setIsScreenShareStart] = useState(false);
    const [screenShareHandler] = useState(() => new ScreenShareHandler());

    useEffect(() => {
        window.electronAPI.onAccountInitLoading((isShowLoading: boolean) => {
            setIsShowLoading(isShowLoading);
        });
        window.electronAPI.onIsSandbox((isSandbox: boolean) => {
            setIsSandbox(isSandbox);
            if(isSandbox) {
                document.title = '玄策【沙箱环境】'
            } else {
                document.title = '玄策'
            }
        });

        // 监听屏幕共享启动事件
        window.electronAPI.onScreenShareStart((data: any) => {
            console.log('收到屏幕共享启动事件:', data);
            setIsScreenShareStart(true);
            screenShareHandler.handleScreenShareStart(data);
        });

        // 监听屏幕共享停止事件（使用类型断言）
        const api = window.electronAPI as any;
        if (api.onScreenShareStop) {
            api.onScreenShareStop(() => {
                console.log('收到屏幕共享停止事件');
                setIsScreenShareStart(false);
                screenShareHandler.handleScreenShareStop();
            });
        }

        // 监听远程控制事件（使用类型断言）
        if (api.onRemoteControlStarted) {
            api.onRemoteControlStarted(() => {
                console.log('远程控制已启动');
            });
        }

        if (api.onRemoteControlStopped) {
            api.onRemoteControlStopped(() => {
                console.log('远程控制已停止');
            });
        }

        if (api.onRemoteControlError) {
            api.onRemoteControlError((error: any) => {
                console.error('远程控制错误:', error);
            });
        }
    }, [screenShareHandler]);

    return (
        <>
        <Grid container component="div" style={{ height: '100vh', overflow: 'hidden' }}>
            <Grid item style={{ width: '330px' }} component="div">
                <Paper style={{ height: '100vh', padding: '0px', overflow: 'hidden', boxSizing: 'content-box' }}>
                    <AccountManager />
                </Paper>
            </Grid>
            <Grid item style={{ flex: 1 }}>
                <main style={{ height: '100vh', overflow: 'hidden' }}>
                    <AccountInfo />
                </main>
            </Grid>
        </Grid>
        <ToastContainer />
        {isShowLoading && (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                backgroundColor: '#7373B9',
                color: '#ffffff',
                padding: '14px',
                textAlign: 'center',
                fontSize: '15px',
                fontWeight: 600,
                letterSpacing: '0.5px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
            }}>
                正在准备任务执行环境，请耐心等待，勿手动操作
                <CircularProgress size={20} style={{ color: 'white' }} />
            </div>
        )}
        {/* {isScreenShareStart && (
            <div style={{
                position: 'fixed',
                top: '0px',
                right: '16px',
                backgroundColor: '#4CAF50',
                color: '#ffffff',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                boxShadow: '0 3px 8px rgba(0,0,0,0.25)',
                zIndex: 9998,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                minWidth: '180px',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.2)'
            }}>
                <span style={{ fontSize: '14px' }}>🖥️</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, lineHeight: '1.2' }}>屏幕共享已启动</div>
                    <div style={{ fontSize: '10px', opacity: 0.85, lineHeight: '1.1' }}>支持远程鼠标控制</div>
                </div>
                <div style={{
                    width: '5px',
                    height: '5px',
                    backgroundColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'blink 1.5s infinite',
                    marginLeft: 'auto'
                }}></div>
            </div>
        )} */}
        <style>{`
            @keyframes blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0.3; }
            }
        `}</style>
        </>
    );
};

export default App;