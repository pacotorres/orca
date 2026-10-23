import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Script } from 'node:vm'
import { build } from 'esbuild'

const pluginDir = import.meta.dirname
const agentVerseRoot = process.argv[2]
if (!agentVerseRoot) {
  throw new Error('Pass the AgentVerse repository path: node build.mjs /path/to/agentverse')
}

const frontendDir = path.resolve(agentVerseRoot, 'frontend')
const [template, bundle] = await Promise.all([
  readFile(path.join(pluginDir, 'office.template.html'), 'utf8'),
  build({
    absWorkingDir: frontendDir,
    entryPoints: ['src/orca/entry.tsx'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    minify: true,
    legalComments: 'none',
    jsx: 'automatic',
    tsconfig: path.join(frontendDir, 'tsconfig.json'),
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.NEXT_PUBLIC_AGENTVERSE_SERVER': '""',
      'process.env.NEXT_PUBLIC_AGENTVERSE_SAMEORIGIN': '"0"'
    }
  })
])

if (bundle.outputFiles.length !== 1) {
  throw new Error('Expected one self-contained browser bundle')
}
const runtime = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
new Script(runtime, { filename: 'voxel-office.bundle.js' })
const marker = '<!-- VOXEL_RUNTIME -->'
if (!template.includes(marker)) {
  throw new Error('Runtime marker is missing from office.template.html')
}
const html = template.replace(marker, () => runtime)
const bytes = Buffer.byteLength(html)
if (bytes > 10 * 1024 * 1024) {
  throw new Error(`Plugin entry is ${bytes} bytes; Orca's limit is 10 MiB`)
}

await writeFile(path.join(pluginDir, 'office.html'), html)
process.stdout.write(
  `Built ${path.join(pluginDir, 'office.html')} (${(bytes / 1024 / 1024).toFixed(2)} MiB)\n`
)
