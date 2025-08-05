/**
 * Simple WebRTC Signaling Server with D1 Database
 * Just handles peer-to-peer connections with persistent storage
 */

interface SignalingMessage {
	type: 'join' | 'offer' | 'answer' | 'candidate';
	peerId: string;
	data?: any;
}

interface Env {
	DB: D1Database;
}

// Helper functions for peer management
async function addPeer(peerId: string, env: Env): Promise<void> {
	const now = Date.now();
	await env.DB.prepare(`
		INSERT OR REPLACE INTO peers (peer_id, joined_at, last_seen)
		VALUES (?, ?, ?)
	`).bind(peerId, now, now).run();
}

async function updatePeerLastSeen(peerId: string, env: Env): Promise<void> {
	await env.DB.prepare(`
		UPDATE peers SET last_seen = ? WHERE peer_id = ?
	`).bind(Date.now(), peerId).run();
}

async function getActivePeerCount(env: Env): Promise<number> {
	// Consider peers active if seen within last 5 minutes
	const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
	
	const result = await env.DB.prepare(`
		SELECT COUNT(*) as count FROM peers WHERE last_seen > ?
	`).bind(fiveMinutesAgo).first();
	
	return result?.count as number || 0;
}

async function cleanupInactivePeers(env: Env): Promise<void> {
	// Remove peers inactive for more than 1 hour
	const oneHourAgo = Date.now() - (60 * 60 * 1000);
	
	await env.DB.prepare(`
		DELETE FROM peers WHERE last_seen < ?
	`).bind(oneHourAgo).run();
}

async function handleSignaling(request: Request, corsHeaders: Record<string, string>, env: Env): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405, headers: corsHeaders });
	}

	try {
		const message: SignalingMessage = await request.json();
		const { type, peerId, data } = message;

		console.log(`Signaling: ${type} from ${peerId}`);

		switch (type) {
			case 'join':
				return handleSignalingJoin(peerId, corsHeaders, env);
			
			case 'offer':
			case 'answer':
			case 'candidate':
				return handleSignalingMessage(type, peerId, data, corsHeaders, env);
			
			default:
				return new Response('Invalid message type', { status: 400, headers: corsHeaders });
		}
	} catch (error) {
		console.error('Signaling error:', error);
		return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
	}
}

async function handleSignalingJoin(peerId: string, corsHeaders: Record<string, string>, env: Env): Promise<Response> {
	// Add peer to database
	await addPeer(peerId, env);
	
	// Clean up inactive peers
	await cleanupInactivePeers(env);
	
	// Get current active peer count
	const peerCount = await getActivePeerCount(env);
	
	console.log(`Peer ${peerId} joined. Total active peers: ${peerCount}`);
	
	return new Response(JSON.stringify({
		success: true,
		isInitiator: peerCount === 1,
		peerCount: peerCount
	}), {
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
}

async function handleSignalingMessage(
	type: 'offer' | 'answer' | 'candidate', 
	peerId: string, 
	data: any, 
	corsHeaders: Record<string, string>,
	env: Env
): Promise<Response> {
	try {
		// Store message in D1 database
		await env.DB.prepare(`
			INSERT INTO messages (peer_id, type, data, timestamp)
			VALUES (?, ?, ?, ?)
		`).bind(peerId, type, JSON.stringify(data), Date.now()).run();

		// Clean up old messages
		await cleanupOldMessages(env);
		console.log(`Stored ${type} from ${peerId} in D1`);

		return new Response(JSON.stringify({ success: true }), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Database error:', error);
		return new Response('Database error', { status: 500, headers: corsHeaders });
	}
}

async function handleMessages(request: Request, corsHeaders: Record<string, string>, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const peerId = url.searchParams.get('peerId');
	const since = parseInt(url.searchParams.get('since') || '0');

	if (!peerId) {
		return new Response('Missing peerId', { status: 400, headers: corsHeaders });
	}

	try {
		// Update peer's last seen timestamp
		await updatePeerLastSeen(peerId, env);
		
		// Get messages from other peers since timestamp
		const result = await env.DB.prepare(`
			SELECT type, data, peer_id as fromPeerId, timestamp
			FROM messages 
			WHERE peer_id != ? AND timestamp > ?
			ORDER BY timestamp ASC
		`).bind(peerId, since).all();

		const peerMessages = result.results || [];

		return new Response(JSON.stringify({
			messages: peerMessages,
			timestamp: Date.now()
		}), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Database error:', error);
		return new Response('Database error', { status: 500, headers: corsHeaders });
	}
}

async function cleanupOldMessages(env: Env): Promise<void> {
	try {
		// Delete messages older than 1 hour
		const oneHourAgo = Date.now() - (60 * 60 * 1000);
		
		await env.DB.prepare(`
			DELETE FROM messages 
			WHERE timestamp < ?
		`).bind(oneHourAgo).run();
		
		// Also cleanup inactive peers
		await cleanupInactivePeers(env);
		
		console.log('Cleaned up old messages and inactive peers');
	} catch (error) {
		console.error('Error cleaning up messages:', error);
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		
		// Enable CORS for all requests
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		// Handle preflight requests
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		switch (url.pathname) {
			case '/signaling':
				return handleSignaling(request, corsHeaders, env);
			case '/messages':
				return handleMessages(request, corsHeaders, env);
			default:
				return new Response('Not Found', { status: 404, headers: corsHeaders });
		}
	},
} satisfies ExportedHandler<Env>;