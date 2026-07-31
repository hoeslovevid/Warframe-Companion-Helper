/**
 * Launch server.mjs with --experimental-sqlite when supported (Node 22.5+).
 * Falls back to plain node if the flag is unrecognized.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const server = path.join(here, 'server.mjs')

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: process.env,
      windowsHide: true,
    })
    child.on('exit', (code, signal) => resolve({ code: code ?? 1, signal }))
    child.on('error', () => resolve({ code: 1, signal: null }))
  })
}

const withFlag = await run(['--experimental-sqlite', server])
// Node exits 9 for unknown CLI flags (e.g. Node 18).
if (withFlag.code === 9) {
  const plain = await run([server])
  process.exit(plain.code)
}
process.exit(withFlag.code)
