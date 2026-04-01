import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SINGLE_FILE_OUTPUT = 'roadmap-skilltree-builder.html'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeInlineScript(code) {
  return code.replace(/<\/script/gi, '<\\/script')
}

function escapeInlineStyle(code) {
  return code.replace(/<\/style/gi, '<\\/style')
}

function minifySingleFileHtml(html) {
  return html
    .replace(/<!--[^]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim()
}

function singleFileHtmlPlugin(outputFileName) {
  let outDir = ''

  return {
    name: 'single-file-html',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    async writeBundle(_, bundle) {
      const sourceHtmlPath = path.join(outDir, 'index.html')
      const targetHtmlPath = path.join(outDir, outputFileName)
      let html = await readFile(sourceHtmlPath, 'utf8')

      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk' && item.fileName.endsWith('.js')) {
          const scriptPattern = new RegExp(
            `<script\\b[^>]*\\bsrc=(['\"])(?:\\.\\/|\\/)?${escapeRegExp(item.fileName)}\\1[^>]*><\\/script>`,
            'g',
          )
          html = html.replace(
            scriptPattern,
            () => `<script type="module">${escapeInlineScript(item.code)}</script>`,
          )
        }

        if (item.type === 'asset' && item.fileName.endsWith('.css')) {
          const css = typeof item.source === 'string' ? item.source : item.source.toString()
          const stylesheetPattern = new RegExp(
            `<link\\b[^>]*\\bhref=(['\"])(?:\\.\\/|\\/)?${escapeRegExp(item.fileName)}\\1[^>]*>`,
            'g',
          )
          html = html.replace(stylesheetPattern, () => `<style>${escapeInlineStyle(css)}</style>`)
        }
      }

      html = minifySingleFileHtml(
        html.replace(/<link\\b[^>]*\\brel=(['\"])modulepreload\\1[^>]*>/g, ''),
      )

      await writeFile(targetHtmlPath, html)
      await rm(sourceHtmlPath, { force: true })

      const outDirEntries = await readdir(outDir, { withFileTypes: true })
      for (const entry of outDirEntries) {
        if (entry.name !== outputFileName) {
          await rm(path.join(outDir, entry.name), { force: true, recursive: true })
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), singleFileHtmlPlugin(SINGLE_FILE_OUTPUT)],
  css: {
    postcss: {
      plugins: [],
    },
  },
  build: {
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    minify: 'esbuild',
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
})
