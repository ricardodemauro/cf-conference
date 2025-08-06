// Codec Detection and Performance Utility
class CodecMonitor {
    constructor() {
        this.codecInfo = {
            sending: null,
            receiving: null,
            bandwidth: [],
            quality: []
        };
        this.monitoringInterval = null;
    }

    async detectSendingCodec(peerConnection) {
        try {
            const stats = await peerConnection.getStats();
            for (const [id, stat] of stats) {
                if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                    // Find codec info
                    for (const [codecId, codecStat] of stats) {
                        if (codecStat.type === 'codec' && codecStat.id === stat.codecId) {
                            this.codecInfo.sending = {
                                mimeType: codecStat.mimeType,
                                clockRate: codecStat.clockRate,
                                payloadType: codecStat.payloadType,
                                bytesEncoded: stat.bytesEncoded,
                                framesSent: stat.framesSent,
                                bitrate: this.calculateBitrate(stat.bytesSent, stat.timestamp)
                            };
                            
                            console.log('🎥 Sending Video Codec:', this.codecInfo.sending);
                            return this.codecInfo.sending;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error detecting sending codec:', error);
        }
        return null;
    }

    async detectReceivingCodec(peerConnection) {
        try {
            const stats = await peerConnection.getStats();
            for (const [id, stat] of stats) {
                if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                    // Find codec info
                    for (const [codecId, codecStat] of stats) {
                        if (codecStat.type === 'codec' && codecStat.id === stat.codecId) {
                            this.codecInfo.receiving = {
                                mimeType: codecStat.mimeType,
                                clockRate: codecStat.clockRate,
                                payloadType: codecStat.payloadType,
                                bytesReceived: stat.bytesReceived,
                                framesReceived: stat.framesReceived,
                                bitrate: this.calculateBitrate(stat.bytesReceived, stat.timestamp)
                            };
                            
                            console.log('📺 Receiving Video Codec:', this.codecInfo.receiving);
                            return this.codecInfo.receiving;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error detecting receiving codec:', error);
        }
        return null;
    }

    calculateBitrate(bytes, timestamp) {
        if (!this.lastBytes || !this.lastTimestamp) {
            this.lastBytes = bytes;
            this.lastTimestamp = timestamp;
            return 0;
        }

        const bitrate = ((bytes - this.lastBytes) * 8) / ((timestamp - this.lastTimestamp) / 1000);
        this.lastBytes = bytes;
        this.lastTimestamp = timestamp;
        
        return Math.round(bitrate);
    }

    startMonitoring(peerConnection, type = 'client') {
        this.monitoringInterval = setInterval(async () => {
            if (type === 'client') {
                await this.detectSendingCodec(peerConnection);
                await this.updateUI();
            } else {
                await this.detectReceivingCodec(peerConnection);
                await this.updateHostUI();
            }
        }, 5000); // Monitor every 5 seconds
    }

    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }

    async updateUI() {
        const statusDiv = document.getElementById('status');
        if (statusDiv && this.codecInfo.sending) {
            const codecName = this.getCodecName(this.codecInfo.sending.mimeType);
            const bitrate = Math.round(this.codecInfo.sending.bitrate / 1000); // Convert to kbps
            
            const originalText = statusDiv.textContent;
            if (!originalText.includes('|')) {
                statusDiv.textContent = `${originalText} | ${codecName} @ ${bitrate}kbps`;
            }
        }
    }

    async updateHostUI() {
        const statusDiv = document.getElementById('status');
        if (statusDiv && this.codecInfo.receiving) {
            const codecName = this.getCodecName(this.codecInfo.receiving.mimeType);
            const bitrate = Math.round(this.codecInfo.receiving.bitrate / 1000); // Convert to kbps
            
            const originalText = statusDiv.textContent;
            if (!originalText.includes('|')) {
                statusDiv.textContent = `${originalText} | Receiving ${codecName} @ ${bitrate}kbps`;
            }
        }
    }

    getCodecName(mimeType) {
        if (mimeType.includes('AV01')) return 'AV1';
        if (mimeType.includes('VP9')) return 'VP9';
        if (mimeType.includes('VP8')) return 'VP8';
        if (mimeType.includes('H264')) return 'H.264';
        return 'Unknown';
    }

    getCompressionEfficiency() {
        if (!this.codecInfo.sending) return 'Unknown';
        
        const codecName = this.getCodecName(this.codecInfo.sending.mimeType);
        const efficiencyMap = {
            'AV1': '🏆 Excellent (50% better than H.264)',
            'VP9': '🥈 Very Good (30% better than H.264)',
            'VP8': '🥉 Good (15% better than H.264)',
            'H.264': '📊 Standard baseline'
        };
        
        return efficiencyMap[codecName] || 'Unknown';
    }

    getSupportedCodecs() {
        try {
            const capabilities = RTCRtpSender.getCapabilities('video');
            if (capabilities && capabilities.codecs) {
                return capabilities.codecs.map(codec => ({
                    mimeType: codec.mimeType,
                    name: this.getCodecName(codec.mimeType)
                }));
            }
        } catch (error) {
            console.error('Error getting supported codecs:', error);
        }
        return [];
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.CodecMonitor = CodecMonitor;
} else {
    module.exports = CodecMonitor;
}
