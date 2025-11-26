import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'

// Vite plugin to handle DELETE /ticks.jsonl
const ticksDeletePlugin: Plugin = {
  name: 'ticks-delete',
  configureServer(server) {
    return () => {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/ticks.jsonl' && req.method === 'DELETE') {
          try {
            // ticks.jsonl is in the parent directory (trading-engine/)
            const ticksPath = path.join(process.cwd(), '..', 'ticks.jsonl')
            if (fs.existsSync(ticksPath)) {
              fs.unlinkSync(ticksPath)
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false }))
          }
          return
        }
        next()
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ticksDeletePlugin],
})

