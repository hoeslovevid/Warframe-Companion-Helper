# Everything Warframe — LFG Hub

Shared squad matchmaking API for the companion **LFG** tab.

Listings are stored in **SQLite** via Node’s built-in `node:sqlite` (Node 22.5+).  
No native npm addons — Railway/Nixpacks installs stay simple.  
If SQLite can’t load (e.g. Electron’s older embedded Node), the hub falls back to an atomic JSON file with the same API.

## Local / LAN

From the repo root:

```bash
npm run lfg:serve
```

Or from this folder:

```bash
npm start
```

(`npm install` is optional — this package has **zero** runtime dependencies.)

Listens on `http://0.0.0.0:17864` (or `PORT`). Leave **Hub URL** empty in the app to auto-start a local hub, or set Hub URL to `http://YOUR_LAN_IP:17864` on friends’ PCs.

Default DB file: `lfg-api/data/lfg.sqlite`.

## Railway (friends / community board)

### 1. Deploy

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → this repo.
2. Service **Settings**:
   - **Root Directory:** `lfg-api`
   - Start command is already set via `railway.toml` / `package.json` (`node server.mjs`).
3. **Networking** → **Generate Domain**.
4. Confirm: `https://YOUR-DOMAIN.up.railway.app/health` returns `{ "ok": true, "store": "sqlite", ... }`.

### 2. Volume (keep boards across redeploys)

Without a volume, Railway’s disk is ephemeral and the DB is wiped on every deploy.

1. Service → **Volumes** → **Add Volume**.
2. **Mount path:** `/data`
3. Service → **Variables**:

| Variable | Value |
|----------|--------|
| `LFG_DATA` | `/data/lfg.sqlite` |

Redeploy once after attaching the volume. `/health` should show `"dataPath":"/data/lfg.sqlite"`.

### 3. Point the app at the hub

In Everything Warframe → **LFG** → set **Hub URL** to the HTTPS domain (no trailing slash) on every PC.

### Optional env

| Variable | Default | Notes |
|----------|---------|--------|
| `PORT` | set by Railway | Do not override |
| `LFG_DATA` | `./data/lfg.sqlite` | Full path to SQLite (or `.json` to force JSON) |
| `LFG_DATA_DIR` | `./data` | Used when `LFG_DATA` is unset |
| `LFG_ORIGIN` | `*` | CORS allow origin |

## Schema (SQLite)

- `listings` — one row per open squad (TTL via `expires_at`)
- `members` — squad roster (`listing_id` + `client_id`)

Old `lfg-data.json` files are imported automatically on first SQLite open, then renamed to `*.migrated`.

Swapping to Postgres later only requires a new store backend behind `openStore()` in `store.mjs`; the HTTP API stays the same.

## Other hosts (Render / Fly / VPS)

```bash
LFG_DATA=/var/lib/ew-lfg/lfg.sqlite node boot.mjs
```

Mount durable storage at that path, then set **Hub URL** in the app to `https://your-host.example`.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | Hub status (`store`, `dataPath`, `listings`) |
| GET | `/listings?region=&activity=&q=` | Open queues |
| POST | `/listings` | Create (returns `hostToken`) |
| POST | `/listings/:id/join` | Join squad |
| POST | `/listings/:id/leave` | Leave |
| DELETE | `/listings/:id` | Host close (`X-LFG-Token`) |

No Overwolf / in-game invite automation — clients copy `/w` whisper lines into Warframe.
