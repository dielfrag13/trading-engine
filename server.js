#!/usr/bin/env node
/**
 * Standalone tick server
 * Polls ticks.jsonl and serves via HTTP
 * Supports clearing buffer via DELETE request
 * Works with Vite dev server on 5173
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const TICKS_FILE = path.join(__dirname, 'ticks.jsonl');
const POLL_INTERVAL = 200; // ms

// In-memory circular buffer
const buffer = [];
const MAX_BUFFER_SIZE = 500;
let lastReadLines = 0;
let currentRunId = null;  // Track current run ID

/**
 * Poll the ticks.jsonl file and add new lines to buffer
 */
function pollTicksFile() {
  try {
    if (!fs.existsSync(TICKS_FILE)) {
      return;
    }

    const content = fs.readFileSync(TICKS_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter((l) => l.length > 0);

    // Only process new lines since last read
    if (lines.length > lastReadLines) {
      const newLines = lines.slice(lastReadLines);
      
      for (const line of newLines) {
        // Track RunStart events to detect new engine runs
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'RunStart' && msg.data?.runId !== currentRunId) {
            // New run detected - clear old data and start fresh
            currentRunId = msg.data?.runId;
            buffer.length = 0;
            console.log(`[TickServer] New run detected: ${currentRunId}, cleared buffer`);
          }
        } catch (e) {
          // Not JSON, skip parsing
        }

        buffer.push(line);
        // Keep buffer size bounded
        if (buffer.length > MAX_BUFFER_SIZE) {
          buffer.shift();
        }
      }

      lastReadLines = lines.length;
    }
  } catch (e) {
    console.error('[TickServer] Error polling ticks file:', e);
  }
}

/**
 * Clear the buffer and truncate the ticks file
 */
function clearBuffer() {
  buffer.length = 0;
  lastReadLines = 0;
  currentRunId = null;
  
  // Truncate the ticks.jsonl file so old data doesn't come back
  try {
    fs.writeFileSync(TICKS_FILE, '');
    console.log('[TickServer] Buffer cleared and ticks.jsonl truncated');
  } catch (e) {
    console.error('[TickServer] Error truncating ticks file:', e);
  }
}

/**
 * Start polling
 */
const pollInterval = setInterval(pollTicksFile, POLL_INTERVAL);

/**
 * HTTP Server
 */
const server = http.createServer((req, res) => {
  // Enable CORS for requests from Vite dev server
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // GET /api/ticks - return buffer as JSONL
  if (req.url === '/api/ticks' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.end(buffer.join('\n') + (buffer.length > 0 ? '\n' : ''));
    return;
  }

  // DELETE /api/ticks - clear buffer
  if (req.url === '/api/ticks' && req.method === 'DELETE') {
    clearBuffer();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Health check
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bufferSize: buffer.length }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[TickServer] Listening on http://localhost:${PORT}`);
  console.log(`[TickServer] Polling ticks.jsonl every ${POLL_INTERVAL}ms`);
  console.log(`[TickServer] GET /api/ticks - fetch buffer`);
  console.log(`[TickServer] DELETE /api/ticks - clear buffer`);
  console.log(`[TickServer] GET /health - check status`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[TickServer] Shutting down...');
  clearInterval(pollInterval);
  server.close(() => {
    console.log('[TickServer] Closed');
    process.exit(0);
  });
});
