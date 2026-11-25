import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const entryPoint = join(projectRoot, 'scripts', 'verify-collisions.entry.ts')
const outfile = join(projectRoot, 'node_modules', '.cache', 'verify-collisions.mjs')

await mkdir(dirname(outfile), { recursive: true })
await build({
  entryPoints: [entryPoint],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile,
  logLevel: 'warning',
})

await import(pathToFileURL(outfile).href)
