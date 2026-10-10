#!/usr/bin/env node
// Pont MCP (stdio) lancé par chaque agent. Il relaie les appels d'outils au serveur RoSwarm.
// Aucune dépendance : JSON-RPC ligne par ligne sur stdin/stdout.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const readline = require('node:readline');
const { TOOLS } = require('./tooldefs.cjs');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const AGENT = arg('--agent') || process.env.ROSWARM_AGENT || 'unknown';
const HOME = arg('--home') || process.env.ROSWARM_HOME || path.join(os.homedir(), '.roswarm');

function connection() {
  return JSON.parse(fs.readFileSync(path.join(HOME, 'connection.json'), 'utf8'));
}

function api(method, route, body) {
  return new Promise((resolve, reject) => {
    let conn;
    try {
      conn = connection();
    } catch {
      return reject(new Error("RoSwarm n'est pas lancé (connection.json introuvable)."));
    }
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: conn.port,
        path: route,
        method,
        headers: {
          'content-type': 'application/json',
          'x-roswarm-token': conn.token,
          ...(data ? { 'content-length': data.length } : {}),
        },
        timeout: 200000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error(`Réponse invalide du serveur (${res.statusCode}): ${text.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error("Délai dépassé en attendant RoSwarm.")));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

const DEFAULT_INSTRUCTIONS =
  'RoSwarm connects you to Roblox Studio and to the other AI agents working on the same game. ' +
  'Before starting, call agents_status and board_read. Reserve what you edit with claim, release it when done.';

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === undefined || (typeof method === 'string' && method.startsWith('notifications/'))) return;
  try {
    let result;
    if (method === 'initialize') {
      let instructions = DEFAULT_INSTRUCTIONS;
      try {
        const hello = await api('GET', '/api/mcp/hello?agent=' + encodeURIComponent(AGENT));
        if (hello && hello.instructions) instructions = hello.instructions;
      } catch {}
      result = {
        protocolVersion: (params && params.protocolVersion) || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'roswarm', version: '0.1.0' },
        instructions,
      };
    } else if (method === 'ping') {
      result = {};
    } else if (method === 'tools/list') {
      result = { tools: TOOLS };
    } else if (method === 'tools/call') {
      try {
        const r = await api('POST', '/api/mcp/call', {
          agentId: AGENT,
          tool: params && params.name,
          args: (params && params.arguments) || {},
        });
        result = { content: [{ type: 'text', text: String(r.text ?? r.error ?? '') }], isError: !!(r.isError || r.error) };
      } catch (e) {
        result = { content: [{ type: 'text', text: 'Erreur RoSwarm : ' + e.message }], isError: true };
      }
    } else if (method === 'resources/list') {
      result = { resources: [] };
    } else if (method === 'prompts/list') {
      result = { prompts: [] };
    } else {
      if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } });
      return;
    }
    if (id !== undefined) send({ jsonrpc: '2.0', id, result });
  } catch (e) {
    if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } });
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  if (Array.isArray(msg)) msg.forEach(handle);
  else handle(msg);
});
rl.on('close', () => process.exit(0));
