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
        this.codecMonitor = new CodecMonitor(); // Codec monitoring utility
        
        // WebRTC configuration - will be updated with dynamic TURN credentials
        this.pcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' } // STUN fallback
            ],
            iceCandidatePoolSize: 10
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
        await this.fetchTurnCredentials(); // Get dynamic TURN credentials
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
                    width: { ideal: 1280, max: 1280 }, 
                    height: { ideal: 720, max: 720 },
                    frameRate: { ideal: 24, max: 30 }, // Optimize frame rate
                    facingMode: 'user'
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
        let pollInterval = 1000; // Start with 1 second
        const maxInterval = 5000; // Max 5 seconds
        let consecutiveEmptyPolls = 0;
        
        this.interval = setInterval(async () => {
            try {
                const response = await fetch(`/messages?peerId=${this.peerId}&since=${this.lastMessageTimestamp}`);
                const data = await response.json();

                // Handle both old and new response formats
                const messages = data.messages || data.m || [];
                const timestamp = data.timestamp || data.t;

                if (messages.length > 0) {
                    consecutiveEmptyPolls = 0;
                    pollInterval = 1000; // Reset to fast polling when active
                    
                    for (const message of messages) {
                        await this.handleMessage(message);
                    }
                } else {
                    consecutiveEmptyPolls++;
                    // Gradually increase polling interval when inactive
                    if (consecutiveEmptyPolls > 3 && pollInterval < maxInterval) {
                        pollInterval = Math.min(pollInterval * 1.5, maxInterval);
                        clearInterval(this.interval);
                        this.startPollingWithInterval(pollInterval);
                        return;
                    }
                }

                this.lastMessageTimestamp = timestamp;
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, pollInterval);
    }
    
    startPollingWithInterval(interval) {
        this.interval = setInterval(async () => {
            try {
                const response = await fetch(`/messages?peerId=${this.peerId}&since=${this.lastMessageTimestamp}`);
                const data = await response.json();

                // Handle both old and new response formats
                const messages = data.messages || data.m || [];
                const timestamp = data.timestamp || data.t;

                if (messages.length > 0) {
                    // Switch back to fast polling
                    clearInterval(this.interval);
                    this.startPolling();
                    return;
                }

                this.lastMessageTimestamp = timestamp;
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, interval);
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
                <div id="codec-info" style="
                    margin-top: 10px;
                    padding: 8px 12px;
                    background: #f8f9fa;
                    border-radius: 4px;
                    font-size: 12px;
                    color: #666;
                    border: 1px solid #dee2e6;
                    display: none;
                ">
                    <strong>📊 Codec Information:</strong><br>
                    <span id="codec-details">Detecting...</span>
                </div>
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
        
        // Add local stream with optimized encoding
        this.localStream.getTracks().forEach(track => {
            const sender = this.peerConnection.addTrack(track, this.localStream);
            
            // Optimize video encoding parameters
            if (track.kind === 'video') {
                // Set codec preferences before optimizing sender
                setTimeout(() => this.optimizeVideoSender(sender), 100);
            }
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
                    
                    // Show codec info panel
                    const codecInfoDiv = document.getElementById('codec-info');
                    if (codecInfoDiv) {
                        codecInfoDiv.style.display = 'block';
                    }
                    
                    // Start codec monitoring
                    this.codecMonitor.startMonitoring(this.peerConnection, 'client');
                    
                    // Update codec info after a short delay
                    setTimeout(() => this.updateCodecDisplay(), 3000);
                    
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

    async fetchTurnCredentials() {
        try {
            console.log('Fetching TURN credentials...');
            
            const response = await fetch('/turn-credentials', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ttl: 86400 }) // 24 hours
            });

            if (response.ok) {
                const turnData = await response.json();
                
                // Update pcConfig with dynamic TURN credentials
                if (turnData.iceServers && turnData.iceServers.length > 0) {
                    // Keep STUN servers and add dynamic TURN servers
                    this.pcConfig.iceServers = [
                        { urls: 'stun:stun.l.google.com:19302' }, // STUN fallback
                        ...turnData.iceServers
                    ];
                    console.log('Updated WebRTC config with dynamic TURN credentials');
                } else {
                    console.warn('No ICE servers received from TURN API');
                }
            } else {
                console.warn('Failed to fetch TURN credentials, using STUN only');
            }
        } catch (error) {
            console.error('Error fetching TURN credentials:', error);
            console.log('Falling back to STUN-only configuration');
        }
    }

    async optimizeVideoSender(sender) {
        try {
            // First, try to set preferred codec to AV1 for maximum compression
            await this.setPreferredCodec();
            
            // Get current encoding parameters
            const params = sender.getParameters();
            
            if (params.encodings && params.encodings.length > 0) {
                // Optimize encoding settings for better compression with AV1
                params.encodings[0].maxBitrate = 400000; // 400 kbps max (AV1 is more efficient)
                params.encodings[0].maxFramerate = 24;
                params.encodings[0].scaleResolutionDownBy = 1;
                
                // AV1-specific optimizations
                if (this.isAV1Supported()) {
                    params.encodings[0].maxBitrate = 300000; // Even lower bitrate with AV1
                    console.log('Using AV1 codec with optimized low bitrate');
                } else {
                    console.log('AV1 not supported, using fallback codec optimization');
                }
                
                // Apply the optimized parameters
                await sender.setParameters(params);
                console.log('Applied video encoding optimizations');
            }
        } catch (error) {
            console.error('Error optimizing video encoding:', error);
        }
    }

    async setPreferredCodec() {
        try {
            const transceivers = this.peerConnection.getTransceivers();
            const videoTransceiver = transceivers.find(t => t.sender && t.sender.track && t.sender.track.kind === 'video');
            
            if (videoTransceiver) {
                const capabilities = RTCRtpSender.getCapabilities('video');
                if (capabilities && capabilities.codecs) {
                    // Prioritize codecs by efficiency: AV1 > VP9 > VP8 > H.264
                    const preferredCodecs = [
                        'AV01', // AV1
                        'VP9',  // VP9
                        'VP8',  // VP8
                        'H264'  // H.264 (fallback)
                    ];
                    
                    const availableCodecs = capabilities.codecs.filter(codec => 
                        preferredCodecs.some(preferred => 
                            codec.mimeType.toUpperCase().includes(preferred)
                        )
                    );
                    
                    // Sort by preference
                    availableCodecs.sort((a, b) => {
                        const aIndex = preferredCodecs.findIndex(preferred => 
                            a.mimeType.toUpperCase().includes(preferred)
                        );
                        const bIndex = preferredCodecs.findIndex(preferred => 
                            b.mimeType.toUpperCase().includes(preferred)
                        );
                        return aIndex - bIndex;
                    });
                    
                    if (availableCodecs.length > 0) {
                        const selectedCodec = availableCodecs[0];
                        console.log(`Selected video codec: ${selectedCodec.mimeType}`);
                        
                        // Set codec preferences
                        await videoTransceiver.setCodecPreferences(availableCodecs);
                        
                        return selectedCodec;
                    }
                }
            }
        } catch (error) {
            console.error('Error setting codec preferences:', error);
        }
        return null;
    }

    isAV1Supported() {
        try {
            const capabilities = RTCRtpSender.getCapabilities('video');
            return capabilities && capabilities.codecs && 
                   capabilities.codecs.some(codec => 
                       codec.mimeType.toUpperCase().includes('AV01')
                   );
        } catch (error) {
            return false;
        }
    }

    async updateCodecDisplay() {
        const codecDetailsSpan = document.getElementById('codec-details');
        if (!codecDetailsSpan) return;

        try {
            const sendingCodec = await this.codecMonitor.detectSendingCodec(this.peerConnection);
            if (sendingCodec) {
                const codecName = this.codecMonitor.getCodecName(sendingCodec.mimeType);
                const bitrate = Math.round(sendingCodec.bitrate / 1000);
                const efficiency = this.codecMonitor.getCompressionEfficiency();
                
                codecDetailsSpan.innerHTML = `
                    <strong>Codec:</strong> ${codecName}<br>
                    <strong>Bitrate:</strong> ${bitrate} kbps<br>
                    <strong>Efficiency:</strong> ${efficiency}<br>
                    <strong>Frames Sent:</strong> ${sendingCodec.framesSent || 0}
                `;
            } else {
                codecDetailsSpan.innerHTML = 'Unable to detect codec information';
            }
        } catch (error) {
            console.error('Error updating codec display:', error);
            codecDetailsSpan.innerHTML = 'Error retrieving codec information';
        }
    }
}

// Start the client app
new ClientApp();