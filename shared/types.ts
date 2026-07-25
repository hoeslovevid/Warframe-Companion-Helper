export type ModuleId =
  | 'cycles'
  | 'fissures'
  | 'baro'
  | 'nightwave'
  | 'relics'
  | 'arbitration'

export type PanelAnchor = {
  x: number
  y: number
}

export type HotkeyConfig = {
  toggleOverlay: string
  openCompanion: string
  refreshWorldstate: string
  scanRelics: string
  editLayout: string
}

export type InventorySource = 'none' | 'manual' | 'detected' | 'helper' | 'alecaframe'

export type AppSettings = {
  modules: Record<ModuleId, boolean>
  panelAnchors: Partial<Record<ModuleId, PanelAnchor>>
  opacity: number
  hotkeys: HotkeyConfig
  eeLogPath: string
  inventoryPath: string
  inventorySource: InventorySource
  inventoryConsent: boolean
  inventoryLastSynced: string
  fissureTiers: string[]
  overlayVisible: boolean
  layoutEditMode: boolean
}

export const MODULE_META: Record<
  ModuleId,
  { label: string; description: string; phase: 1 | 2 | 3 }
> = {
  cycles: {
    label: 'World Cycles',
    description: 'Cetus, Vallis, Cambion, Duviri, Zariman, and Albrecht cycles',
    phase: 1,
  },
  fissures: {
    label: 'Fissures',
    description: 'Active Void Fissures filtered by relic tier',
    phase: 1,
  },
  baro: {
    label: "Baro Ki'Teer",
    description: 'Arrival status and next visit countdown',
    phase: 1,
  },
  nightwave: {
    label: 'Nightwave',
    description: 'Current Nightwave season info',
    phase: 1,
  },
  relics: {
    label: 'Relic Rewards',
    description: 'OCR reward overlay with prices and missing set parts (Phase 2)',
    phase: 2,
  },
  arbitration: {
    label: 'Arbitration',
    description: 'Schedule and end-of-run rare drop summary (Phase 3)',
    phase: 3,
  },
}

export const DEFAULT_SETTINGS: AppSettings = {
  modules: {
    cycles: true,
    fissures: true,
    baro: true,
    nightwave: false,
    relics: true,
    arbitration: false,
  },
  panelAnchors: {
    cycles: { x: 24, y: 24 },
    fissures: { x: 24, y: 280 },
    baro: { x: 24, y: 560 },
    nightwave: { x: 320, y: 24 },
    relics: { x: 420, y: 180 },
    arbitration: { x: 420, y: 420 },
  },
  opacity: 0.92,
  hotkeys: {
    // Alt+Shift avoids common browser/IDE grabs (Ctrl+Shift+C/O/R)
    toggleOverlay: 'Alt+Shift+V',
    openCompanion: 'Alt+Shift+C',
    refreshWorldstate: 'Alt+Shift+R',
    scanRelics: 'Alt+Shift+F',
    editLayout: 'Alt+Shift+E',
  },
  eeLogPath: '',
  inventoryPath: '',
  inventorySource: 'none',
  inventoryConsent: false,
  inventoryLastSynced: '',
  fissureTiers: ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem'],
  overlayVisible: true,
  layoutEditMode: false,
}

export type CycleInfo = {
  id: string
  name: string
  state: string
  timeLeft: string
  expiry: string
}

export type FissureInfo = {
  id: string
  node: string
  missionType: string
  enemy: string
  tier: string
  eta: string
  isHard: boolean
  expiry: string
}

export type BaroInventoryItem = {
  uniqueName: string
  item: string
  ducats: number
  credits: number
}

export type BaroInfo = {
  active: boolean
  location: string
  arrival: string
  departure: string
  eta: string
  inventory: BaroInventoryItem[]
}

export type NightwaveInfo = {
  active: boolean
  season: number
  tag: string
  expiry: string
  phase: number
}

export type ArbitrationInfo = {
  node: string
  type: string
  enemy: string
  expiry: string
  eta: string
}

export type WorldstateSnapshot = {
  fetchedAt: string
  cycles: CycleInfo[]
  fissures: FissureInfo[]
  baro: BaroInfo | null
  nightwave: NightwaveInfo | null
  arbitration: ArbitrationInfo | null
}

export type InventoryIndex = Record<string, number>

export type InventoryCandidate = {
  path: string
  label: string
  source: InventorySource
  mtime: string
}

export type InventoryStatus = {
  path: string
  source: InventorySource
  consent: boolean
  lastSynced: string
  itemCount: number
  uniqueCount: number
  loaded: boolean
  helperReady: boolean
  warframeRunning: boolean
  error: string | null
  candidates: InventoryCandidate[]
}

export type InventorySyncResult = {
  ok: boolean
  path?: string
  source?: InventorySource
  itemCount?: number
  uniqueCount?: number
  error?: string
}

export type SetPartOwned = {
  partName: string
  itemName: string
  owned: number
}

export type RewardEval = {
  slot: number
  ocrText: string
  name: string
  uniqueName: string | null
  setName: string | null
  partName: string | null
  owned: number
  needed: boolean
  setOwnedParts: number
  setTotalParts: number
  setParts: SetPartOwned[]
  matchScore: number
  ducats: number | null
}

export type RelicScanState = {
  active: boolean
  scanning: boolean
  scannedAt: string
  trigger: 'manual' | 'log' | 'none'
  error: string | null
  rewards: RewardEval[]
  inventoryLoaded: boolean
}

export type AppUpdateStatus = {
  supported: boolean
  checking: boolean
  available: boolean
  downloading: boolean
  downloaded: boolean
  currentVersion: string
  latestVersion: string | null
  progress: number
  error: string | null
  message: string
}

export type VoidLensApi = {
  getSettings: () => Promise<AppSettings>
  updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  setModuleEnabled: (id: ModuleId, enabled: boolean) => Promise<AppSettings>
  getWorldstate: () => Promise<WorldstateSnapshot>
  refreshWorldstate: () => Promise<WorldstateSnapshot>
  toggleOverlay: () => Promise<boolean>
  setLayoutEditMode: (enabled: boolean) => Promise<AppSettings>
  pickEeLogPath: () => Promise<string | null>
  pickInventoryPath: () => Promise<string | null>
  detectEeLogPath: () => Promise<string | null>
  getInventoryStatus: () => Promise<InventoryStatus>
  setInventoryConsent: (consent: boolean) => Promise<InventoryStatus>
  detectInventorySources: () => Promise<InventoryStatus>
  useInventoryCandidate: (path: string) => Promise<InventorySyncResult>
  syncInventoryFromGame: () => Promise<InventorySyncResult>
  clearInventory: () => Promise<InventoryStatus>
  getInventoryIndex: () => Promise<InventoryIndex>
  getRelicScan: () => Promise<RelicScanState>
  scanRelicRewards: () => Promise<RelicScanState>
  clearRelicScan: () => Promise<RelicScanState>
  getUpdateStatus: () => Promise<AppUpdateStatus>
  checkForUpdates: () => Promise<AppUpdateStatus>
  installUpdate: () => Promise<boolean>
  onSettingsChanged: (cb: (settings: AppSettings) => void) => () => void
  onWorldstateUpdated: (cb: (data: WorldstateSnapshot) => void) => () => void
  onOverlayVisibilityChanged: (cb: (visible: boolean) => void) => () => void
  onInventoryUpdated: (cb: (status: InventoryStatus) => void) => () => void
  onRelicScanUpdated: (cb: (state: RelicScanState) => void) => () => void
  onUpdateStatus: (cb: (status: AppUpdateStatus) => void) => () => void
}
