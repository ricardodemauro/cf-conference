// Simple Conference App - WebRTC Implementation
class ConferenceApp {
    constructor() {
        this.localVideo = null;
        this.remoteVideo = null;
        this.localStream = null;
        this.peerConnection = null;
        this.isInitiator = false;
        this.isStarted = false;
        this.peerId = crypto.randomUUID();
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
        await this.setupCamera();
        this.join();
        this.startPolling();
        this.setupUI();
    }

    async setupCamera() {
        try {
            this.localVideo = document.getElementById('local');
            this.remoteVideo = document.getElementById('remote');
            
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });

            this.localVideo.srcObject = this.localStream;
            this.localVideo.muted = true;
            
            console.log('Camera ready');

        } catch (error) {
            console.error('Camera error:', error);
        }
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
            this.isInitiator = data.isInitiator;
            
            console.log('Joined. Initiator:', this.isInitiator);

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
        const controls = document.createElement('div');
        controls.innerHTML = `
            <div style="text-align: center; margin: 20px 0;">
                <button id="connect" style="
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    font-size: 16px;
                    cursor: pointer;
                ">Connect</button>
            </div>
        `;
        
        container.appendChild(controls);
        
        document.getElementById('connect').addEventListener('click', () => this.connect());
    }

    async connect() {
        if (this.isStarted || !this.localStream) return;

        this.createPeerConnection();
        this.isStarted = true;
        
        if (this.isInitiator) {
            this.makeOffer();
        }
        
        document.getElementById('connect').textContent = 'Connecting...';
        document.getElementById('connect').disabled = true;
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.pcConfig);
        
        // Add local stream
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });
        
        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            this.remoteVideo.srcObject = event.streams[0];
            document.getElementById('connect').textContent = 'Connected!';
            console.log('Connected!');
            
            // Clean up polling interval once connected
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = null;
                console.log('Polling stopped - connection established');
            }
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
    }

    async makeOffer() {
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        
        this.sendMessage({
            type: 'offer',
            offer: offer
        });
    }

    async handleMessage(message) {
        try {
            // Parse the data if it's a JSON string
            const messageData = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
            
            if (message.type === 'offer' && !this.isInitiator) {
                if (!this.isStarted) {
                    this.createPeerConnection();
                    this.isStarted = true;
                    document.getElementById('connect').textContent = 'Connecting...';
                    document.getElementById('connect').disabled = true;
                }
                
                await this.peerConnection.setRemoteDescription(messageData);
                
                // Process any queued ICE candidates
                await this.processQueuedCandidates();
                
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                
                this.sendMessage({
                    type: 'answer',
                    answer: answer
                });
                
            } else if (message.type === 'answer' && this.isInitiator) {
                await this.peerConnection.setRemoteDescription(messageData);
                
                // Process any queued ICE candidates
                await this.processQueuedCandidates();
                
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
                data: message.offer || message.answer || message.candidate
            })
        }).catch(error => console.error('Send error:', error));
    }
}

// Start the app
new ConferenceApp();    