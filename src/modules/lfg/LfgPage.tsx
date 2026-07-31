import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppSettings, LfgListing } from '../../../shared/types'
import { EmptyState } from '../../components/EmptyState'
import { Panel } from '../../components/Panel'
import { useWorldstate } from '../../hooks/useVoidLens'
import { copyText } from '../../lib/tradeClipboard'
import '../market/market.css'
import './lfg.css'

type Props = {
  settings: AppSettings
  onUpdate: (partial: Partial<AppSettings>) => void
}

function etaLabel(expiresAt: string) {
  const ms = Date.parse(expiresAt) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return 'expired'
  const m = Math.ceil(ms / 60_000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export function LfgPage({ settings, onUpdate }: Props) {
  const { data } = useWorldstate()
  const [listings, setListings] = useState<LfgListing[]>([])
  const [baseUrl, setBaseUrl] = useState('')
  const [hubOk, setHubOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [filterActivity, setFilterActivity] = useState('all')
  const [filterRegion, setFilterRegion] = useState('all')
  const [q, setQ] = useState('')

  const [activity, setActivity] = useState<'relic' | 'fissure' | 'farm' | 'boss' | 'custom'>('relic')
  const [title, setTitle] = useState('Radshare')
  const [relicKey, setRelicKey] = useState('')
  const [shareType, setShareType] = useState<'radshare' | 'intactshare' | 'any'>('radshare')
  const [refinement, setRefinement] = useState('radiant')
  const [steelPath, setSteelPath] = useState(false)
  const [missionHint, setMissionHint] = useState('')
  const [notes, setNotes] = useState('')
  const [slotsTotal, setSlotsTotal] = useState(4)
  const [ttlMin, setTtlMin] = useState(15)

  const clientId = settings.lfgClientId?.trim() || ''
  const hostTokens = settings.lfgHostTokens || {}

  useEffect(() => {
    if (settings.lfgClientId?.trim()) return
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ew-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    onUpdate({ lfgClientId: id })
  }, [settings.lfgClientId, onUpdate])

  const openFissures = useMemo(() => {
    return (data.fissures || [])
      .filter((f) => !steelPath || f.isHard)
      .slice(0, 8)
  }, [data.fissures, steelPath])

  const refresh = useCallback(async (): Promise<boolean> => {
    if (!window.voidlens?.listLfg) return false
    setLoading(true)
    try {
      const res = await window.voidlens.listLfg({
        region: filterRegion,
        activity: filterActivity,
        q: q.trim() || undefined,
        platform: settings.lfgPlatform,
      })
      setListings(res.listings)
      setBaseUrl(res.baseUrl)
      setHubOk(!res.error)
      if (res.error) {
        setError(res.error)
        return /rate|429/i.test(res.error)
      }
      // Soft warning (e.g. Railway edge → local fallback) — not a hard failure.
      setError(res.warning || null)
      return Boolean(res.warning && /rate|429|Railway edge/i.test(res.warning))
    } catch (err) {
      setHubOk(false)
      const msg = err instanceof Error ? err.message : 'LFG failed'
      setError(msg)
      return /rate|429/i.test(msg)
    } finally {
      setLoading(false)
    }
  }, [filterActivity, filterRegion, q, settings.lfgPlatform])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    let delay = 20_000

    const tick = async () => {
      if (cancelled) return
      const rateLimited = await refresh()
      delay = rateLimited ? Math.min(90_000, Math.round(delay * 1.6)) : 20_000
      if (!cancelled) timer = window.setTimeout(() => void tick(), delay)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [refresh])

  const saveProfile = (partial: Partial<AppSettings>) => onUpdate(partial)

  const create = async () => {
    const ign = settings.lfgIgn.trim()
    if (!ign) {
      setError('Set your in-game name in the profile panel')
      return
    }
    const cid =
      clientId ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ew-${Date.now()}`)
    if (!clientId) onUpdate({ lfgClientId: cid })
    if (!window.voidlens?.createLfg) return
    setBusyId('create')
    setError(null)
    try {
      const res = await window.voidlens.createLfg({
        hostIgn: ign,
        clientId: cid,
        platform: settings.lfgPlatform,
        region: settings.lfgRegion,
        language: settings.lfgLanguage || 'en',
        activity,
        title: title.trim() || 'LFG',
        notes: notes.trim(),
        relicKey: relicKey.trim() || null,
        refinement: activity === 'relic' ? refinement : null,
        shareType: activity === 'relic' ? shareType : null,
        steelPath,
        missionHint: missionHint.trim() || null,
        slotsTotal,
        ttlMs: ttlMin * 60_000,
      })
      if (!res.ok || !res.listing) {
        setError(res.error || 'Create failed')
        return
      }
      if (res.hostToken) {
        onUpdate({
          lfgHostTokens: { ...hostTokens, [res.listing.id]: res.hostToken },
        })
      }
      await refresh()
      if (res.listing.whisper) {
        await copyText(res.listing.whisper)
        setCopied(res.listing.id)
        window.setTimeout(() => setCopied(null), 1600)
      }
    } finally {
      setBusyId(null)
    }
  }

  const join = async (listing: LfgListing) => {
    const ign = settings.lfgIgn.trim()
    if (!ign) {
      setError('Set your in-game name first')
      return
    }
    setBusyId(listing.id)
    try {
      const res = await window.voidlens.joinLfg({ id: listing.id, ign, clientId })
      if (!res.ok || !res.listing) {
        setError(res.error || 'Join failed')
        return
      }
      await copyText(res.listing.whisper)
      setCopied(listing.id)
      window.setTimeout(() => setCopied(null), 1600)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  const closeListing = async (listing: LfgListing) => {
    const token = hostTokens[listing.id]
    if (!token || !window.voidlens?.deleteLfg) return
    setBusyId(listing.id)
    try {
      await window.voidlens.deleteLfg({ id: listing.id, hostToken: token })
      const next = { ...hostTokens }
      delete next[listing.id]
      onUpdate({ lfgHostTokens: next })
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  const leave = async (listing: LfgListing) => {
    setBusyId(listing.id)
    try {
      await window.voidlens.leaveLfg({ id: listing.id, clientId })
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  const applyFissure = (node: string, missionType: string, hard: boolean) => {
    setSteelPath(hard)
    setMissionHint(`${missionType} · ${node}`)
    setActivity('fissure')
    setTitle(hard ? 'SP Fissure' : 'Fissure')
  }

  return (
    <>
      <header className="page-header">
        <h2 className="page-title">LFG</h2>
        <div className="page-title-rule" />
        <p className="page-desc">
          Hosted squad board — post intent, join open queues, copy whisper / invite.
          {baseUrl ? (
            <>
              {' '}
              Hub: <span className={hubOk ? 'is-ok' : 'is-missing'}>{baseUrl}</span>
            </>
          ) : null}
        </p>
      </header>

      <div className="lfg-layout">
        <aside className="lfg-side">
          <Panel title="Your profile" subtitle="Shown on listings you host or join">
            <label className="field">
              <span>In-game name</span>
              <input
                value={settings.lfgIgn}
                placeholder="Warframe IGN"
                onChange={(e) => saveProfile({ lfgIgn: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Platform</span>
              <select
                value={settings.lfgPlatform}
                onChange={(e) =>
                  saveProfile({
                    lfgPlatform: e.target.value as AppSettings['lfgPlatform'],
                  })
                }
              >
                <option value="pc">PC</option>
                <option value="psn">PlayStation</option>
                <option value="xbox">Xbox</option>
                <option value="switch">Switch</option>
                <option value="mobile">Mobile</option>
              </select>
            </label>
            <label className="field">
              <span>Region</span>
              <select
                value={settings.lfgRegion}
                onChange={(e) =>
                  saveProfile({ lfgRegion: e.target.value as AppSettings['lfgRegion'] })
                }
              >
                <option value="na">NA</option>
                <option value="eu">EU</option>
                <option value="asia">Asia</option>
                <option value="sa">SA</option>
                <option value="oce">OCE</option>
              </select>
            </label>
            <label className="field">
              <span>Hub URL</span>
              <input
                value={settings.lfgApiBaseUrl}
                placeholder="Official community board (default)"
                onChange={(e) => saveProfile({ lfgApiBaseUrl: e.target.value })}
              />
            </label>
            <p className="muted" style={{ fontSize: '0.75rem', margin: 0 }}>
              Defaults to the public Everything Warframe board. Set to <code>local</code> for a
              private hub on this PC, or paste another hosted URL. If Railway edge-blocks the
              public domain (429), the app falls back to local — generate a new Railway domain to
              restore community matchmaking.
            </p>
          </Panel>

          <Panel title="Post a squad" subtitle="Creates a listing on the hub">
            <div className="vl-segment vl-segment--wrap" role="group" aria-label="Activity">
              {(
                [
                  ['relic', 'Relic'],
                  ['fissure', 'Fissure'],
                  ['farm', 'Farm'],
                  ['boss', 'Boss'],
                  ['custom', 'Custom'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`vl-segment__btn ${activity === id ? 'is-on' : ''}`}
                  onClick={() => setActivity(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            {activity === 'relic' ? (
              <>
                <label className="field">
                  <span>Relic</span>
                  <input
                    value={relicKey}
                    placeholder="e.g. Axi A1"
                    onChange={(e) => setRelicKey(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Share</span>
                  <select
                    value={shareType}
                    onChange={(e) => setShareType(e.target.value as typeof shareType)}
                  >
                    <option value="radshare">Radshare</option>
                    <option value="intactshare">Intactshare</option>
                    <option value="any">Any</option>
                  </select>
                </label>
                <label className="field">
                  <span>Refinement</span>
                  <select value={refinement} onChange={(e) => setRefinement(e.target.value)}>
                    <option value="radiant">Radiant</option>
                    <option value="flawless">Flawless</option>
                    <option value="exceptional">Exceptional</option>
                    <option value="intact">Intact</option>
                  </select>
                </label>
              </>
            ) : null}
            <label className="field" style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={steelPath}
                onChange={(e) => setSteelPath(e.target.checked)}
              />
              <span>Steel Path</span>
            </label>
            <label className="field">
              <span>Mission / node hint</span>
              <input
                value={missionHint}
                placeholder="Optional"
                onChange={(e) => setMissionHint(e.target.value)}
              />
            </label>
            {openFissures.length ? (
              <div className="lfg-fissure-chips">
                {openFissures.slice(0, 5).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="btn ghost"
                    style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                    onClick={() => applyFissure(f.node, f.missionType, f.isHard)}
                  >
                    {f.tier} {f.node}
                    {f.isHard ? ' SP' : ''}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="field">
              <span>Notes</span>
              <input value={notes} maxLength={160} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="market-create-row">
              <label className="field" style={{ margin: 0, flex: 1 }}>
                <span>Slots</span>
                <input
                  type="number"
                  min={2}
                  max={4}
                  value={slotsTotal}
                  onChange={(e) => setSlotsTotal(Math.min(4, Math.max(2, Number(e.target.value) || 4)))}
                />
              </label>
              <label className="field" style={{ margin: 0, flex: 1 }}>
                <span>Expires (min)</span>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={ttlMin}
                  onChange={(e) => setTtlMin(Math.min(120, Math.max(5, Number(e.target.value) || 15)))}
                />
              </label>
            </div>
            <button
              className="btn primary"
              type="button"
              disabled={busyId === 'create'}
              onClick={() => void create()}
              style={{ width: '100%', marginTop: 8 }}
            >
              {busyId === 'create' ? 'Posting…' : 'Post squad'}
            </button>
          </Panel>
        </aside>

        <section className="lfg-main">
          <Panel
            title="Open queues"
            subtitle="Join copies a /w whisper to the host"
            actions={
              <button className="btn ghost" type="button" disabled={loading} onClick={() => void refresh()}>
                {loading ? '…' : 'Refresh'}
              </button>
            }
          >
            <div className="market-add" style={{ marginBottom: 10 }}>
              <input
                value={q}
                placeholder="Search title / relic / host…"
                onChange={(e) => setQ(e.target.value)}
              />
              <select value={filterActivity} onChange={(e) => setFilterActivity(e.target.value)}>
                <option value="all">All activities</option>
                <option value="relic">Relic</option>
                <option value="fissure">Fissure</option>
                <option value="farm">Farm</option>
                <option value="boss">Boss</option>
                <option value="custom">Custom</option>
              </select>
              <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
                <option value="all">All regions</option>
                <option value="na">NA</option>
                <option value="eu">EU</option>
                <option value="asia">Asia</option>
                <option value="sa">SA</option>
                <option value="oce">OCE</option>
              </select>
            </div>
            {error ? <p className="market-error">{error}</p> : null}
            {listings.length === 0 ? (
              <EmptyState
                title="No open queues"
                body="Post a squad on the community board — set Hub URL to local for a private PC-only hub."
              />
            ) : (
              <ul className="market-card-list">
                {listings.map((l) => {
                  const isHost = Boolean(hostTokens[l.id])
                  const inSquad = l.members.some((m) => m.clientId === clientId)
                  return (
                    <li key={l.id} className="market-card">
                      <div className="market-card__body">
                        <div className="market-card__title">
                          <span className={`market-chip market-chip--${l.activity === 'custom'}`}>
                            {l.activity}
                          </span>
                          <strong>{l.title}</strong>
                          {l.steelPath ? <span className="market-chip market-chip--warn">SP</span> : null}
                        </div>
                        <div className="market-card__meta muted">
                          <span>{l.hostIgn}</span>
                          <span>
                            {l.members.length}/{l.slotsTotal}
                          </span>
                          <span>{l.platform.toUpperCase()}</span>
                          <span>{l.region.toUpperCase()}</span>
                          <span>{etaLabel(l.expiresAt)}</span>
                          {l.relicKey ? <span>{l.relicKey}</span> : null}
                          {l.shareType ? <span>{l.shareType}</span> : null}
                          {l.missionHint ? <span>{l.missionHint}</span> : null}
                        </div>
                        {l.notes ? <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>{l.notes}</p> : null}
                        <p className="muted" style={{ margin: '6px 0 0', fontSize: '0.75rem' }}>
                          {l.members.map((m) => m.ign).join(' · ')}
                        </p>
                      </div>
                      <div className="market-actions">
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() =>
                            void copyText(l.whisper).then((ok) => {
                              if (!ok) return
                              setCopied(l.id)
                              window.setTimeout(() => setCopied(null), 1400)
                            })
                          }
                        >
                          {copied === l.id ? 'Copied' : 'Whisper'}
                        </button>
                        {!inSquad && l.slotsOpen > 0 ? (
                          <button
                            className="btn primary"
                            type="button"
                            disabled={busyId === l.id}
                            onClick={() => void join(l)}
                          >
                            {busyId === l.id ? '…' : 'Join'}
                          </button>
                        ) : null}
                        {inSquad && !isHost ? (
                          <button
                            className="btn ghost"
                            type="button"
                            disabled={busyId === l.id}
                            onClick={() => void leave(l)}
                          >
                            Leave
                          </button>
                        ) : null}
                        {isHost ? (
                          <button
                            className="btn ghost danger"
                            type="button"
                            disabled={busyId === l.id}
                            onClick={() => void closeListing(l)}
                          >
                            Close
                          </button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </section>
      </div>
    </>
  )
}
