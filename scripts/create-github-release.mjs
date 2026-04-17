import { spawnSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const packageJsonPath = path.join(rootDir, 'package.json')
const releaseAssetPath = path.join(rootDir, 'dist', 'roadmap-skilltree-builder.html')

function run(command, args, { inherit = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(detail || `${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }

  return result.stdout?.trim() ?? ''
}

function normalizeVersionTag(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    throw new Error('package.json version is empty.')
  }

  return raw.startsWith('v') ? raw : `v${raw}`
}

function printHelp() {
  console.log(`Usage:\n  npm run build:release\n  npm run build:release -- v1.2.3\n  npm run release:github -- v1.2.3 --draft\n  npm run release:github -- --dry-run\n\nNotes:\n- Without a tag argument, the script uses the package.json version and normalizes the leading v automatically.\n- Use --dry-run to preview the exact tag, title, branch, and asset without publishing anything.\n- Requires the official GitHub CLI and a logged-in session via gh auth login for the real release.\n- The published release includes dist/roadmap-skilltree-builder.html as a downloadable asset.`)
}

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  printHelp()
  process.exit(0)
}

let tagArg = null
let draft = false
let dryRun = false

for (const arg of args) {
  if (arg === '--draft') {
    draft = true
    continue
  }

  if (arg === '--dry-run') {
    dryRun = true
    continue
  }

  if (arg.startsWith('-')) {
    throw new Error(`Unknown option: ${arg}`)
  }

  if (!tagArg) {
    tagArg = arg
    continue
  }

  throw new Error(`Unexpected extra argument: ${arg}`)
}

const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8'))
const tag = tagArg || normalizeVersionTag(pkg.version)
const title = `${pkg.name} ${tag}`

await access(releaseAssetPath)

const currentSha = run('git', ['rev-parse', 'HEAD'])
const currentBranch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
const repoStatus = run('git', ['status', '--short'])

if (dryRun) {
  console.log('Dry run only. No release was created.')
  console.log(`Tag: ${tag}`)
  console.log(`Title: ${title}`)
  console.log(`Branch: ${currentBranch}`)
  console.log(`Commit: ${currentSha}`)
  console.log(`Asset: ${releaseAssetPath}`)
  process.exit(0)
}

const ghHelp = spawnSync('gh', ['release', '--help'], {
  cwd: rootDir,
  encoding: 'utf8',
  stdio: 'pipe',
})

if (ghHelp.error || ghHelp.status !== 0) {
  throw new Error(
    'The official GitHub CLI is required for build:release. Install GitHub CLI and run gh auth login.',
  )
}

try {
  run('gh', ['auth', 'status'])
} catch {
  throw new Error('GitHub CLI is not authenticated yet. Run gh auth login first.')
}

if (repoStatus) {
  console.warn('Warning: there are uncommitted changes. The release will reflect the currently committed HEAD.')
}

console.log(`Pushing ${currentBranch} to origin...`)
run('git', ['push', 'origin', `HEAD:${currentBranch}`], { inherit: true })

const releaseArgs = [
  'release',
  'create',
  tag,
  releaseAssetPath,
  '--target',
  currentSha,
  '--title',
  title,
  '--generate-notes',
]

if (draft) {
  releaseArgs.push('--draft')
} else {
  releaseArgs.push('--latest')
}

console.log(`Creating GitHub release ${tag}...`)
run('gh', releaseArgs, { inherit: true })
console.log(`GitHub release ${tag} created successfully.`)
