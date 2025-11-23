/**
 * 渲染进程屏幕共享处理器
 * 处理主进程发来的屏幕源，建立 WebRTC 连接
 */

interface ScreenSource {
    id: string;
    name: string;
    thumbnail: any;
}

interface ScreenShareConfig {
    signalServerUrl: string;
}

class RendererScreenShareManager {
    private peerConnection: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;
    private localStream: MediaStream | null = null;
    private signalSocket: WebSocket | null = null;
    private config: ScreenShareConfig | null = null;

    constructor() {
        this.setupIpcListeners();
    }

    /**
     * 设置 IPC 监听器
     */
    private setupIpcListeners(): void {
        // 监听屏幕共享启动事件
        (window as any).electronAPI?.onScreenShareStart((data: { sources: ScreenSource[], config: ScreenShareConfig }) => {
            this.handleScreenShareStart(data.sources, data.config);
        });

        // 监听屏幕共享停止事件
        (window as any).electronAPI?.onScreenShareStop(() => {
            this.handleScreenShareStop();
        });
    }

    /**
     * 处理屏幕共享启动
     */
    private async handleScreenShareStart(sources: ScreenSource[], config: ScreenShareConfig): Promise<void> {
        try {
            console.log('收到屏幕共享启动请求，屏幕源数量:', sources.length);
            this.config = config;

            // 选择第一个屏幕源（通常是主屏幕）
            const primaryScreen = sources[0];
            if (!primaryScreen) {
                throw new Error('没有可用的屏幕源');
            }

            // 获取屏幕流
            await this.captureScreen(primaryScreen.id);

            // 创建 RTCPeerConnection
            await this.createPeerConnection();

            // 连接信令服务器
            await this.connectSignalServer();

            // 创建 SDP Offer
            await this.createOffer();

            console.log('屏幕共享启动成功');
        } catch (error) {
            console.error('启动屏幕共享失败:', error);
        }
    }

    /**
     * 处理屏幕共享停止
     */
    private async handleScreenShareStop(): Promise<void> {
        try {
            await this.cleanup();
            console.log('屏幕共享已停止');
        } catch (error) {
            console.error('停止屏幕共享失败:', error);
        }
    }

    /**
     * 捕获屏幕流
     */
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

    /**
     * 创建 RTCPeerConnection
     */
    private async createPeerConnection(): Promise<void> {
        try {
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            // 监听连接状态变化
            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection?.connectionState;
                console.log('WebRTC 连接状态变化:', state);
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
                console.log('屏幕流已添加到 PeerConnection');
            }

            // 创建数据通道用于鼠标控制
            this.dataChannel = this.peerConnection.createDataChannel('mouseControl', {
                ordered: true
            });

            this.setupDataChannel(this.dataChannel);

            console.log('RTCPeerConnection 创建成功');
        } catch (error) {
            console.error('创建 RTCPeerConnection 失败:', error);
            throw error;
        }
    }

    /**
     * 连接信令服务器
     */
    private async connectSignalServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.signalSocket = new WebSocket(this.config!.signalServerUrl);

                this.signalSocket.onopen = () => {
                    console.log('信令服务器连接成功');
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

    /**
     * 创建 SDP Offer
     */
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

    /**
     * 信令处理函数
     */
    private async handleSignal(message: any): Promise<void> {
        try {
            console.log('收到信令消息:', message.type);

            switch (message.type) {
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

    /**
     * 处理 SDP Answer
     */
    private async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
        if (!this.peerConnection) {
            throw new Error('PeerConnection 未初始化');
        }

        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log('SDP Answer 已设置');
    }

    /**
     * 处理 ICE Candidate
     */
    private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (!this.peerConnection) {
            throw new Error('PeerConnection 未初始化');
        }

        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('ICE Candidate 已添加');
    }

    /**
     * 设置数据通道 - 处理远程鼠标事件
     */
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

    /**
     * 处理远程鼠标事件
     */
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

    /**
     * 发送信令消息
     */
    private sendSignal(message: any): void {
        if (this.signalSocket && this.signalSocket.readyState === WebSocket.OPEN) {
            this.signalSocket.send(JSON.stringify(message));
        } else {
            console.error('信令服务器未连接，无法发送消息');
        }
    }

    /**
     * 清理资源
     */
    private async cleanup(): Promise<void> {
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
    }
}

// 在渲染进程中初始化屏幕共享管理器
export const rendererScreenShareManager = new RendererScreenShareManager(); 