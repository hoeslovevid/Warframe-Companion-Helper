import fs from 'node:fs'
import { EventEmitter } from 'node:events'

export type LogEvent = { type: 'relic_rewards' }

const REWARD_PATTERNS = [
  /Got rewards/i,
  /Relic rewards initialized/i,
  /ProjectionRewardChoice/i,
]

/**
 * Tail Warframe EE.log for fissure reward-screen markers.
 * Log writes are buffered by the game, so pair with a manual hotkey.
 */
export class LogWatcher extends EventEmitter {
  private path: string | null = null
  private offset = 0
  private timer: NodeJS.Timeout | null = null
  private lastEmit = 0

  setPath(next: string | null) {
    this.path = next
    this.offset = 0
    if (next && fs.existsSync(next)) {
      try {
        this.offset = fs.statSync(next).size
      } catch {
        this.offset = 0
      }
    }
  }

  start(intervalMs = 2500) {
    this.stop()
    this.timer = setInterval(() => this.tick(), intervalMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private tick() {
    if (!this.path || !fs.existsSync(this.path)) return
    try {
      const stat = fs.statSync(this.path)
      if (stat.size < this.offset) this.offset = 0 // log rotated
      if (stat.size === this.offset) return

      const fd = fs.openSync(this.path, 'r')
      const length = stat.size - this.offset
      const buf = Buffer.alloc(length)
      fs.readSync(fd, buf, 0, length, this.offset)
      fs.closeSync(fd)
      this.offset = stat.size

      const chunk = buf.toString('utf8')
      if (!REWARD_PATTERNS.some((re) => re.test(chunk))) return

      const now = Date.now()
      if (now - this.lastEmit < 8000) return
      this.lastEmit = now
      this.emit('event', { type: 'relic_rewards' } satisfies LogEvent)
    } catch (err) {
      console.error('[Everything Warframe] EE.log watch error', err)
    }
  }
}
