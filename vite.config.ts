import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function filesManifestPlugin(): Plugin {
  const filesDir = path.resolve(import.meta.dirname, 'public/files')
  const manifestPath = path.join(filesDir, 'files.json')

  function generate() {
    const files = fs.readdirSync(filesDir)
      .filter(f => f.endsWith('.md'))
      .sort()
    fs.writeFileSync(manifestPath, JSON.stringify(files, null, 2))
    console.log(`[atlas] files.json updated: ${files.join(', ')}`)
  }

  return {
    name: 'atlas-files-manifest',
    buildStart() { generate() },
    configureServer(server) {
      generate()
      server.watcher.on('add',    f => { if (f.startsWith(filesDir) && f.endsWith('.md')) generate() })
      server.watcher.on('unlink', f => { if (f.startsWith(filesDir) && f.endsWith('.md')) generate() })
    },
  }
}

export default defineConfig({
  plugins: [react(), filesManifestPlugin()],
  base: '/Atlas/',
  build: {
    chunkSizeWarningLimit: 600,
  },
})
