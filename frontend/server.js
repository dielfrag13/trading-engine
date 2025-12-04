#!/usr/bin/env node
// Simple HTTP server to serve frontend and ticks.jsonl
// This bridges the C++ backend output with the frontend

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle ticks.jsonl endpoint
  if (req.url === '/ticks.jsonl') {
    const ticksPath = path.join(__dirname, '..', 'ticks.jsonl');

    // GET: Serve the file
    if (req.method === 'GET') {
      try {
        fs.statSync(ticksPath);
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        fs.createReadStream(ticksPath).pipe(res);
      } catch (e) {
        // File doesn't exist yet - return empty
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.end();
      }
      return;
    }

    // DELETE: Clear the file
    if (req.method === 'DELETE') {
      try {
        fs.unlinkSync(ticksPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Ticks cleared' }));
      } catch (e) {
        // File doesn't exist - that's fine
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Ticks cleared (was empty)' }));
      }
      return;
    }
  }

  // Serve static files from dist
  let filePath = path.join(__dirname, 'dist', req.url === '/' ? 'index.html' : req.url);
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Try index.html for SPA routing
      filePath = path.join(__dirname, 'dist', 'index.html');
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(filePath);
      let contentType = 'text/html';
      if (ext === '.js') contentType = 'application/javascript';
      else if (ext === '.css') contentType = 'text/css';
      else if (ext === '.json') contentType = 'application/json';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Listening on http://localhost:${PORT}`);
  console.log(`[Server] Serving frontend from dist/`);
  console.log(`[Server] Serving ticks from ../ticks.jsonl`);
});
