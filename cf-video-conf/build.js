#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Simple JavaScript minifier
function minifyJS(code) {
    return code
        // Remove comments
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        // Remove unnecessary whitespace
        .replace(/\s+/g, ' ')
        // Remove whitespace around operators and punctuation
        .replace(/\s*([{}();,:])\s*/g, '$1')
        .replace(/\s*([=+\-*/<>!&|])\s*/g, '$1')
        // Remove leading/trailing whitespace
        .trim();
}

// Build function
function build() {
    const publicDir = path.join(__dirname, 'public');
    const buildDir = path.join(__dirname, 'public', 'dist');
    
    // Create dist directory
    if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir, { recursive: true });
    }
    
    // Minify JavaScript files
    const jsFiles = ['client.js', 'host.js'];
    
    jsFiles.forEach(file => {
        const inputPath = path.join(publicDir, file);
        const outputPath = path.join(buildDir, file);
        
        if (fs.existsSync(inputPath)) {
            const code = fs.readFileSync(inputPath, 'utf8');
            const minified = minifyJS(code);
            
            // Calculate compression ratio
            const originalSize = Buffer.byteLength(code, 'utf8');
            const minifiedSize = Buffer.byteLength(minified, 'utf8');
            const savings = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
            
            fs.writeFileSync(outputPath, minified);
            console.log(`${file}: ${originalSize} → ${minifiedSize} bytes (${savings}% smaller)`);
        }
    });
    
    // Copy and minify HTML files
    const htmlFiles = ['client.html', 'host.html', 'index.html'];
    
    htmlFiles.forEach(file => {
        const inputPath = path.join(publicDir, file);
        const outputPath = path.join(buildDir, file);
        
        if (fs.existsSync(inputPath)) {
            let html = fs.readFileSync(inputPath, 'utf8');
            
            // Update script references to use minified versions
            if (file === 'client.html') {
                html = html.replace('/client.js', '/dist/client.js');
            } else if (file === 'host.html') {
                html = html.replace('/host.js', '/dist/host.js');
            }
            
            // Minify HTML
            html = html
                .replace(/\s+/g, ' ')
                .replace(/>\s+</g, '><')
                .trim();
            
            fs.writeFileSync(outputPath, html);
        }
    });
    
    console.log('Build complete!');
}

// Run build if called directly
if (require.main === module) {
    build();
}

module.exports = { build, minifyJS };
