# Cloudflare Workers WebRTC Video Conferencing Project

## Project Overview
This is a **Cloudflare Workers-based video conferencing application** leveraging WebRTC for real-time communication. The project uses TypeScript and is designed to run on Cloudflare's edge compute platform.

## Architecture & Key Components

### Core Stack
- **Runtime**: Cloudflare Workers (edge compute)
- **Language**: TypeScript with strict type checking
- **Testing**: Vitest with `@cloudflare/vitest-pool-workers` for Workers-specific testing
- **Build Tool**: Wrangler (Cloudflare's CLI and build tool)
- **Static Assets**: Served from `public/` directory via Workers Assets

### Project Structure
```
src/index.ts          # Main Worker entry point - handles HTTP requests
public/               # Static assets (HTML, JS, CSS)
test/                 # Vitest tests with Workers simulation
wrangler.jsonc        # Cloudflare Workers configuration
worker-configuration.d.ts  # Auto-generated types from `wrangler types`
```

## Development Workflow

### Essential Commands
```bash
npm run dev           # Start local development server (wrangler dev)
npm run deploy        # Deploy to Cloudflare Workers
npm run test          # Run Vitest tests
npm run cf-typegen    # Regenerate worker-configuration.d.ts types
```

### Critical Files to Understand
- **`src/index.ts`**: Implements `ExportedHandler<Env>` interface with `fetch()` method for HTTP handling
- **`wrangler.jsonc`**: Controls deployment config, bindings, compatibility flags, and asset serving
- **`worker-configuration.d.ts`**: Auto-generated types - DO NOT edit manually, use `npm run cf-typegen`

## Workers-Specific Patterns

### Request Handling
```typescript
export default {
  async fetch(request, env, ctx): Promise<Response> {
    // URL routing based on pathname
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/api/endpoint':
        return handleAPI(request);
      default:
        // Static assets served automatically from public/
        return new Response('Not Found', { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;
```

### Testing Approach
- **Unit tests**: Use `createExecutionContext()` and call worker directly
- **Integration tests**: Use `SELF.fetch()` for end-to-end request simulation
- Tests run in Workers environment via `@cloudflare/vitest-pool-workers`

### WebRTC Integration Points
- **WebSocket API**: Available via `WebSocket` and `WebSocketPair` for signaling
- **Static assets**: Client-side WebRTC code served from `public/`
- **TURN/STUN**: Configure external services or use Cloudflare's connectivity

## Configuration Management

### Environment & Bindings
- Add bindings in `wrangler.jsonc` (databases, KV, R2, etc.)
- Run `npm run cf-typegen` after changing bindings to update types
- Access bindings via `env` parameter in fetch handler

### Compatibility Flags
- Current: `global_fetch_strictly_public` - ensures fetch() follows web standards
- Update `compatibility_date` when adding new Workers features

## WebRTC Development Notes

### Signaling Server Pattern
- Use WebSocket connections for peer signaling
- Store connection state in Durable Objects for persistence
- Handle ICE candidates, offers, and answers through WebSocket messages

### Client-Server Communication
- Serve WebRTC client code from `public/index.html` and `public/index.js`
- API endpoints in Workers handle room management, user authentication
- Real-time signaling via WebSocket upgrades

### Edge Deployment Considerations
- Workers run at 300+ global locations
- Stateless by default - use Durable Objects for room state
- WebSocket connections are automatically load-balanced

## Common Gotchas
- **Types**: Always regenerate `worker-configuration.d.ts` after wrangler.jsonc changes
- **Local dev**: Static assets served differently in dev vs production
- **WebSocket**: Use `WebSocketPair` for internal communication, standard `WebSocket` for clients
- **Compatibility**: Check Workers runtime compatibility for WebRTC features

## Next Development Steps
1. Implement WebSocket signaling endpoints in `src/index.ts`
2. Add Durable Objects for room state management
3. Build client-side WebRTC peer connection logic in `public/`
4. Add user authentication and room management APIs
