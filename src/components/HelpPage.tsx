import { AppSettings } from '../../shared/types'
import { BugReportPanel } from './BugReportPanel'
import { Panel } from './Panel'
import { UninstallPanel } from './UninstallPanel'
import { prettyHotkey } from '../lib/hotkey'
import './onboarding.css'

type Props = {
  settings: AppSettings
  onStartTour: () => void
  onShowHotkeys: () => void
  onResetChecklist: () => void
}

export function HelpPage({ settings, onStartTour, onShowHotkeys, onResetChecklist }: Props) {
  const hk = settings.hotkeys
  return (
    <>
      <header className="page-header">
        <h2 className="page-title">Help</h2>
        <div className="page-title-rule" />
        <p className="page-desc">
          Quick guide to Everything Warframe — setup, overlays, and the keys you’ll use most.
        </p>
      </header>

      <div className="toolbar">
        <button className="btn primary" onClick={onStartTour}>
          Replay quick tour
        </button>
        <button className="btn" onClick={onShowHotkeys}>
          Hotkey cheat sheet
        </button>
        <button className="btn ghost" onClick={onResetChecklist}>
          Show getting started again
        </button>
      </div>

      <Panel title="How to use">
        <div className="help-block">
          <h3>1. Borderless Windowed</h3>
          <p>
            Set Warframe to Borderless Windowed. Exclusive fullscreen hides the overlay behind the
            game.
          </p>
        </div>
        <div className="help-block">
          <h3>2. Pick modules</h3>
          <p>
            Under Modules, enable Cycles, Fissures, Baro, Relics, and anything else you want on
            screen.
          </p>
        </div>
        <div className="help-block">
          <h3>3. Place panels</h3>
          <p>
            Use the Layout tab to drag panels on a mock monitor, or unlock in-game with{' '}
            <strong>{prettyHotkey(hk.editLayout)}</strong>, drag, then press it again to lock.
          </p>
        </div>
        <div className="help-block">
          <h3>4. Relic rewards</h3>
          <p>
            With the Relics module on, a horizontal strip pops up under the four reward cards when
            a fissure pick screen is detected (EE.log), or when you press{' '}
            <strong>{prettyHotkey(hk.scanRelics)}</strong>. Place that strip in the Layout tab. It
            auto-hides after you leave the pick screen or after ~45s. Sync inventory for “needed
            for set” tags.
          </p>
        </div>
        <div className="help-block">
          <h3>5. Riven grader</h3>
          <p>
            On the Kuva Cycle compare screen (current vs new), press{' '}
            <strong>{prettyHotkey(hk.scanRivens)}</strong>. A slim grader panel appears beside the
            in-game cards with tiers and a keep/take tip. EE.log may auto-detect; the hotkey is the
            reliable path. Dismiss with <strong>{prettyHotkey(hk.dismissRivens)}</strong>. Reset
            Layout if your panel still sits over the cards from an older default.
          </p>
        </div>
        <div className="help-block">
          <h3>6. Foundry planner</h3>
          <p>
            Open the <strong>Foundry</strong> tab in the companion (not an overlay). Sync inventory,
            then browse <strong>My inventory</strong> (owned gear + ready-to-build) by default. Use
            Browse all only for the full catalog. Expand a recipe for crafting trees and missing
            materials.
          </p>
        </div>
      </Panel>

      <div className="section-gap" />

      <BugReportPanel />

      <div className="section-gap" />

      <UninstallPanel />

      <div className="section-gap" />

      <Panel title="Common questions">
        <div className="help-block">
          <h3>Where did the companion go?</h3>
          <p>
            Closing the window leaves the app in the system tray. Press{' '}
            <strong>{prettyHotkey(hk.openCompanion)}</strong> or click the tray icon.
          </p>
        </div>
        <div className="help-block">
          <h3>I see an FPS / Frame Time widget</h3>
          <p>
            That’s usually Xbox Game Bar, NVIDIA overlay, or RTSS — not Everything Warframe. Turn it
            off in that app’s settings.
          </p>
        </div>
        <div className="help-block">
          <h3>How do I uninstall?</h3>
          <p>
            Use the Uninstall section above, or Windows Settings → Apps → Everything Warframe. The
            Setup installer also adds a Start Menu uninstall entry. Portable builds: delete the
            .exe; Linux AppImage: delete the file; .deb: remove via your package manager.
          </p>
        </div>
        <div className="help-block">
          <h3>Downloads &amp; updates</h3>
          <ul>
            <li>
              Website:{' '}
              <a
                href="https://hoeslovevid.github.io/Warframe-Companion-Helper/"
                target="_blank"
                rel="noreferrer"
              >
                hoeslovevid.github.io/Warframe-Companion-Helper
              </a>
            </li>
            <li>In-app updates: Settings → Updates</li>
          </ul>
        </div>
      </Panel>
    </>
  )
}
