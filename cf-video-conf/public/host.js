// Multi-Guest Host App - Receives video streams from multiple guests
class HostApp {
    constructor() {
        this.videosContainer = null;
        this.peerConnections = new Map(); // Map of peerId -> RTCPeerConnection
        this.videoElements = new Map(); // Map of peerId -> video element
        this.peerId = 'HOST_' + crypto.randomUUID();
        this.lastMessageTimestamp = 0;
        this.interval = false;
        this.candidateQueues = new Map(); // Map of peerId -> ICE candidate queue
        this.connectedGuests = 0;
        this.isListening = false; // Toggle state for listening to new connections
        
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
        this.setupUI();
        // Don't start polling automatically - wait for user to toggle
    }

    setupVideo() {
        this.videosContainer = document.getElementById('videos');
        console.log('Host ready - waiting for remote streams');
    }

    async join() {
        try {
            // Show cleaning status
            const statusDiv = document.getElementById('status');
            if (statusDiv) {
                statusDiv.textContent = 'Initializing host - cleaning database...';
                statusDiv.style.background = '#ffc107';
            }
            
            const response = await fetch('/signaling', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'join',
                    peerId: this.peerId
                })
            });

            const data = await response.json();
            console.log('Host joined. Database cleaned for fresh session');

        } catch (error) {
            console.error('Join error:', error);
        }
    }

    startPolling() {
        if (this.interval) return; // Already polling
        
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
        
        console.log('Started polling for new connections');
    }

    stopPolling() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = false;
            console.log('Stopped polling for new connections');
        }
    }

    setupUI() {
        this.videosContainer = document.getElementById('videos');
        
        // Setup toggle button
        const toggleButton = document.getElementById('toggle-listening');
        toggleButton.addEventListener('click', () => this.toggleListening());
        
        this.updateUI();
    }

    toggleListening() {
        this.isListening = !this.isListening;
        
        if (this.isListening) {
            this.startPolling();
        } else {
            this.stopPolling();
        }
        
        this.updateUI();
    }

    updateUI() {
        const toggleButton = document.getElementById('toggle-listening');
        const statusDiv = document.getElementById('status');
        
        if (this.isListening) {
            toggleButton.textContent = 'Stop Listening';
            toggleButton.style.background = '#dc3545';
            statusDiv.textContent = `Host Active - Listening for connections`;
            statusDiv.style.background = '#28a745';
        } else {
            toggleButton.textContent = 'Start Listening';
            toggleButton.style.background = '#28a745';
            statusDiv.textContent = 'Host Ready - Not Listening';
            statusDiv.style.background = '#6c757d';
        }
    }

    updateGuestCount() {
        const countElement = document.getElementById('guest-count');
        if (countElement) {
            countElement.textContent = `Connected guests: ${this.connectedGuests}`;
        }
        
        // Update status to show guest count when listening
        if (this.isListening) {
            const statusDiv = document.getElementById('status');
            if (statusDiv && this.connectedGuests > 0) {
                statusDiv.textContent = `Host Active - Listening (${this.connectedGuests} connected)`;
            }
        }
    }

    createVideoElement(guestId) {
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `container-${guestId}`;
        
        const video = document.createElement('video');
        video.id = `video-${guestId}`;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = false;
        
        const label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = `Guest: ${guestId.split('_')[1]?.substring(0, 8) || 'Unknown'}`;
        
        videoContainer.appendChild(video);
        videoContainer.appendChild(label);
        this.videosContainer.appendChild(videoContainer);
        
        this.videoElements.set(guestId, video);
        console.log(`Created video element for guest: ${guestId}`);
        
        return video;
    }

    removeVideoElement(guestId) {
        const container = document.getElementById(`container-${guestId}`);
        if (container) {
            container.remove();
            this.videoElements.delete(guestId);
            console.log(`Removed video element for guest: ${guestId}`);
        }
    }

    createPeerConnection(guestId) {
        const peerConnection = new RTCPeerConnection(this.pcConfig);
        
        // Host doesn't add local stream - only receives
        
        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log(`Received remote stream from guest: ${guestId}`);
            
            let video = this.videoElements.get(guestId);
            if (!video) {
                video = this.createVideoElement(guestId);
            }
            
            video.srcObject = event.streams[0];
            this.connectedGuests++;
            this.updateGuestCount();
            
            const statusElement = document.getElementById('status');
            if (statusElement) {
                statusElement.textContent = `Host Active - ${this.connectedGuests} guest(s) connected`;
                statusElement.style.background = '#007bff';
            }
        };
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendMessage({
                    type: 'candidate',
                    candidate: event.candidate
                }, guestId);
            }
        };

        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state for ${guestId}:`, peerConnection.connectionState);
            if (peerConnection.connectionState === 'disconnected' || 
                peerConnection.connectionState === 'failed' ||
                peerConnection.connectionState === 'closed') {
                
                this.handleGuestDisconnection(guestId);
            }
        };
        
        this.peerConnections.set(guestId, peerConnection);
        this.candidateQueues.set(guestId, []);
        
        return peerConnection;
    }

    handleGuestDisconnection(guestId) {
        console.log(`Guest disconnected: ${guestId}`);
        
        // Clean up peer connection
        const peerConnection = this.peerConnections.get(guestId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(guestId);
        }
        
        // Remove video element
        this.removeVideoElement(guestId);
        
        // Clean up candidate queue
        this.candidateQueues.delete(guestId);
        
        // Update count
        this.connectedGuests = Math.max(0, this.connectedGuests - 1);
        this.updateGuestCount();
        
        const statusElement = document.getElementById('status');
        if (statusElement) {
            if (this.connectedGuests === 0) {
                statusElement.textContent = 'Host Active - Ready for guests';
                statusElement.style.background = '#28a745';
            } else {
                statusElement.textContent = `Host Active - ${this.connectedGuests} guest(s) connected`;
            }
        }
    }

    async handleMessage(message) {
        try {
            // Parse the data if it's a JSON string
            const messageData = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
            const fromGuestId = message.fromPeerId; // This comes from the database query
            
            if (message.type === 'offer') {
                console.log(`Received offer from guest: ${fromGuestId}`);
                
                // Create new peer connection for this guest
                const peerConnection = this.createPeerConnection(fromGuestId);
                
                await peerConnection.setRemoteDescription(messageData);
                
                // Process any queued ICE candidates for this guest
                await this.processQueuedCandidates(fromGuestId);
                
                // Create answer (host responds to guest's offer)
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                
                this.sendMessage({
                    type: 'answer',
                    answer: answer
                }, fromGuestId);
                
            } else if (message.type === 'candidate') {
                const peerConnection = this.peerConnections.get(fromGuestId);
                
                if (peerConnection && peerConnection.remoteDescription) {
                    // Remote description is set, add candidate immediately
                    await peerConnection.addIceCandidate(messageData);
                } else if (peerConnection) {
                    // Queue candidate until remote description is set
                    const queue = this.candidateQueues.get(fromGuestId) || [];
                    queue.push(messageData);
                    this.candidateQueues.set(fromGuestId, queue);
                    console.log(`Queued ICE candidate for ${fromGuestId} - waiting for remote description`);
                } else {
                    console.log(`Ignoring ICE candidate for ${fromGuestId} - no peer connection yet`);
                }
            }
        } catch (error) {
            console.error('Message error:', error);
        }
    }

    async processQueuedCandidates(guestId) {
        const queue = this.candidateQueues.get(guestId) || [];
        const peerConnection = this.peerConnections.get(guestId);
        
        if (!peerConnection) return;
        
        while (queue.length > 0) {
            const candidate = queue.shift();
            try {
                await peerConnection.addIceCandidate(candidate);
                console.log(`Added queued ICE candidate for ${guestId}`);
            } catch (error) {
                console.error(`Error adding queued candidate for ${guestId}:`, error);
            }
        }
        
        this.candidateQueues.set(guestId, queue);
    }

    sendMessage(message, targetGuestId = null) {
        fetch('/signaling', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: message.type,
                peerId: this.peerId,
                data: message.answer || message.candidate,
                targetPeer: targetGuestId // Optional: specify which guest this message is for
            })
        }).catch(error => console.error('Send error:', error));
    }
}

// Start the host app
new HostApp();
