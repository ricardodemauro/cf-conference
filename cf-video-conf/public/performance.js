// Performance monitoring utility
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            connectionTimes: [],
            messageLatency: [],
            videoQuality: [],
            bandwidthUsage: []
        };
        this.startTime = Date.now();
    }

    recordConnectionTime(duration) {
        this.metrics.connectionTimes.push({
            duration,
            timestamp: Date.now()
        });
        console.log(`Connection established in ${duration}ms`);
    }

    recordMessageLatency(latency) {
        this.metrics.messageLatency.push({
            latency,
            timestamp: Date.now()
        });
    }

    recordVideoStats(stats) {
        this.metrics.videoQuality.push({
            ...stats,
            timestamp: Date.now()
        });
    }

    getAverageConnectionTime() {
        if (this.metrics.connectionTimes.length === 0) return 0;
        const sum = this.metrics.connectionTimes.reduce((acc, curr) => acc + curr.duration, 0);
        return sum / this.metrics.connectionTimes.length;
    }

    getAverageLatency() {
        if (this.metrics.messageLatency.length === 0) return 0;
        const sum = this.metrics.messageLatency.reduce((acc, curr) => acc + curr.latency, 0);
        return sum / this.metrics.messageLatency.length;
    }

    exportMetrics() {
        return {
            uptime: Date.now() - this.startTime,
            averageConnectionTime: this.getAverageConnectionTime(),
            averageLatency: this.getAverageLatency(),
            totalConnections: this.metrics.connectionTimes.length,
            ...this.metrics
        };
    }
}

// Export for use in both client and host
if (typeof window !== 'undefined') {
    window.PerformanceMonitor = PerformanceMonitor;
} else {
    module.exports = PerformanceMonitor;
}
