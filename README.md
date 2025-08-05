# CF Video Conference

A simple, scalable WebRTC video conferencing application built on Cloudflare Workers, D1 Database, and Cloudflare's TURN service. This project demonstrates how to build a real-time peer-to-peer video chat system with persistent signaling using modern web technologies.

## Project Description

CF Video Conference is a lightweight video conferencing solution that consists of:

- **Host Application**: Allows a user to start a video conference session and receive video streams from multiple guests
- **Client Application**: Enables guests to join a conference and send their video stream to the host
- **Signaling Server**: A Cloudflare Worker that handles WebRTC signaling, peer management, and session persistence using D1 database
- **TURN Credentials**: Integration with Cloudflare's TURN service for NAT traversal in challenging network environments

The application uses a hub-and-spoke model where guests send video to the host, making it suitable for presentations, interviews, or small group meetings.

## Interesting Findings

### Architecture Highlights

1. **Serverless WebRTC Signaling**: Uses Cloudflare Workers for a globally distributed, low-latency signaling server
2. **Persistent Session Management**: Leverages D1 SQLite database for maintaining peer connections and message history across network interruptions
3. **Automatic Cleanup**: Implements intelligent cleanup of inactive peers (1 hour) and old messages (1 hour) to prevent database bloat
4. **Host Session Reset**: When a host joins, all database tables are cleared to ensure a fresh conference session
5. **Dynamic TURN Credentials**: Integrates with Cloudflare's TURN service to generate time-limited ICE server credentials
6. **Multiple Camera Support**: Client application detects and allows switching between available cameras
7. **Real-time Polling**: Uses efficient polling mechanism with timestamp-based message retrieval

### Technical Innovations

- **Edge Computing**: Runs entirely on Cloudflare's edge network for global low-latency access
- **Hybrid P2P Architecture**: Combines the benefits of peer-to-peer connections with centralized signaling
- **Database-Backed Signaling**: Unlike traditional in-memory signaling servers, this solution persists connection state
- **CORS-Enabled**: Full cross-origin support for integration with various frontends

## Requirements

### Development Environment
- **Node.js**: Version 18 or higher
- **npm**: Latest version (comes with Node.js)
- **Wrangler CLI**: Cloudflare's development tool (installed via npm)

### Cloudflare Services
- **Cloudflare Workers**: For hosting the signaling server
- **Cloudflare D1**: SQLite database for persistent storage
- **Cloudflare TURN Service**: For NAT traversal (optional but recommended)

### Browser Support
- **WebRTC Support**: Modern browsers with WebRTC support
- **Camera Access**: Browsers that support `getUserMedia()` API
- **ES2021 Support**: Modern JavaScript features support

## How to Build

### 1. Install Dependencies

```bash
cd cf-video-conf
npm install
```

### 2. Set Up Cloudflare D1 Database

```bash
# Create a new D1 database
wrangler d1 create webrtc-signaling

# Apply the database schema
wrangler d1 execute webrtc-signaling --file=./schema.sql
```

### 3. Configure Environment Variables

Update `wrangler.jsonc` with your database ID and TURN credentials:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "webrtc-signaling",
      "database_id": "YOUR_DATABASE_ID_HERE"
    }
  ],
  "vars": {
    "TURN_KEY_ID": "your-turn-key-id",
    "TURN_KEY_API_TOKEN": "your-turn-api-token"
  }
}
```

### 4. Set Up TURN Service (Optional)

If you want to use Cloudflare's TURN service:

1. Create a TURN key in the Cloudflare dashboard
2. Set the environment variables as secrets:

```bash
wrangler secret put TURN_KEY_ID
wrangler secret put TURN_KEY_API_TOKEN
```

### 5. Development Build

```bash
# Start development server
npm run dev

# Run tests
npm test

# Generate TypeScript types
npm run cf-typegen
```

## How to Deploy

### 1. Production Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

### 2. Database Migration (Production)

```bash
# Apply schema to production database
wrangler d1 execute webrtc-signaling --env production --file=./schema.sql
```

### 3. Environment Configuration

Ensure your production environment variables are set:

```bash
# Set production secrets
wrangler secret put TURN_KEY_ID --env production
wrangler secret put TURN_KEY_API_TOKEN --env production
```

### 4. Verify Deployment

After deployment, test the endpoints:

- `https://your-worker.your-subdomain.workers.dev/` - Main application
- `https://your-worker.your-subdomain.workers.dev/host.html` - Host interface
- `https://your-worker.your-subdomain.workers.dev/client.html` - Client interface

## Usage

1. **Host**: Navigate to `/host.html` and click "Start Listening"
2. **Guests**: Navigate to `/client.html` to join the conference
3. **Conference**: Guests will automatically connect and send video to the host

## Project Structure

```
cf-video-conf/
├── src/
│   └── index.ts              # Main Worker script with signaling logic
├── public/                   # Static web assets
│   ├── index.html           # Landing page
│   ├── host.html            # Host interface
│   ├── host.js              # Host application logic
│   ├── client.html          # Client interface
│   └── client.js            # Client application logic
├── test/
│   └── index.spec.ts        # Vitest test suite
├── schema.sql               # D1 database schema
├── package.json             # Dependencies and scripts
├── wrangler.jsonc           # Cloudflare Worker configuration
├── tsconfig.json            # TypeScript configuration
└── vitest.config.mts        # Test configuration
```

## API Endpoints

- `POST /signaling` - WebRTC signaling (join, offer, answer, candidate)
- `GET /messages` - Retrieve pending signaling messages
- `POST /turn-credentials` - Generate TURN server credentials

---

Built using Cloudflare Workers, D1, and WebRTC
