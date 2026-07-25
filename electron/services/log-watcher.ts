import fs from 'node:fs'
import { EventEmitter } from 'node:events'

export type LogEvent = { type: 'relic_rewards' | 'relic_rewards_end' }

/** Markers that the fissure reward pick screen is up (AlecaFrame / WFInfo style). */
const REWARD_START_PATTERNS = [
  /ProjectionRewardChoice\.lua:\s*Relic rewards initialized/i,
  /Relic rewards initialized/i,
  /ProjectionRewardChoice/i,
]

/**
 * Markers that the pick screen is gone / mission moved on.
 * EE.log buffering makes these imperfect — pair with auto-hide timeout.
 */
const REWARD_END_PATTERNS = [
  /ProjectionRewardChoice\.lua:.*(?:Selected|Choice made|Closing|closed)/i,
  /EndOfMatch\.lua/i,
  /Got rewards screen closed/i,
]

/**
 * Tail Warframe EE.log for fissure reward-screen markers.
 * Log writes are buffered by the game, so pair with a manual hotkey.
 */
export class LogWatcher extends EventEmitter {
  private path: string | null = null
  private offset = 0
  private timer: NodeJS.Timeout | null = null
  private lastStartEmit = 0
  private lastEndEmit = 0
  private rewardScreenOpen = false

  setPath(next: string | null) {
    this.path = next
    this.offset = 0
    this.rewardScreenOpen = false
    if (next && fs.existsSync(next)) {
      try {
        this.offset = fs.statSync(next).size
      } catch {
        this.offset = 0
      }
    }
  }

  start(intervalMs = 1500) {
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
      const now = Date.now()

      if (REWARD_START_PATTERNS.some((re) => re.test(chunk))) {
        if (now - this.lastStartEmit >= 5000) {
          this.lastStartEmit = now
          this.rewardScreenOpen = true
          this.emit('event', { type: 'relic_rewards' } satisfies LogEvent)
        }
        return
      }

      if (
        this.rewardScreenOpen &&
        REWARD_END_PATTERNS.some((re) => re.test(chunk)) &&
        now - this.lastEndEmit >= 2000
      ) {
        this.lastEndEmit = now
        this.rewardScreenOpen = false
        this.emit('event', { type: 'relic_rewards_end' } satisfies LogEvent)
      }
    } catch (err) {
      console.error('[Everything Warframe] EE.log watch error', err)
    }
  }
}
