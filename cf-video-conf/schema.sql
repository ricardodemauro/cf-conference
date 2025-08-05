-- WebRTC Signaling Database Schema
-- Run: wrangler d1 execute webrtc-signaling --file=./schema.sql

-- Peers table for persistent session management
CREATE TABLE IF NOT EXISTS peers (
    peer_id TEXT PRIMARY KEY,
    joined_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    peer_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('offer', 'answer', 'candidate')),
    data TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_peers_last_seen 
ON peers(last_seen);

CREATE INDEX IF NOT EXISTS idx_messages_peer_timestamp 
ON messages(peer_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
ON messages(timestamp);
