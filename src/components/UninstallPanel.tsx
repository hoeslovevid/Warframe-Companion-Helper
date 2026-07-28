import { useCallback, useEffect, useState } from 'react'
import type { UninstallInfo } from '../../shared/types'
import { Panel } from './Panel'

const KIND_LABEL: Record<UninstallInfo['kind'], string> = {
  nsis: 'Windows Setup install',
  portable: 'Windows portable',
  appimage: 'Linux AppImage',
  deb: 'Linux package (.deb)',
  dev: 'Development build',
  unknown: 'Unknown install',
}

export function UninstallPanel() {
  const [info, setInfo] = useState<UninstallInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!window.voidlens?.getUninstallInfo) return
    setInfo(await window.voidlens.getUninstallInfo())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await action()
      setMessage(result.ok ? okText : result.error || 'Something went wrong')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const onUninstall = () => {
    if (!window.voidlens?.launchUninstaller) return
    const ok = window.confirm(
      info?.canLaunchUninstaller
        ? 'Launch the Windows uninstaller? Everything Warframe will quit.'
        : 'Open Windows Apps settings so you can uninstall Everything Warframe?',
    )
    if (!ok) return
    void run(() => window.voidlens!.launchUninstaller(), 'Uninstaller started — follow the prompts.')
  }

  const onClearData = () => {
    if (!window.voidlens?.clearUserDataAndQuit) return
    const ok = window.confirm(
      'Delete all local settings, caches, and OCR data, then quit?\n\nThis does not remove the installed app. You can reinstall or relaunch afterward.',
    )
    if (!ok) return
    void run(
      () => window.voidlens!.clearUserDataAndQuit(),
      'Clearing data and quitting…',
    )
  }

  return (
    <Panel
      title="Uninstall"
      subtitle={info ? KIND_LABEL[info.kind] : 'Detecting install type…'}
    >
      {info ? <p className="muted" style={{ marginTop: 0 }}>{info.guidance}</p> : null}

      <div className="toolbar" style={{ marginBottom: 8 }}>
        {info?.canLaunchUninstaller || (typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent)) ? (
          <button className="btn primary" disabled={busy || info?.kind === 'dev'} onClick={onUninstall}>
            {info?.canLaunchUninstaller ? 'Uninstall app' : 'Open Apps settings'}
          </button>
        ) : null}
        <button
          className="btn ghost"
          disabled={busy || !window.voidlens?.openUserDataFolder}
          onClick={() =>
            void run(() => window.voidlens!.openUserDataFolder(), 'Opened data folder.')
          }
        >
          Open data folder
        </button>
        <button className="btn ghost" disabled={busy} onClick={onClearData}>
          Delete data &amp; quit
        </button>
      </div>

      {info?.userDataPath ? (
        <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
          Data folder: <code>{info.userDataPath}</code>
        </p>
      ) : null}
      {message ? (
        <p className="muted" style={{ margin: '8px 0 0' }}>
          {message}
        </p>
      ) : null}

      {info?.kind === 'appimage' || info?.kind === 'deb' ? (
        <div className="help-block" style={{ marginTop: 12 }}>
          <h3>Linux tip</h3>
          <p>
            {info.kind === 'deb'
              ? 'Package remove: sudo apt remove everything-warframe'
              : 'Delete the AppImage file after quitting.'}{' '}
            Use Delete data &amp; quit if you also want a clean settings wipe.
          </p>
        </div>
      ) : null}
    </Panel>
  )
}
