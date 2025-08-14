#!/usr/bin/env node

// WebSocket-to-STDIO bridge for Hypergrid MCP Shim
// - Spawns the shim with npx
// - Auto-authorizes with provided public test credentials on first connection
// - Bridges JSON-RPC between browser WebSocket and MCP stdio transport

import { WebSocketServer } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const PORT = Number(process.env.HYPERGRID_WS_PORT || 10126);

// Public test credentials (provided by user) - safe for non-sensitive testing
const TEST_AUTH = {
  url: 'https://anotherdayanothertestingnodeweb.hosting.hyperware.ai/operator:hypergrid:grid-beta.hypr/shim/mcp',
  token: 'AW0mu3VCDQeaywPpbyyQChjHMopEW1x6',
  client_id: 'hypergrid-beta-mcp-shim-bbc41533-17c1-43a1-88f4-faf4726cb137',
  node: 'anotherdayanothertestingnodeweb.os'
};

// Spawn shim via npx
async function createShimClient() {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['@hyperware-ai/hypergrid-mcp'],
    env: process.env,
    stderr: 'pipe'
  });

  const client = new Client({ name: 'kibitz-ui', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

// Ensure authorized (idempotent; shim writes to ~/.hypergrid/configs/grid-shim-api.json)
async function ensureAuthorized(client) {
  try {
    await client.callTool({ name: 'authorize', arguments: TEST_AUTH });
    console.log('[hypergrid-bridge] Authorized successfully');
  } catch (err) {
    // If already authorized or tool rejects duplicate, continue
    console.warn('[hypergrid-bridge] authorize tool call warning:', err?.message || err);
  }
}

// List tools from shim
async function listTools(client) {
  const tools = await client.listTools();
  return tools.tools || [];
}

// Convert MCP SDK results to WS-MCP JSON-RPC-style result envelope
function toWsMcpResult(id, payload) {
  return JSON.stringify({ jsonrpc: '2.0', id, result: payload });
}

function toWsMcpError(id, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } });
}

async function start() {
  const wss = new WebSocketServer({ port: PORT });
  console.log(`[hypergrid-bridge] Listening on ws://localhost:${PORT}`);

  wss.on('connection', async (ws) => {
    console.log('[hypergrid-bridge] Client connected');
    let client;
    const clientReady = (async () => {
      try {
        client = await createShimClient();
        await ensureAuthorized(client);
        return true;
      } catch (err) {
        console.error('[hypergrid-bridge] Failed to start shim:', err);
        try { ws.close(1011, 'Failed to start Hypergrid shim'); } catch {}
        throw err;
      }
    })();

    ws.on('message', async (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      const { id, method, params } = msg || {};

      // Minimal WS-MCP compatibility: initialize, tools/list, tools/call
      try {
        // Ensure shim client is ready before handling any messages
        await clientReady;

        if (typeof method === 'string' && method.startsWith('notifications/')) {
          // Ignore client-side notifications (no response expected)
          return;
        }

        if (method === 'initialize') {
          // Acknowledge and then emit tools list request
          ws.send(toWsMcpResult(id, { capabilities: { tools: {} } }));
          return;
        }

        if (method === 'tools/list') {
          const tools = await listTools(client);
          // Convert to ws-mcp tool schema (input_schema instead of parameters)
          const mapped = tools.map((t) => ({
            name: t.name,
            description: t.description || '',
            inputSchema: t.input_schema || { type: 'object', properties: {}, required: [] }
          }));
          ws.send(toWsMcpResult(id, { tools: mapped }));
          return;
        }

        if (method === 'tools/call') {
          const { name, arguments: args } = params || {};
          const result = await client.callTool({ name, arguments: args || {} });

          // Try to normalize content to string like rootStore expects
          let contentText = '';
          if (typeof result === 'string') {
            contentText = result;
          } else if (result?.content && Array.isArray(result.content)) {
            contentText = result.content
              .filter((item) => item.type === 'text')
              .map((item) => item.text)
              .join('\n');
          } else if (result?.content && typeof result.content === 'string') {
            contentText = result.content;
          } else {
            contentText = JSON.stringify(result);
          }

          ws.send(toWsMcpResult(id, { content: contentText }));
          return;
        }

        // Unknown method
        ws.send(toWsMcpError(id, `Unknown method: ${method}`));
      } catch (err) {
        ws.send(toWsMcpError(id, err?.message || String(err)));
      }
    });

    ws.on('close', async () => {
      try { await client?.close?.(); } catch {}
      console.log('[hypergrid-bridge] Client disconnected');
    });
  });
}

start().catch((e) => {
  console.error('[hypergrid-bridge] Fatal:', e);
  process.exit(1);
});


