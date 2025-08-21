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
        this.smoothnessMonitor = null; // Will be initialized when connection starts

        this.baseAddress = 'https://conf.rmauro.dev';

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

    async detectDeviceCapabilities() {
        // Detect device performance and optimal settings for smoothness
        const capabilities = {
            optimalFrameRate: 30,
            supportsVariableFrameRate: false,
            isHighPerformanceDevice: false,
            recommendedBitrate: 1000000 // 1 Mbps default
        };

        try {
            // Performance detection
            const startTime = performance.now();
            let iterations = 0;
            const testDuration = 50; // 50ms test

            while (performance.now() - startTime < testDuration) {
                Math.random() * Math.random();
                iterations++;
            }

            const performanceScore = iterations / 1000;
            capabilities.isHighPerformanceDevice = performanceScore > 30;

            // Set optimal frame rate based on device capability
            if (capabilities.isHighPerformanceDevice) {
                capabilities.optimalFrameRate = 30; // High-end: smooth 30fps
                capabilities.supportsVariableFrameRate = true;
                capabilities.recommendedBitrate = 1500000; // 1.5 Mbps
                console.log('🚀 High-performance device detected - enabling premium settings');
            } else {
                capabilities.optimalFrameRate = 24; // Lower-end: stable 24fps
                capabilities.recommendedBitrate = 800000; // 800 kbps
                console.log('📱 Standard device detected - optimizing for stability');
            }

            // iOS specific adjustments for smoothness
            if (this.detectIOS()) {
                // iPhone-optimized codec priority: VP9 > H.264 > VP8 (avoid AV1)
                console.log('🍎 iPhone detected - using iOS-optimized codec selection with VP9 priority');
                capabilities.preferredCodecs = [
                    'VP9',  // Primary: Excellent compression with good iOS support (iOS 14.3+)
                    'H264', // Secondary: Best performance and battery life on iOS
                    'VP8'   // Fallback: Good compatibility
                    // Avoid AV1 on iOS - no hardware support, poor performance
                ];
            } else {
                // Desktop/Android: VP9 first for optimal balance
                console.log('🖥️ Desktop/Android detected - using VP9-first optimization');
                capabilities.preferredCodecs = [
                    'VP9',  // Primary: Excellent compression + broad support
                    'AV01', // Secondary: Maximum compression (desktop/Android)
                    'VP8',  // Tertiary: Good compression
                    'H264'  // Fallback: Universal compatibility
                ];
            }            // Check screen refresh rate hints
            if (window.screen && window.screen.refreshRate) {
                const refreshRate = window.screen.refreshRate;
                if (refreshRate >= 120) {
                    capabilities.optimalFrameRate = Math.min(30, refreshRate / 4); // High refresh screens
                    console.log(`📺 High refresh rate display (${refreshRate}Hz) detected`);
                }
            }

        } catch (error) {
            console.error('Error detecting device capabilities:', error);
        }

        return capabilities;
    }

    async setupCamera() {
        try {
            this.localVideo = document.getElementById('local');

            // Stop existing stream if any
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }

            // Detect device capabilities for optimal settings
            const deviceCapabilities = await this.detectDeviceCapabilities();

            const constraints = {
                video: {
                    // MAXIMUM QUALITY settings - prioritize resolution and smoothness
                    width: { ideal: 1920, max: 1920 },   // Full HD width
                    height: { ideal: 1080, max: 1080 },  // Full HD height
                    frameRate: {
                        ideal: deviceCapabilities.optimalFrameRate,
                        min: Math.max(20, deviceCapabilities.optimalFrameRate - 6),   // Minimum for smoothness
                        max: Math.min(60, deviceCapabilities.optimalFrameRate + 15)   // Allow higher if supported
                    },
                    facingMode: 'user'
                },
                audio: false
            };

            console.log(`🎥 SMOOTH + QUALITY MODE - Using Full HD 1080p @ ${deviceCapabilities.optimalFrameRate}fps (device-optimized)`);

            // Advanced quality optimizations if supported
            if (navigator.mediaDevices.getSupportedConstraints) {
                const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();

                // Enable advanced video features for maximum quality
                if (supportedConstraints.aspectRatio) {
                    constraints.video.aspectRatio = { ideal: 16 / 9 }; // Perfect widescreen ratio
                }

                if (supportedConstraints.resizeMode) {
                    constraints.video.resizeMode = 'none'; // No automatic downscaling
                }

                // Advanced quality controls
                if (supportedConstraints.focusMode) {
                    constraints.video.focusMode = 'continuous'; // Auto-focus for sharpness
                }

                if (supportedConstraints.exposureMode) {
                    constraints.video.exposureMode = 'continuous'; // Auto-exposure for best lighting
                }

                if (supportedConstraints.whiteBalanceMode) {
                    constraints.video.whiteBalanceMode = 'continuous'; // Auto white balance
                }

                console.log('� Advanced camera controls enabled for maximum quality');
            }

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
            const response = await fetch(this.baseAddress + '/signaling', {
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
                const response = await fetch(this.baseAddress + `/messages?peerId=${this.peerId}&since=${this.lastMessageTimestamp}`);
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
                const response = await fetch(this.baseAddress + `/messages?peerId=${this.peerId}&since=${this.lastMessageTimestamp}`);
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

                    // Start smoothness monitoring for real-time adjustments
                    this.smoothnessMonitor = new SmoothnessMonitor(this.peerConnection);
                    this.smoothnessMonitor.startMonitoring();

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

                    // Stop monitoring on disconnect
                    if (this.smoothnessMonitor) {
                        this.smoothnessMonitor.stopMonitoring();
                        this.smoothnessMonitor = null;
                    }
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
        fetch(this.baseAddress + '/signaling', {
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

            const response = await fetch(this.baseAddress + '/turn-credentials', {
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
            // First, try to set preferred codec for maximum compression
            const selectedCodec = await this.setPreferredCodec();

            // Get device capabilities for smoothness optimization
            const deviceCapabilities = await this.detectDeviceCapabilities();

            // Get current encoding parameters
            const params = sender.getParameters();

            if (params.encodings && params.encodings.length > 0) {
                console.log('🎯 SMOOTH + COMPRESSED MODE - Optimizing for best quality and smooth streaming');

                if (selectedCodec) {
                    const codecType = this.getCodecType(selectedCodec.mimeType);

                    // Smooth compression settings - balance compression with device performance
                    const baseMultiplier = deviceCapabilities.isHighPerformanceDevice ? 1.2 : 0.8;

                    switch (codecType) {
                        case 'VP9':
                            // VP9: PRIMARY CHOICE - Great compression with excellent compatibility
                            params.encodings[0].maxBitrate = Math.round(650000 * baseMultiplier); // 520-780 kbps
                            params.encodings[0].maxFramerate = deviceCapabilities.optimalFrameRate;
                            params.encodings[0].minBitrate = Math.round(350000 * baseMultiplier);
                            console.log(`🥇 VP9 PRIMARY: ${params.encodings[0].maxBitrate / 1000}kbps @ ${deviceCapabilities.optimalFrameRate}fps (PREFERRED)`);
                            break;

                        case 'AV1':
                            // AV1: Maximum compression for capable devices
                            params.encodings[0].maxBitrate = Math.round(500000 * baseMultiplier); // 400-600 kbps
                            params.encodings[0].maxFramerate = deviceCapabilities.optimalFrameRate;
                            params.encodings[0].minBitrate = Math.round(250000 * baseMultiplier);
                            console.log(`🏆 AV1 MAXIMUM: ${params.encodings[0].maxBitrate / 1000}kbps @ ${deviceCapabilities.optimalFrameRate}fps`);
                            break;

                        case 'VP8':
                            // VP8: Good compression, reliable fallback
                            params.encodings[0].maxBitrate = Math.round(850000 * baseMultiplier); // 680-1020 kbps
                            params.encodings[0].maxFramerate = deviceCapabilities.optimalFrameRate;
                            params.encodings[0].minBitrate = Math.round(450000 * baseMultiplier);
                            console.log(`🥉 VP8 RELIABLE: ${params.encodings[0].maxBitrate / 1000}kbps @ ${deviceCapabilities.optimalFrameRate}fps`);
                            break;

                        case 'H.264':
                            // H.264: Universal compatibility, higher bitrate needed
                            params.encodings[0].maxBitrate = Math.round(1100000 * baseMultiplier); // 880-1320 kbps
                            params.encodings[0].maxFramerate = deviceCapabilities.optimalFrameRate;
                            params.encodings[0].minBitrate = Math.round(600000 * baseMultiplier);
                            console.log(`📊 H.264 UNIVERSAL: ${params.encodings[0].maxBitrate / 1000}kbps @ ${deviceCapabilities.optimalFrameRate}fps`);
                            break;

                        default:
                            // Fallback smooth settings
                            params.encodings[0].maxBitrate = Math.round(800000 * baseMultiplier);
                            params.encodings[0].maxFramerate = deviceCapabilities.optimalFrameRate;
                            params.encodings[0].minBitrate = Math.round(400000 * baseMultiplier);
                            console.log(`⚙️ FALLBACK SMOOTH: ${params.encodings[0].maxBitrate / 1000}kbps @ ${deviceCapabilities.optimalFrameRate}fps`);
                    }

                    // Advanced encoding optimizations for smooth streaming
                    params.encodings[0].scaleResolutionDownBy = 1; // Full resolution

                    // Smoothness-first optimizations
                    if (params.encodings[0].hasOwnProperty('priority')) {
                        params.encodings[0].priority = 'high'; // High priority for smooth delivery
                    }

                    if (params.encodings[0].hasOwnProperty('networkPriority')) {
                        params.encodings[0].networkPriority = 'high'; // Network priority for smoothness
                    }

                    // Enable adaptive streaming for better smoothness
                    if (params.encodings[0].hasOwnProperty('adaptivePtime')) {
                        params.encodings[0].adaptivePtime = true; // Adaptive packetization
                    }

                    // Frame rate specific optimizations
                    if (deviceCapabilities.supportsVariableFrameRate) {
                        // Allow variable frame rate for better quality distribution
                        if (params.encodings[0].hasOwnProperty('maxQp')) {
                            params.encodings[0].maxQp = 42; // Balanced quality range
                        }
                        if (params.encodings[0].hasOwnProperty('minQp')) {
                            params.encodings[0].minQp = 15; // Good quality minimum
                        }
                    }

                } else {
                    // Fallback smooth settings if no codec detected
                    const baseMultiplier = deviceCapabilities.isHighPerformanceDevice ? 1.0 : 0.8;
                    params.encodings[0].maxBitrate = Math.round(800000 * baseMultiplier);
                    params.encodings[0].maxFramerate = deviceCapabilities.optimalFrameRate;
                    params.encodings[0].minBitrate = Math.round(400000 * baseMultiplier);
                    params.encodings[0].scaleResolutionDownBy = 1;
                    console.log(`⚙️ FALLBACK SMOOTH: ${params.encodings[0].maxBitrate / 1000}kbps @ ${deviceCapabilities.optimalFrameRate}fps`);
                }

                // Apply the smooth-optimized parameters
                await sender.setParameters(params);
                console.log('✅ SMOOTH + COMPRESSED streaming settings applied successfully');

                // Log the final configuration
                const maxBitrate = params.encodings[0].maxBitrate / 1000;
                const minBitrate = (params.encodings[0].minBitrate || 0) / 1000;
                console.log(`📊 Final smooth settings: ${minBitrate.toFixed(0)}-${maxBitrate.toFixed(0)}kbps @ ${params.encodings[0].maxFramerate}fps`);

            }
        } catch (error) {
            console.error('Error optimizing video encoding for smoothness:', error);
        }
    }

    getCodecType(mimeType) {
        if (mimeType.toUpperCase().includes('AV01')) return 'AV1';
        if (mimeType.toUpperCase().includes('VP9')) return 'VP9';
        if (mimeType.toUpperCase().includes('VP8')) return 'VP8';
        if (mimeType.toUpperCase().includes('H264')) return 'H.264';
        return 'Unknown';
    }

    async setPreferredCodec() {
        try {
            const transceivers = this.peerConnection.getTransceivers();
            const videoTransceiver = transceivers.find(t => t.sender && t.sender.track && t.sender.track.kind === 'video');

            if (videoTransceiver) {
                const capabilities = RTCRtpSender.getCapabilities('video');
                if (capabilities && capabilities.codecs) {
                    // MAXIMUM COMPRESSION PRIORITY: Always prefer the most efficient codec
                    console.log('🚀 MAXIMUM COMPRESSION MODE - Prioritizing efficiency over battery life');

                    // Ultimate compression codec priority (ignoring battery impact)
                    const preferredCodecs = [
                        'AV01', // AV1: 50% better compression than H.264
                        'VP9',  // VP9: 30% better compression than H.264  
                        'VP8',  // VP8: 15% better compression than H.264
                        'H264'  // H.264: Fallback only
                    ];

                    const availableCodecs = capabilities.codecs.filter(codec =>
                        preferredCodecs.some(preferred =>
                            codec.mimeType.toUpperCase().includes(preferred)
                        )
                    );

                    // Sort by compression efficiency (best first)
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
                        console.log(`🎯 Selected MAXIMUM COMPRESSION codec: ${selectedCodec.mimeType}`);

                        // Log compression benefit
                        const codecType = this.getCodecType(selectedCodec.mimeType);
                        const compressionBenefit = this.getCompressionBenefit(codecType);
                        console.log(`📊 Compression benefit: ${compressionBenefit}`);

                        // Set codec preferences for maximum efficiency
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

    getCompressionBenefit(codecType) {
        const benefits = {
            'AV1': '50% better compression, 50% smaller files',
            'VP9': '30% better compression, 30% smaller files',
            'VP8': '15% better compression, 15% smaller files',
            'H.264': 'Baseline compression (fallback)'
        };
        return benefits[codecType] || 'Unknown compression benefit';
    }

    detectIOS() {
        const userAgent = navigator.userAgent;
        const platform = navigator.platform;

        // Check for iPhone, iPad, iPod
        const isIOSUserAgent = /iPad|iPhone|iPod/.test(userAgent);
        const isIOSPlatform = /iPad|iPhone|iPod/.test(platform);

        // Check for iOS 13+ iPad (reports as Mac)
        const isIOSiPadPro = platform === 'MacIntel' && navigator.maxTouchPoints > 1;

        // WebKit-specific iOS detection
        const isIOSWebKit = /Safari/.test(userAgent) && !/Chrome|Firefox|Edge/.test(userAgent);

        const isIOS = isIOSUserAgent || isIOSPlatform || isIOSiPadPro;

        if (isIOS) {
            // Try to detect iOS version for more specific optimizations
            const versionMatch = userAgent.match(/OS (\d+)_(\d+)/);
            if (versionMatch) {
                const majorVersion = parseInt(versionMatch[1]);
                console.log(`📱 iOS ${majorVersion} detected`);

                // Store iOS version for codec-specific decisions
                this.iOSVersion = majorVersion;
            }
        }

        return isIOS;
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
                const bandwidthSavings = this.codecMonitor.getBandwidthSavings();

                codecDetailsSpan.innerHTML = `
                    <strong>🚀 MAXIMUM COMPRESSION MODE</strong><br>
                    <strong>Codec:</strong> ${codecName}<br>
                    <strong>Bitrate:</strong> ${bitrate} kbps<br>
                    <strong>Efficiency:</strong> ${efficiency}<br>
                    <strong>Savings:</strong> ${bandwidthSavings}<br>
                    <strong>Frames Sent:</strong> ${sendingCodec.framesSent || 0}<br>
                    <strong>Quality:</strong> Maximum (1080p @ 30fps)
                `;
            } else {
                codecDetailsSpan.innerHTML = 'Detecting maximum compression codec...';
            }
        } catch (error) {
            console.error('Error updating codec display:', error);
            codecDetailsSpan.innerHTML = 'Error retrieving compression information';
        }
    }
}

// Start the client app
new ClientApp();