#!/usr/bin/env node
// Hook Claude Code : réserve les fichiers avant écriture et remonte l'état de l'agent à RoSwarm.
// En cas de problème de connexion, on laisse toujours passer (exit 0).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const AGENT = arg('--agent') || process.env.ROSWARM_AGENT || 'unknown';
const EVENT = arg('--event') || 'unknown';
const HOME = arg('--home') || process.env.ROSWARM_HOME || path.join(os.homedir(), '.roswarm');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', run);
setTimeout(() => process.exit(0), 8000).unref();

function run() {
  let payload = {};
  try {
    payload = JSON.parse(input || '{}');
  } catch {}
  let conn;
  try {
    conn = JSON.parse(fs.readFileSync(path.join(HOME, 'connection.json'), 'utf8'));
  } catch {
    process.exit(0);
  }
  const body = Buffer.from(JSON.stringify({ agentId: AGENT, event: EVENT, payload }));
  const req = http.request(
    {
      host: '127.0.0.1',
      port: conn.port,
      path: '/api/hook',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': body.length, 'x-roswarm-token': conn.token },
      timeout: 5000,
    },
    (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        try {
          const r = JSON.parse(text);
          if (r.block) {
            process.stderr.write(r.reason || 'Bloqué par RoSwarm.');
            process.exit(2);
          }
        } catch {}
        process.exit(0);
      });
    },
  );
  req.on('error', () => process.exit(0));
  req.on('timeout', () => process.exit(0));
  req.end(body);
}
