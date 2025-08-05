// Client App - Sends video to host only (no receiving)
class ClientApp {
    constructor() {
        this.localVideo = null;
        this.localStream = null;
        this.peerConnection = null;
        this.isStarted = false;
        this.peerId = 'GUEST_' + crypto.randomUUID();
        this.lastMessageTimestamp = 0;
        this.interval = false;
        this.candidateQueue = []; // Queue for ICE candidates
        this.availableCameras = []; // List of available video devices
        this.currentCameraId = null; // Currently selected camera
        
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
        await this.loadAvailableCameras();
        await this.setupCamera();
        this.join();
        this.startPolling();
        this.setupUI();
    }

    async loadAvailableCameras() {
        try {
            // Request permission first to get device labels
            await navigator.mediaDevices.getUserMedia({ video: true });
            
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras = devices.filter(device => device.kind === 'videoinput');
            
            console.log('Available cameras:', this.availableCameras.length);
            
            // Select the first camera as default if none selected
            if (this.availableCameras.length > 0 && !this.currentCameraId) {
                this.currentCameraId = this.availableCameras[0].deviceId;
            }
            
        } catch (error) {
            console.error('Error loading cameras:', error);
        }
    }

    async setupCamera() {
        try {
            this.localVideo = document.getElementById('local');
            
            // Stop existing stream if any
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            const constraints = {
                video: { 
                    width: { ideal: 1280 }, 
                    height: { ideal: 720 }
                },
                audio: false
            };
            
            // Use specific camera if selected
            if (this.currentCameraId) {
                constraints.video.deviceId = { exact: this.currentCameraId };
            }
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.localVideo.srcObject = this.localStream;
            this.localVideo.muted = true;
            
            console.log('Camera ready:', this.currentCameraId || 'default');
            
            // Update video tracks in peer connection if already connected
            if (this.peerConnection && this.isStarted) {
                await this.updateVideoTrack();
            }

        } catch (error) {
            console.error('Camera error:', error);
            
            // Fallback to default camera if specific camera fails
            if (this.currentCameraId) {
                console.log('Falling back to default camera');
                this.currentCameraId = null;
                await this.setupCamera();
            }
        }
    }

    async updateVideoTrack() {
        try {
            const videoTrack = this.localStream.getVideoTracks()[0];
            const sender = this.peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            
            if (sender && videoTrack) {
                await sender.replaceTrack(videoTrack);
                console.log('Updated video track in peer connection');
            }
        } catch (error) {
            console.error('Error updating video track:', error);
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
            console.log('Client joined - ready to send video to host');

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
                <div style="margin-bottom: 15px;">
                    <label for="camera-select" style="
                        display: inline-block;
                        margin-right: 10px;
                        font-weight: bold;
                        color: #333;
                    ">Camera:</label>
                    <select id="camera-select" style="
                        padding: 8px 12px;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        font-size: 14px;
                        min-width: 200px;
                        margin-right: 10px;
                    ">
                        <option value="">Loading cameras...</option>
                    </select>
                    <button id="refresh-cameras" style="
                        background: #6c757d;
                        color: white;
                        border: none;
                        padding: 8px 12px;
                        border-radius: 4px;
                        font-size: 14px;
                        cursor: pointer;
                    ">Refresh</button>
                </div>
                <button id="connect" style="
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 6px;
                    font-size: 16px;
                    cursor: pointer;
                ">Send Video to Host</button>
                <div id="status" style="
                    margin-top: 10px;
                    color: #666;
                    font-size: 14px;
                ">Ready to connect</div>
            </div>
        `;
        
        container.appendChild(controls);
        
        // Setup event listeners
        document.getElementById('connect').addEventListener('click', () => this.connect());
        document.getElementById('camera-select').addEventListener('change', (e) => this.changeCamera(e.target.value));
        document.getElementById('refresh-cameras').addEventListener('click', () => this.refreshCameras());
        
        // Populate camera dropdown
        this.updateCameraDropdown();
    }

    updateCameraDropdown() {
        const select = document.getElementById('camera-select');
        if (!select) return;
        
        select.innerHTML = '';
        
        if (this.availableCameras.length === 0) {
            select.innerHTML = '<option value="">No cameras found</option>';
            return;
        }
        
        this.availableCameras.forEach(camera => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.textContent = camera.label || `Camera ${camera.deviceId.substring(0, 8)}`;
            option.selected = camera.deviceId === this.currentCameraId;
            select.appendChild(option);
        });
    }

    async changeCamera(deviceId) {
        if (!deviceId || deviceId === this.currentCameraId) return;
        
        this.currentCameraId = deviceId;
        console.log('Switching to camera:', deviceId);
        
        // Update status
        const statusDiv = document.getElementById('status');
        if (statusDiv && !this.isStarted) {
            statusDiv.textContent = 'Switching camera...';
        }
        
        await this.setupCamera();
        
        // Update status back
        if (statusDiv && !this.isStarted) {
            statusDiv.textContent = 'Ready to connect';
        }
    }

    async refreshCameras() {
        console.log('Refreshing camera list...');
        
        const refreshButton = document.getElementById('refresh-cameras');
        if (refreshButton) {
            refreshButton.textContent = 'Refreshing...';
            refreshButton.disabled = true;
        }
        
        await this.loadAvailableCameras();
        this.updateCameraDropdown();
        
        if (refreshButton) {
            refreshButton.textContent = 'Refresh';
            refreshButton.disabled = false;
        }
    }

    async connect() {
        if (this.isStarted || !this.localStream) return;

        this.createPeerConnection();
        this.isStarted = true;
        
        // Client always makes the offer to host
        this.makeOffer();
        
        document.getElementById('connect').textContent = 'Connecting to Host...';
        document.getElementById('connect').disabled = true;
        document.getElementById('status').textContent = 'Establishing connection...';
    }

    createPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.pcConfig);
        
        // Add local stream (send video to host)
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });
        
        // No ontrack handler - client doesn't receive video
        
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
            
            const connectButton = document.getElementById('connect');
            const statusDiv = document.getElementById('status');
            
            switch (this.peerConnection.connectionState) {
                case 'connected':
                    connectButton.textContent = 'Connected to Host!';
                    connectButton.style.background = '#28a745';
                    statusDiv.textContent = 'Successfully sending video to host';
                    statusDiv.style.color = '#28a745';
                    
                    // Stop polling once connected
                    if (this.interval) {
                        clearInterval(this.interval);
                        this.interval = null;
                        console.log('Polling stopped - connection established');
                    }
                    break;
                    
                case 'connecting':
                    statusDiv.textContent = 'Connecting to host...';
                    statusDiv.style.color = '#ffc107';
                    break;
                    
                case 'disconnected':
                case 'failed':
                    connectButton.textContent = 'Connection Failed';
                    connectButton.style.background = '#dc3545';
                    connectButton.disabled = false;
                    statusDiv.textContent = 'Connection lost - click to retry';
                    statusDiv.style.color = '#dc3545';
                    break;
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
            
            if (message.type === 'answer') {
                // Client receives answer from host
                console.log('Received answer from host');
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

// Start the client app
new ClientApp();    