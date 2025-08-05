// Host-only Conference App - Receives video streams without camera
class HostApp {
    constructor() {
        this.remoteVideo = null;
        this.peerConnection = null;
        this.isStarted = false;
        this.peerId = 'HOST_' + crypto.randomUUID();
        this.lastMessageTimestamp = 0;
        this.interval = false;
        this.candidateQueue = []; // Queue for ICE candidates
        
        // WebRTC configuration
        this.pcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };
        
        this.init();
    }

    async init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    async setup() {
        this.setupVideo();
        this.join();
        this.startPolling();
        this.setupUI();
    }

    setupVideo() {
        this.remoteVideo = document.getElementById('remote');
        console.log('Host ready - waiting for remote streams');
    }

    async join() {
        try {
            const response = await fetch('/signaling', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'join',
                    peerId: this.peerId
                })
            });

            const data = await response.json();
            console.log('Host joined. Will always be initiator for incoming connections');

        } catch (error) {
            console.error('Join error:', error);
        }
    }

    startPolling() {
        this.interval = setInterval(async () => {
            try {
                const response = await fetch(`/messages?peerId=${this.peerId}&since=${this.lastMessageTimestamp}`);
                const data = await response.json();

                if (data.messages?.length > 0) {
                    for (const message of data.messages) {
                        await this.handleMessage(message);
                    }
                }

                this.lastMessageTimestamp = data.timestamp;
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 1000);
    }

    setupUI() {
        const container = document.querySelector('.container');
        const status = document.createElement('div');
        status.innerHTML = `
            <div style="text-align: center; margin: 20px 0;">
                <div id="status" style="
                    background: #28a745;
                    color: white;
                    padding: 12px 24px;
                    border-radius: 6px;
                    font-size: 16px;
                    display: inline-block;
                ">Host Ready - Waiting for connections</div>
            </div>
        `;
        
        container.appendChild(status);
        
        // Automatically start accepting connections
        this.startHosting();
    }

    async startHosting() {
        console.log('Host is ready to accept connections');
        document.getElementById('status').textContent = 'Host Active - Ready for guests';
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.pcConfig);
        
        // Host doesn't add local stream - only receives
        
        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            console.log('Received remote stream');
            this.remoteVideo.srcObject = event.streams[0];
            document.getElementById('status').textContent = 'Connected - Receiving stream';
            document.getElementById('status').style.background = '#007bff';
        };
        
        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendMessage({
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'disconnected' || 
                this.peerConnection.connectionState === 'failed') {
                document.getElementById('status').textContent = 'Connection lost - Waiting for reconnection';
                document.getElementById('status').style.background = '#dc3545';
                this.remoteVideo.srcObject = null;
            }
        };
    }

    async handleMessage(message) {
        try {
            // Parse the data if it's a JSON string
            const messageData = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
            
            if (message.type === 'offer') {
                console.log('Received offer from guest');
                
                if (!this.isStarted) {
                    this.createPeerConnection();
                    this.isStarted = true;
                    document.getElementById('status').textContent = 'Connecting...';
                    document.getElementById('status').style.background = '#ffc107';
                }
                
                await this.peerConnection.setRemoteDescription(messageData);
                
                // Process any queued ICE candidates
                await this.processQueuedCandidates();
                
                // Create answer (host responds to guest's offer)
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                
                this.sendMessage({
                    type: 'answer',
                    answer: answer
                });
                
            } else if (message.type === 'candidate') {
                if (this.peerConnection && this.peerConnection.remoteDescription) {
                    // Remote description is set, add candidate immediately
                    await this.peerConnection.addIceCandidate(messageData);
                } else if (this.peerConnection) {
                    // Queue candidate until remote description is set
                    this.candidateQueue.push(messageData);
                    console.log('Queued ICE candidate - waiting for remote description');
                } else {
                    console.log('Ignoring ICE candidate - no peer connection yet');
                }
            }
        } catch (error) {
            console.error('Message error:', error);
        }
    }

    async processQueuedCandidates() {
        while (this.candidateQueue.length > 0) {
            const candidate = this.candidateQueue.shift();
            try {
                await this.peerConnection.addIceCandidate(candidate);
                console.log('Added queued ICE candidate');
            } catch (error) {
                console.error('Error adding queued candidate:', error);
            }
        }
    }

    sendMessage(message) {
        fetch('/signaling', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: message.type,
                peerId: this.peerId,
                data: message.answer || message.candidate
            })
        }).catch(error => console.error('Send error:', error));
    }
}

// Start the host app
new HostApp();
