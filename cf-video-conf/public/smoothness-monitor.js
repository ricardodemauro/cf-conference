// Real-time Smoothness Monitor
class SmoothnessMonitor {
    constructor(peerConnection) {
        this.peerConnection = peerConnection;
        this.metrics = {
            frameDrops: 0,
            framesPerSecond: 0,
            jitter: 0,
            packetLoss: 0,
            roundTripTime: 0
        };
        this.lastStats = null;
        this.monitoringInterval = null;
        this.adjustmentHistory = [];
        this.isMonitoring = false;
    }

    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('🔍 Starting real-time smoothness monitoring...');
        
        this.monitoringInterval = setInterval(() => {
            this.checkSmoothness();
        }, 2000); // Check every 2 seconds
    }

    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            this.isMonitoring = false;
            console.log('⏹️ Stopped smoothness monitoring');
        }
    }

    async checkSmoothness() {
        try {
            const stats = await this.peerConnection.getStats();
            const videoStats = this.extractVideoStats(stats);
            
            if (!videoStats) return;
            
            // Calculate smoothness metrics
            const smoothnessScore = this.calculateSmoothnessScore(videoStats);
            
            // Auto-adjust if smoothness is poor
            if (smoothnessScore < 70) { // Score below 70 = poor smoothness
                await this.autoAdjustForSmoothness(videoStats, smoothnessScore);
            }
            
            // Update UI with smoothness info
            this.updateSmoothnessUI(videoStats, smoothnessScore);
            
            this.lastStats = videoStats;
            
        } catch (error) {
            console.error('Error monitoring smoothness:', error);
        }
    }

    extractVideoStats(stats) {
        let videoStats = null;
        
        for (const [id, stat] of stats) {
            if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                videoStats = {
                    framesSent: stat.framesSent || 0,
                    framesEncoded: stat.framesEncoded || 0,
                    bytesSent: stat.bytesSent || 0,
                    timestamp: stat.timestamp,
                    packetsSent: stat.packetsSent || 0,
                    packetsLost: stat.packetsLost || 0,
                    jitter: stat.jitter || 0,
                    roundTripTime: stat.roundTripTime || 0,
                    qualityLimitationReason: stat.qualityLimitationReason,
                    encoderImplementation: stat.encoderImplementation
                };
                break;
            }
        }
        
        return videoStats;
    }

    calculateSmoothnessScore(videoStats) {
        if (!this.lastStats) return 100; // No baseline yet
        
        const timeDelta = (videoStats.timestamp - this.lastStats.timestamp) / 1000; // seconds
        if (timeDelta <= 0) return 100;
        
        // Calculate current FPS
        const framesDelta = videoStats.framesSent - this.lastStats.framesSent;
        const currentFPS = framesDelta / timeDelta;
        
        // Calculate packet loss rate
        const packetsDelta = videoStats.packetsSent - this.lastStats.packetsSent;
        const packetsLostDelta = videoStats.packetsLost - this.lastStats.packetsLost;
        const lossRate = packetsDelta > 0 ? (packetsLostDelta / packetsDelta) * 100 : 0;
        
        // Score components (100 = perfect)
        let fpsScore = Math.min(100, (currentFPS / 30) * 100); // 30fps = 100 points
        let lossScore = Math.max(0, 100 - (lossRate * 10)); // 10% loss = 0 points
        let jitterScore = Math.max(0, 100 - (videoStats.jitter * 1000)); // 100ms jitter = 0 points
        
        // Quality limitation penalty
        let qualityPenalty = 0;
        if (videoStats.qualityLimitationReason) {
            switch (videoStats.qualityLimitationReason) {
                case 'cpu': qualityPenalty = 20; break;
                case 'bandwidth': qualityPenalty = 15; break;
                case 'other': qualityPenalty = 10; break;
            }
        }
        
        // Calculate weighted score
        const smoothnessScore = Math.max(0, (fpsScore * 0.5 + lossScore * 0.3 + jitterScore * 0.2) - qualityPenalty);
        
        // Update metrics for UI
        this.metrics.framesPerSecond = Math.round(currentFPS * 10) / 10;
        this.metrics.packetLoss = Math.round(lossRate * 100) / 100;
        this.metrics.jitter = Math.round(videoStats.jitter * 1000 * 10) / 10;
        this.metrics.roundTripTime = Math.round((videoStats.roundTripTime || 0) * 1000);
        
        return Math.round(smoothnessScore);
    }

    async autoAdjustForSmoothness(videoStats, smoothnessScore) {
        console.log(`⚠️ Poor smoothness detected (score: ${smoothnessScore}). Auto-adjusting...`);
        
        // Prevent too frequent adjustments
        const lastAdjustment = this.adjustmentHistory[this.adjustmentHistory.length - 1];
        if (lastAdjustment && Date.now() - lastAdjustment.timestamp < 10000) {
            console.log('🔄 Skipping adjustment - too recent');
            return;
        }
        
        try {
            const senders = this.peerConnection.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            
            if (!videoSender) return;
            
            const params = videoSender.getParameters();
            if (!params.encodings || params.encodings.length === 0) return;
            
            const encoding = params.encodings[0];
            let adjustmentMade = false;
            
            // Determine adjustment strategy based on quality limitation
            if (videoStats.qualityLimitationReason === 'cpu') {
                // CPU limited - reduce frame rate or resolution
                if (encoding.maxFramerate > 20) {
                    encoding.maxFramerate = Math.max(20, encoding.maxFramerate - 4);
                    console.log(`🔧 Reduced frame rate to ${encoding.maxFramerate}fps (CPU relief)`);
                    adjustmentMade = true;
                }
            } else if (videoStats.qualityLimitationReason === 'bandwidth' || this.metrics.packetLoss > 2) {
                // Bandwidth limited - reduce bitrate
                if (encoding.maxBitrate > 200000) {
                    encoding.maxBitrate = Math.max(200000, encoding.maxBitrate * 0.8);
                    console.log(`🔧 Reduced bitrate to ${Math.round(encoding.maxBitrate/1000)}kbps (bandwidth relief)`);
                    adjustmentMade = true;
                }
            } else if (this.metrics.framesPerSecond < 20) {
                // General smoothness issues - reduce overall quality
                if (encoding.maxBitrate > 300000) {
                    encoding.maxBitrate = Math.max(300000, encoding.maxBitrate * 0.9);
                    console.log(`🔧 Reduced bitrate to ${Math.round(encoding.maxBitrate/1000)}kbps (smoothness improvement)`);
                    adjustmentMade = true;
                }
            }
            
            if (adjustmentMade) {
                await videoSender.setParameters(params);
                
                this.adjustmentHistory.push({
                    timestamp: Date.now(),
                    reason: videoStats.qualityLimitationReason || 'smoothness',
                    action: `Bitrate: ${Math.round(encoding.maxBitrate/1000)}kbps, FPS: ${encoding.maxFramerate}`,
                    scoreBefore: smoothnessScore
                });
                
                console.log('✅ Auto-adjustment applied for smoother streaming');
            }
            
        } catch (error) {
            console.error('Error auto-adjusting for smoothness:', error);
        }
    }

    updateSmoothnessUI(videoStats, smoothnessScore) {
        const statusDiv = document.getElementById('codec-details');
        if (!statusDiv) return;
        
        // Color code based on smoothness score
        let scoreColor = '#28a745'; // Green
        let scoreEmoji = '🟢';
        
        if (smoothnessScore < 70) {
            scoreColor = '#dc3545'; // Red
            scoreEmoji = '🔴';
        } else if (smoothnessScore < 85) {
            scoreColor = '#ffc107'; // Yellow
            scoreEmoji = '🟡';
        }
        
        const additionalInfo = `
            <br><strong style="color: ${scoreColor};">Smoothness: ${scoreEmoji} ${smoothnessScore}/100</strong>
            <br><strong>FPS:</strong> ${this.metrics.framesPerSecond}
            <br><strong>Packet Loss:</strong> ${this.metrics.packetLoss}%
            <br><strong>Jitter:</strong> ${this.metrics.jitter}ms
            ${this.metrics.roundTripTime > 0 ? `<br><strong>RTT:</strong> ${this.metrics.roundTripTime}ms` : ''}
            ${videoStats.qualityLimitationReason ? `<br><strong>Limitation:</strong> ${videoStats.qualityLimitationReason}` : ''}
        `;
        
        // Append to existing codec info
        const currentContent = statusDiv.innerHTML;
        if (!currentContent.includes('Smoothness:')) {
            statusDiv.innerHTML = currentContent + additionalInfo;
        } else {
            // Update existing smoothness info
            const baseContent = currentContent.split('<br><strong style="color:')[0];
            statusDiv.innerHTML = baseContent + additionalInfo;
        }
    }

    getSmoothnessSummary() {
        return {
            currentScore: this.calculateSmoothnessScore(this.lastStats),
            metrics: { ...this.metrics },
            adjustmentHistory: [...this.adjustmentHistory],
            isMonitoring: this.isMonitoring
        };
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.SmoothnessMonitor = SmoothnessMonitor;
} else {
    module.exports = SmoothnessMonitor;
}
