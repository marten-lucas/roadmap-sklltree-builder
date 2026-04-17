import { copyFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.resolve(__dirname, '..', 'dist')
const sourceFile = path.join(distDir, 'roadmap-skilltree-builder.html')
const targetFile = path.join(distDir, 'index.html')
const noJekyllFile = path.join(distDir, '.nojekyll')

await copyFile(sourceFile, targetFile)
await writeFile(noJekyllFile, '')

console.log('Prepared GitHub Pages artifact: dist/index.html')
