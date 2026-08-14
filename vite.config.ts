import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import pkg from './package.json' with { type: 'json' };

interface ManifestEntry {
  name: string
  slug: string
  group: string
  tags: string[]
}

function parseTags(content: string): string[] {
  // Normalize line endings before parsing
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const fm = normalized.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) return []
  const block = fm[1]

  // Inline: tags: [tag1, tag2]
  const inline = block.match(/^tags:\s*\[([^\]]*)\]/m)
  if (inline) return inline[1].split(',').map(t => t.trim().replace(/['"]/g, '')).filter(Boolean)

  // Block list: tags:\n  - tag1
  const blockMatch = block.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m)
  if (blockMatch) return blockMatch[1].match(/- (.+)/g)?.map(t => t.replace('- ', '').trim()) ?? []

  return []
}

function filesManifestPlugin(): Plugin {
  const filesDir = path.resolve(process.cwd(), 'public/files')
  const manifestPath = path.join(filesDir, 'files.json')

  function generate() {
    const entries: ManifestEntry[] = []

    function scanDir(dir: string, group: string) {
      const items = fs.readdirSync(dir).sort()
      for (const item of items) {
        const full = path.join(dir, item)
        const stat = fs.statSync(full)
        if (stat.isDirectory()) {
          scanDir(full, item)
        } else if (item.endsWith('.md')) {
          const content = fs.readFileSync(full, 'utf-8')
          const tags = parseTags(content)
          const slug = group ? `${group}/${item.replace(/\.md$/, '')}` : item.replace(/\.md$/, '')
          entries.push({ name: item, slug, group, tags })
        }
      }
    }

    scanDir(filesDir, '')
    fs.writeFileSync(manifestPath, JSON.stringify(entries, null, 2))
    console.log(`[atlas] files.json updated: ${entries.length} files across ${new Set(entries.map(e => e.group || 'root')).size} group(s)`)
  }

  return {
    name: 'atlas-files-manifest',
    buildStart() { generate() },
    configureServer(server) {
      generate()
      server.watcher.on('add',    f => { if (f.startsWith(filesDir)) generate() })
      server.watcher.on('unlink', f => { if (f.startsWith(filesDir)) generate() })
      server.watcher.on('change', f => { if (f.startsWith(filesDir) && f.endsWith('.md')) generate() })
    },
  }
}

export default defineConfig({
  plugins: [react(), filesManifestPlugin()],
  base: '/Atlas/',
  build: {
    chunkSizeWarningLimit: 600,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
