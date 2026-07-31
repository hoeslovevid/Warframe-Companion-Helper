# Everything Warframe — LFG Hub

Shared squad matchmaking API for the companion **LFG** tab.

## Local / LAN

From the repo root:

```bash
npm run lfg:serve
```

Or from this folder:

```bash
npm start
```

Listens on `http://0.0.0.0:17864` (or `PORT`). Leave **Hub URL** empty in the app to auto-start a local hub, or set Hub URL to `http://YOUR_LAN_IP:17864` on friends’ PCs.

## Railway (friends / community board)

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → this repo.
2. Service **Settings**:
   - **Root Directory:** `lfg-api`
   - Start command is already set via `railway.toml` / `package.json` (`node server.mjs`).
3. **Networking** → **Generate Domain**.
4. Confirm: `https://YOUR-DOMAIN.up.railway.app/health` returns `{ "ok": true, ... }`.
5. In Everything Warframe → **LFG** → set **Hub URL** to that HTTPS URL (no trailing slash) on every PC.

Optional env vars:

| Variable | Default | Notes |
|----------|---------|--------|
| `PORT` | set by Railway | Do not override |
| `LFG_DATA` | `./lfg-data.json` | Path for listing store |
| `LFG_ORIGIN` | `*` | CORS allow origin |

Listings live on the service disk and may reset on redeploy unless you attach a volume and point `LFG_DATA` at it.

## Other hosts (Render / Fly / VPS)

```bash
node server.mjs
# or: PORT=8080 LFG_DATA=/data/lfg.json node server.mjs
```

Then set **Hub URL** in the app to `https://your-host.example`.

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | Hub status |
| GET | `/listings?region=&activity=&q=` | Open queues |
| POST | `/listings` | Create (returns `hostToken`) |
| POST | `/listings/:id/join` | Join squad |
| POST | `/listings/:id/leave` | Leave |
| DELETE | `/listings/:id` | Host close (`X-LFG-Token`) |

No Overwolf / in-game invite automation — clients copy `/w` whisper lines into Warframe.
