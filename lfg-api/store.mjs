/**
 * LFG persistence layer.
 * Prefer built-in node:sqlite (Node 22.5+) on a durable volume — no native addons.
 * Fall back to atomic JSON for Electron local hubs (older embedded Node).
 *
 * Env:
 *   LFG_DATA      — full path to .sqlite or .json
 *   LFG_DATA_DIR  — directory (default file: lfg.sqlite inside it)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * @typedef {object} LfgStore
 * @property {string} kind
 * @property {string} path
 * @property {() => number} count
 * @property {() => number} purgeExpired
 * @property {(filters?: { region?: string, platform?: string, activity?: string, q?: string }) => any[]} list
 * @property {(id: string) => any | null} get
 * @property {(row: any) => void} upsert
 * @property {(id: string) => void} remove
 * @property {() => void} [close]
 */

export function resolveDataPath() {
  if (process.env.LFG_DATA) return path.resolve(process.env.LFG_DATA)
  const dir = process.env.LFG_DATA_DIR
    ? path.resolve(process.env.LFG_DATA_DIR)
    : path.join(__dirname, 'data')
  return path.join(dir, 'lfg.sqlite')
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function migrateJsonInto(store, jsonPath) {
  try {
    if (!fs.existsSync(jsonPath)) return 0
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    const arr = Array.isArray(raw?.listings) ? raw.listings : []
    let n = 0
    for (const row of arr) {
      if (row?.id) {
        store.upsert(row)
        n++
      }
    }
    if (n > 0) {
      const bak = `${jsonPath}.migrated`
      try {
        fs.renameSync(jsonPath, bak)
      } catch {
        // keep original if rename fails
      }
      console.info(`[LFG] Migrated ${n} listing(s) from ${jsonPath}`)
    }
    return n
  } catch (err) {
    console.warn('[LFG] JSON migrate skipped:', err instanceof Error ? err.message : err)
    return 0
  }
}

function applyFilters(rows, filters = {}) {
  let out = rows
  const region = (filters.region || '').toLowerCase()
  const platform = (filters.platform || '').toLowerCase()
  const activity = (filters.activity || '').toLowerCase()
  const q = (filters.q || '').toLowerCase()
  if (region && region !== 'all') out = out.filter((r) => r.region === region)
  if (platform && platform !== 'all') {
    out = out.filter((r) => r.platform === platform || platform === 'crossplay')
  }
  if (activity && activity !== 'all') out = out.filter((r) => r.activity === activity)
  if (q) {
    out = out.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.relicKey || '').toLowerCase().includes(q) ||
        r.hostIgn.toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q),
    )
  }
  return out
}

function createJsonStore(filePath) {
  ensureParentDir(filePath)
  /** @type {Map<string, any>} */
  const listings = new Map()

  function load() {
    try {
      if (!fs.existsSync(filePath)) return
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      const arr = Array.isArray(raw?.listings) ? raw.listings : []
      for (const row of arr) {
        if (row?.id) listings.set(row.id, row)
      }
    } catch {
      // ignore corrupt
    }
  }

  function save() {
    ensureParentDir(filePath)
    const tmp = `${filePath}.${process.pid}.tmp`
    const payload = JSON.stringify({ listings: [...listings.values()] }, null, 0)
    fs.writeFileSync(tmp, payload, 'utf8')
    fs.renameSync(tmp, filePath)
  }

  load()

  /** @type {LfgStore} */
  return {
    kind: 'json',
    path: filePath,
    count() {
      return listings.size
    },
    purgeExpired() {
      const now = Date.now()
      let n = 0
      for (const [id, row] of listings) {
        if (Date.parse(row.expiresAt) <= now) {
          listings.delete(id)
          n++
        }
      }
      if (n) save()
      return n
    },
    list(filters = {}) {
      const rows = applyFilters([...listings.values()], filters)
      rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      return rows
    },
    get(id) {
      return listings.get(id) || null
    },
    upsert(row) {
      listings.set(row.id, row)
      save()
    },
    remove(id) {
      if (listings.delete(id)) save()
    },
  }
}

function rowFromSqlite(listing, members) {
  return {
    id: listing.id,
    createdAt: listing.created_at,
    expiresAt: listing.expires_at,
    hostIgn: listing.host_ign,
    hostToken: listing.host_token,
    platform: listing.platform,
    region: listing.region,
    language: listing.language,
    activity: listing.activity,
    title: listing.title,
    notes: listing.notes || '',
    relicKey: listing.relic_key,
    refinement: listing.refinement,
    shareType: listing.share_type,
    steelPath: Boolean(listing.steel_path),
    missionHint: listing.mission_hint,
    slotsTotal: listing.slots_total,
    members: members.map((m) => ({
      ign: m.ign,
      clientId: m.client_id,
      joinedAt: m.joined_at,
      isHost: Boolean(m.is_host),
    })),
  }
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    host_ign TEXT NOT NULL,
    host_token TEXT NOT NULL,
    platform TEXT NOT NULL,
    region TEXT NOT NULL,
    language TEXT NOT NULL,
    activity TEXT NOT NULL,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    relic_key TEXT,
    refinement TEXT,
    share_type TEXT,
    steel_path INTEGER NOT NULL DEFAULT 0,
    mission_hint TEXT,
    slots_total INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    listing_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    ign TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    is_host INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (listing_id, client_id),
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_listings_expires ON listings(expires_at);
  CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at);
`

function migrateLegacyJson(store, dataPath) {
  migrateJsonInto(store, path.join(path.dirname(dataPath), 'lfg-data.json'))
  migrateJsonInto(store, dataPath.replace(/\.sqlite3?$/i, '.json'))
  migrateJsonInto(store, path.join(__dirname, 'lfg-data.json'))
}

/**
 * @param {string} dbPath
 * @param {typeof import('node:sqlite').DatabaseSync} DatabaseSync
 * @returns {LfgStore}
 */
function openNodeSqlite(dbPath, DatabaseSync) {
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA_SQL)

  const run = (sql, params = {}) => db.prepare(sql).run(params)
  const all = (sql, params = {}) => db.prepare(sql).all(params)
  const getOne = (sql, params = {}) => db.prepare(sql).get(params)

  function hydrate(listingRow) {
    if (!listingRow) return null
    const members = all(
      `SELECT client_id, ign, joined_at, is_host FROM members WHERE listing_id = $id ORDER BY joined_at ASC`,
      { id: listingRow.id },
    )
    return rowFromSqlite(listingRow, members)
  }

  /** @type {LfgStore} */
  const store = {
    kind: 'sqlite',
    path: dbPath,
    count() {
      return getOne(`SELECT COUNT(*) AS n FROM listings`).n
    },
    purgeExpired() {
      const before = store.count()
      run(`DELETE FROM listings WHERE expires_at <= $now`, {
        now: new Date().toISOString(),
      })
      return Math.max(0, before - store.count())
    },
    list(filters = {}) {
      return applyFilters(
        all(`SELECT * FROM listings ORDER BY created_at DESC`).map((r) => hydrate(r)),
        filters,
      )
    },
    get(id) {
      return hydrate(getOne(`SELECT * FROM listings WHERE id = $id`, { id }))
    },
    upsert(row) {
      db.exec('BEGIN')
      try {
        run(`DELETE FROM listings WHERE id = $id`, { id: row.id })
        run(
          `INSERT INTO listings (
            id, created_at, expires_at, host_ign, host_token, platform, region, language,
            activity, title, notes, relic_key, refinement, share_type, steel_path, mission_hint, slots_total
          ) VALUES (
            $id, $created_at, $expires_at, $host_ign, $host_token, $platform, $region, $language,
            $activity, $title, $notes, $relic_key, $refinement, $share_type, $steel_path, $mission_hint, $slots_total
          )`,
          {
            id: row.id,
            created_at: row.createdAt,
            expires_at: row.expiresAt,
            host_ign: row.hostIgn,
            host_token: row.hostToken,
            platform: row.platform,
            region: row.region,
            language: row.language,
            activity: row.activity,
            title: row.title,
            notes: row.notes || '',
            relic_key: row.relicKey,
            refinement: row.refinement,
            share_type: row.shareType,
            steel_path: row.steelPath ? 1 : 0,
            mission_hint: row.missionHint,
            slots_total: row.slotsTotal,
          },
        )
        for (const m of row.members || []) {
          run(
            `INSERT INTO members (listing_id, client_id, ign, joined_at, is_host)
             VALUES ($listing_id, $client_id, $ign, $joined_at, $is_host)`,
            {
              listing_id: row.id,
              client_id: m.clientId,
              ign: m.ign,
              joined_at: m.joinedAt,
              is_host: m.isHost ? 1 : 0,
            },
          )
        }
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
    remove(id) {
      run(`DELETE FROM listings WHERE id = $id`, { id })
    },
    close() {
      db.close()
    },
  }
  return store
}

/**
 * @param {string} [dataPath]
 * @returns {Promise<LfgStore>}
 */
export async function openStore(dataPath = resolveDataPath()) {
  ensureParentDir(dataPath)
  const wantJson = /\.json$/i.test(dataPath)

  if (!wantJson) {
    try {
      const mod = await import('node:sqlite')
      const DatabaseSync = mod.DatabaseSync
      if (!DatabaseSync) throw new Error('DatabaseSync missing')
      const store = openNodeSqlite(dataPath, DatabaseSync)
      migrateLegacyJson(store, dataPath)
      return store
    } catch (err) {
      console.warn('[LFG] node:sqlite unavailable:', err instanceof Error ? err.message : err)
    }
  }

  const jsonPath = wantJson ? dataPath : `${dataPath.replace(/\.sqlite3?$/i, '')}.json`
  const store = createJsonStore(jsonPath)
  migrateJsonInto(store, path.join(__dirname, 'lfg-data.json'))
  return store
}
