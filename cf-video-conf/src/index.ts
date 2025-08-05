/**
 * Simple WebRTC Signaling Server
 * Just handles peer-to-peer connections
 */

interface SignalingMessage {
	type: 'join' | 'offer' | 'answer' | 'candidate';
	peerId: string;
	data?: any;
}

// Simple in-memory storage for peers and messages
const peers = new Set<string>();
const messages = new Map<string, any>();

async function handleSignaling(request: Request, corsHeaders: Record<string, string>): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method not allowed', { status: 405, headers: corsHeaders });
	}

	try {
		const message: SignalingMessage = await request.json();
		const { type, peerId, data } = message;

		console.log(`Signaling: ${type} from ${peerId}`);

		switch (type) {
			case 'join':
				peers.add(peerId);
				console.log(`Peer ${peerId} joined. Total peers: ${peers.size}`);
				
				return new Response(JSON.stringify({
					success: true,
					isInitiator: peers.size === 1,
					peerCount: peers.size
				}), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			
			case 'offer':
			case 'answer':
			case 'candidate':
				// Store message for other peers
				const messageKey = `${peerId}:${Date.now()}`;
				messages.set(messageKey, {
					type,
					data,
					fromPeerId: peerId,
					timestamp: Date.now()
				});

				// Clean up old messages
				cleanupOldMessages();
				console.log(`Stored ${type} from ${peerId}`);

				return new Response(JSON.stringify({ success: true }), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			
			default:
				return new Response('Invalid message type', { status: 400, headers: corsHeaders });
		}
	} catch (error) {
		console.error('Signaling error:', error);
		return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
	}
}

async function handleMessages(request: Request, corsHeaders: Record<string, string>): Promise<Response> {
	const url = new URL(request.url);
	const peerId = url.searchParams.get('peerId');
	const since = parseInt(url.searchParams.get('since') || '0');

	if (!peerId) {
		return new Response('Missing peerId', { status: 400, headers: corsHeaders });
	}

	// Get messages from other peers since timestamp
	const peerMessages = Array.from(messages.entries())
		.filter(([key, msg]) => msg.fromPeerId !== peerId && msg.timestamp > since)
		.map(([_, msg]) => msg)
		.sort((a, b) => a.timestamp - b.timestamp);

	return new Response(JSON.stringify({
		messages: peerMessages,
		timestamp: Date.now()
	}), {
		headers: { ...corsHeaders, 'Content-Type': 'application/json' }
	});
}

function cleanupOldMessages(): void {
	const allMessages = Array.from(messages.entries())
		.sort(([_, a], [__, b]) => b.timestamp - a.timestamp);

	// Keep only the latest 50 messages
	if (allMessages.length > 50) {
		const toDelete = allMessages.slice(50);
		toDelete.forEach(([key]) => messages.delete(key));
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
				return handleSignaling(request, corsHeaders);
			case '/messages':
				return handleMessages(request, corsHeaders);
			default:
				return new Response('Not Found', { status: 404, headers: corsHeaders });
		}
	},
} satisfies ExportedHandler<Env>;