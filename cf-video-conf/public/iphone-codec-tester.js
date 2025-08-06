// iPhone Codec Testing Utility
class iPhoneCodecTester {
    constructor() {
        this.testResults = {
            deviceInfo: this.getDeviceInfo(),
            supportedCodecs: [],
            performanceTests: {}
        };
    }

    getDeviceInfo() {
        const userAgent = navigator.userAgent;
        const platform = navigator.platform;
        
        // Detect iOS device type
        let deviceType = 'Unknown';
        if (/iPhone/.test(userAgent)) deviceType = 'iPhone';
        else if (/iPad/.test(userAgent)) deviceType = 'iPad';
        else if (/iPod/.test(userAgent)) deviceType = 'iPod';
        else if (platform === 'MacIntel' && navigator.maxTouchPoints > 1) deviceType = 'iPad Pro';
        
        // Detect iOS version
        const versionMatch = userAgent.match(/OS (\d+)_(\d+)/);
        const iOSVersion = versionMatch ? `${versionMatch[1]}.${versionMatch[2]}` : 'Unknown';
        
        // Detect Safari version
        const safariMatch = userAgent.match(/Version\/(\d+\.\d+)/);
        const safariVersion = safariMatch ? safariMatch[1] : 'Unknown';
        
        return {
            deviceType,
            iOSVersion,
            safariVersion,
            userAgent: userAgent.substring(0, 100) + '...',
            platform,
            touchPoints: navigator.maxTouchPoints
        };
    }

    async testCodecSupport() {
        console.log('🧪 Testing iPhone codec support...');
        
        try {
            const capabilities = RTCRtpSender.getCapabilities('video');
            
            if (!capabilities || !capabilities.codecs) {
                console.error('❌ WebRTC not supported');
                return;
            }
            
            const codecTests = [
                { name: 'H.264', pattern: /H264/i, expected: '✅ Should be supported' },
                { name: 'VP8', pattern: /VP8/i, expected: '✅ Should be supported (iOS 12.2+)' },
                { name: 'VP9', pattern: /VP9/i, expected: '⚠️ May be supported (iOS 14.3+)' },
                { name: 'AV1', pattern: /AV01/i, expected: '❓ Experimental (iOS 17+)' }
            ];
            
            console.log('\n📋 Codec Support Results:');
            console.log('========================');
            
            codecTests.forEach(test => {
                const isSupported = capabilities.codecs.some(codec => 
                    test.pattern.test(codec.mimeType)
                );
                
                const status = isSupported ? '✅ Supported' : '❌ Not Supported';
                console.log(`${test.name}: ${status} (${test.expected})`);
                
                if (isSupported) {
                    const codecDetails = capabilities.codecs.filter(codec => 
                        test.pattern.test(codec.mimeType)
                    );
                    codecDetails.forEach(codec => {
                        console.log(`  └─ ${codec.mimeType} (clockRate: ${codec.clockRate})`);
                    });
                }
                
                this.testResults.supportedCodecs.push({
                    name: test.name,
                    supported: isSupported,
                    details: isSupported ? capabilities.codecs.filter(c => test.pattern.test(c.mimeType)) : []
                });
            });
            
            // Test hardware acceleration hints
            console.log('\n🔧 Hardware Acceleration Analysis:');
            console.log('==================================');
            
            const h264Codecs = capabilities.codecs.filter(c => /H264/i.test(c.mimeType));
            if (h264Codecs.length > 0) {
                console.log('✅ H.264 likely hardware accelerated on iOS');
                console.log('   └─ Recommended for best battery life');
            }
            
            const vp8Codecs = capabilities.codecs.filter(c => /VP8/i.test(c.mimeType));
            if (vp8Codecs.length > 0) {
                console.log('⚠️ VP8 partially hardware accelerated');
                console.log('   └─ Moderate battery impact');
            }
            
            const vp9Codecs = capabilities.codecs.filter(c => /VP9/i.test(c.mimeType));
            if (vp9Codecs.length > 0) {
                console.log('🔴 VP9 software only - high battery usage');
                console.log('   └─ Avoid for battery-sensitive applications');
            }
            
            const av1Codecs = capabilities.codecs.filter(c => /AV01/i.test(c.mimeType));
            if (av1Codecs.length > 0) {
                console.log('🚨 AV1 software only - very high CPU usage');
                console.log('   └─ Not recommended for iPhone');
            }
            
        } catch (error) {
            console.error('❌ Error testing codec support:', error);
        }
    }

    async performanceTest() {
        console.log('\n⚡ Performance Test Starting...');
        console.log('================================');
        
        // Test device performance characteristics
        const startTime = performance.now();
        
        // Simple CPU stress test
        let iterations = 0;
        const cpuTestDuration = 100; // 100ms test
        const cpuTestStart = performance.now();
        
        while (performance.now() - cpuTestStart < cpuTestDuration) {
            Math.random() * Math.random();
            iterations++;
        }
        
        const cpuScore = iterations / 1000; // Normalized score
        console.log(`🧮 CPU Performance Score: ${cpuScore.toFixed(1)}k ops/100ms`);
        
        // Memory test
        const memoryInfo = navigator.deviceMemory || 'Unknown';
        console.log(`🧠 Device Memory: ${memoryInfo}GB`);
        
        // Connection test
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            console.log(`📶 Network: ${connection.effectiveType || 'Unknown'} (${connection.downlink || 'Unknown'}Mbps)`);
        }
        
        // Recommended settings based on performance
        console.log('\n🎯 Recommended Settings for This Device:');
        console.log('========================================');
        
        if (cpuScore > 50) {
            console.log('✅ High Performance Device');
            console.log('   └─ Can handle VP8/VP9 if needed');
            console.log('   └─ Recommended: H.264 @ 1080p, 24-30fps');
        } else if (cpuScore > 20) {
            console.log('⚠️ Medium Performance Device');
            console.log('   └─ Stick to H.264 for best experience');
            console.log('   └─ Recommended: H.264 @ 720p, 24fps');
        } else {
            console.log('🔴 Lower Performance Device');
            console.log('   └─ Use conservative settings');
            console.log('   └─ Recommended: H.264 @ 480p, 20fps');
        }
        
        this.testResults.performanceTests = {
            cpuScore,
            memoryInfo,
            networkInfo: connection ? {
                effectiveType: connection.effectiveType,
                downlink: connection.downlink
            } : null
        };
    }

    displaySummary() {
        console.log('\n📊 iPhone Codec Test Summary');
        console.log('============================');
        console.log('Device:', this.testResults.deviceInfo.deviceType);
        console.log('iOS Version:', this.testResults.deviceInfo.iOSVersion);
        console.log('Safari Version:', this.testResults.deviceInfo.safariVersion);
        
        const supportedCodecNames = this.testResults.supportedCodecs
            .filter(c => c.supported)
            .map(c => c.name)
            .join(', ');
        
        console.log('Supported Codecs:', supportedCodecNames);
        
        // Generate recommendations
        const hasH264 = this.testResults.supportedCodecs.find(c => c.name === 'H.264')?.supported;
        const hasVP8 = this.testResults.supportedCodecs.find(c => c.name === 'VP8')?.supported;
        
        console.log('\n🎯 Final Recommendation:');
        if (hasH264) {
            console.log('✅ Use H.264 for optimal iPhone experience');
            console.log('   └─ Best battery life and performance');
        } else if (hasVP8) {
            console.log('⚠️ Fallback to VP8');
            console.log('   └─ Monitor battery usage');
        } else {
            console.log('❌ Limited codec support detected');
        }
    }

    async runFullTest() {
        console.log('🍎 iPhone Codec Compatibility Test');
        console.log('===================================');
        
        await this.testCodecSupport();
        await this.performanceTest();
        this.displaySummary();
        
        return this.testResults;
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.iPhoneCodecTester = iPhoneCodecTester;
    
    // Auto-run test if on iPhone
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        console.log('📱 iPhone detected - running codec test automatically');
        const tester = new iPhoneCodecTester();
        tester.runFullTest().then(results => {
            console.log('📊 Test completed - results available in window.codecTestResults');
            window.codecTestResults = results;
        });
    }
} else {
    module.exports = iPhoneCodecTester;
}
