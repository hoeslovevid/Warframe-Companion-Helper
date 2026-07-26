import { useState } from 'react'
import { BugReportCategory, BugReportDraft } from '../../shared/types'
import { Panel } from './Panel'
import { ToggleRow } from './ToggleRow'

const CATEGORIES: { id: BugReportCategory; label: string }[] = [
  { id: 'relics', label: 'Relic OCR / rewards' },
  { id: 'rivens', label: 'Riven grader' },
  { id: 'overlay', label: 'Overlay / layout' },
  { id: 'inventory', label: 'Inventory / foundry' },
  { id: 'linux', label: 'Linux / Proton' },
  { id: 'other', label: 'Other' },
]

export function BugReportPanel() {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<BugReportCategory>('other')
  const [description, setDescription] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const draft = (): BugReportDraft => ({
    title,
    category,
    description,
    includeDiagnostics,
  })

  const openIssue = async () => {
    if (!window.voidlens?.openBugReport) {
      setStatus('Bug report is only available in the desktop app.')
      return
    }
    if (!description.trim()) {
      setStatus('Please describe what went wrong.')
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const result = await window.voidlens.openBugReport(draft())
      if (!result.ok) {
        setStatus(result.error || 'Could not open GitHub.')
        return
      }
      const bits = [
        'Opened a prefilled GitHub Issue in your browser.',
        'Sign in to GitHub if needed, then submit.',
        'Drag screenshots onto the issue page if you have them.',
      ]
      if (result.truncated) {
        bits.push('Diagnostics were shortened to fit the URL — use Copy diagnostics if needed.')
      }
      if (result.debugDirs.length) {
        bits.push('OCR debug folders exist — use Open debug folders to attach crops.')
      }
      setStatus(bits.join(' '))
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Report a bug"
      subtitle="Opens a prefilled GitHub Issue — no Discord webhook, you stay in control of what you send"
    >
      <div className="field">
        <label htmlFor="bug-title">Title</label>
        <input
          id="bug-title"
          type="text"
          placeholder="Short summary (e.g. Relic OCR reads junk on reward screen)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </div>
      <div className="field">
        <label htmlFor="bug-category">Area</label>
        <select
          id="bug-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as BugReportCategory)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="bug-description">What happened?</label>
        <textarea
          id="bug-description"
          rows={5}
          placeholder="Steps to reproduce, what you expected, and what you saw instead."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <ToggleRow
        label="Include diagnostics"
        description="App version, OS, monitor, modules, and recent OCR scan status (paths redacted)"
        checked={includeDiagnostics}
        onChange={setIncludeDiagnostics}
      />
      <div className="toolbar" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn primary" disabled={busy} onClick={() => void openIssue()}>
          {busy ? 'Opening…' : 'Open GitHub Issue'}
        </button>
        <button
          className="btn ghost"
          disabled={busy || !window.voidlens?.copyBugDiagnostics}
          onClick={() => {
            void window.voidlens?.copyBugDiagnostics(draft()).then((ok) => {
              setStatus(ok ? 'Diagnostics copied to clipboard.' : 'Copy failed.')
            })
          }}
        >
          Copy diagnostics
        </button>
        <button
          className="btn ghost"
          disabled={busy || !window.voidlens?.pickBugScreenshots}
          onClick={() => {
            void window.voidlens?.pickBugScreenshots().then((res) => {
              if (!res) {
                setStatus('No screenshots selected.')
                return
              }
              setStatus(
                `Copied ${res.count} file(s) to a staging folder and opened it — drag them onto the GitHub issue.`,
              )
            })
          }}
        >
          Attach screenshots…
        </button>
        <button
          className="btn ghost"
          disabled={busy || !window.voidlens?.openBugDebugFolders}
          onClick={() => {
            void window.voidlens?.openBugDebugFolders().then((dirs) => {
              setStatus(
                dirs.length
                  ? `Opened: ${dirs.map((d) => d.split(/[/\\]/).slice(-1)[0]).join(', ')}`
                  : 'No folders to open.',
              )
            })
          }}
        >
          Open debug folders
        </button>
      </div>
      {status ? (
        <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.82rem' }}>
          {status}
        </p>
      ) : (
        <p className="muted" style={{ margin: '10px 0 0', fontSize: '0.78rem' }}>
          Requires a free GitHub account. Issues go to{' '}
          <a
            href="https://github.com/hoeslovevid/everything-warframe/issues"
            target="_blank"
            rel="noreferrer"
          >
            hoeslovevid/everything-warframe
          </a>
          .
        </p>
      )}
    </Panel>
  )
}
