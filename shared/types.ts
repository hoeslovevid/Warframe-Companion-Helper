export type ModuleId =
  | 'cycles'
  | 'fissures'
  | 'baro'
  | 'nightwave'
  | 'relics'
  | 'arbitration'
  | 'invasions'
  | 'archon'
  | 'deepArchimedea'
  | 'rivens'
  | 'foundry'
  | 'market'

/** Soft UI chime style for relic / riven scan alerts. */
export type SoundPackId = 'soft' | 'bright' | 'double' | 'low'

/** Warframe UI theme ids used by WFInfo-style relic OCR. */
export type WfThemeId =
  | 'Vitruvian'
  | 'Stalker'
  | 'Baruuk'
  | 'Corpus'
  | 'Fortuna'
  | 'Grineer'
  | 'Lotus'
  | 'Nidus'
  | 'Orokin'
  | 'Tenno'
  | 'HighContrast'
  | 'Legacy'
  | 'Equinox'
  | 'DarkLotus'
  | 'Zephyr'

export const WF_THEME_OPTIONS: WfThemeId[] = [
  'Vitruvian',
  'Stalker',
  'Baruuk',
  'Corpus',
  'Fortuna',
  'Grineer',
  'Lotus',
  'Nidus',
  'Orokin',
  'Tenno',
  'HighContrast',
  'Legacy',
  'Equinox',
  'DarkLotus',
  'Zephyr',
]

export type PanelAnchor = {
  x: number
  y: number
}

export type HotkeyConfig = {
  toggleOverlay: string
  openCompanion: string
  refreshWorldstate: string
  scanRelics: string
  dismissRelics: string
  scanRivens: string
  dismissRivens: string
  editLayout: string
}

export type RivenTier = 'S' | 'A' | 'B' | 'C' | 'D' | 'F'

export type RivenStatLine = {
  raw: string
  name: string
  value: number
  unit: '%' | 'flat'
  negative: boolean
  /** 0–100 quality for this line vs typical max (approx). */
  quality: number
  desirable: boolean
}

export type RivenRoll = {
  side: 'current' | 'reroll'
  weapon: string
  ocrText: string
  stats: RivenStatLine[]
  score: number
  tier: RivenTier
  /** True when Megrim/Valkyrial sheet prefs were used for this score. */
  prefsMatched?: boolean
  prefsNotes?: string
  /** Median warframe.market buyout for similar auctions (estimate). */
  platinum?: number | null
  marketVolume?: number | null
  /** How tightly the auction query matched OCR stats. */
  marketMatch?: 'exact' | 'stats' | 'loose' | null
  /** Madurai / Vazarin / Naramon / Zenurik when OCR sees polarity. */
  polarity?: string | null
  /** Deep-link into warframe.market riven auction search. */
  marketUrl?: string | null
}

export type RivenScanState = {
  active: boolean
  scanning: boolean
  scannedAt: string
  trigger: 'manual' | 'log' | 'none'
  error: string | null
  current: RivenRoll | null
  reroll: RivenRoll | null
  recommendation: 'keep' | 'take' | 'similar' | 'none'
  /** Extra tip when plat or prefs drove the recommendation. */
  recommendationNote?: string | null
}

export type InventorySource = 'none' | 'manual' | 'detected' | 'helper' | 'alecaframe'

export type FissureSort = 'eta' | 'tier'

/** Which Void Fissure difficulty track(s) to list. */
export type FissurePathMode = 'normal' | 'steel' | 'both'

/** App + overlay color themes (4 dark, 4 light) + user custom. */
export type ColorThemeId =
  | 'void'
  | 'ember'
  | 'glacier'
  | 'obsidian'
  | 'snow'
  | 'parchment'
  | 'mist'
  | 'harbor'
  | 'custom'

/** Seed colors for the Custom theme; other tokens are derived at apply time. */
export type CustomPalette = {
  mode: 'dark' | 'light'
  background: string
  text: string
  muted: string
  accentA: string
  accentB: string
}

export type PresetColorThemeId = Exclude<ColorThemeId, 'custom'>

/** Seed palettes used by presets and “Start from…” for Custom. */
export const PRESET_PALETTE_SEEDS: Record<PresetColorThemeId, CustomPalette> = {
  void: {
    mode: 'dark',
    background: '#060a0e',
    text: '#c5d4de',
    muted: '#7f96a6',
    accentA: '#b8944f',
    accentB: '#4ab5ac',
  },
  ember: {
    mode: 'dark',
    background: '#120a08',
    text: '#efe2d4',
    muted: '#a89888',
    accentA: '#c87840',
    accentB: '#e8a878',
  },
  glacier: {
    mode: 'dark',
    background: '#071018',
    text: '#d4e4ec',
    muted: '#8eb6c9',
    accentA: '#8eb6c9',
    accentB: '#5ec4d4',
  },
  obsidian: {
    mode: 'dark',
    background: '#010101',
    text: '#d8dce0',
    muted: '#9aa0a6',
    accentA: '#9aa0a6',
    accentB: '#6e7a84',
  },
  snow: {
    mode: 'light',
    background: '#f3f6f8',
    text: '#2a3540',
    muted: '#5a6f7e',
    accentA: '#1a6b66',
    accentB: '#2a9a92',
  },
  parchment: {
    mode: 'light',
    background: '#f2efe8',
    text: '#2c2924',
    muted: '#6a6358',
    accentA: '#8a6a32',
    accentB: '#a08048',
  },
  mist: {
    mode: 'light',
    background: '#eef2f5',
    text: '#243040',
    muted: '#6a7a88',
    accentA: '#9a8048',
    accentB: '#5a8a88',
  },
  harbor: {
    mode: 'light',
    background: '#f7fbfb',
    text: '#1e3338',
    muted: '#4f6a6e',
    accentA: '#2a8f86',
    accentB: '#1ea89c',
  },
}

export const DEFAULT_CUSTOM_PALETTE: CustomPalette = { ...PRESET_PALETTE_SEEDS.void }

export const COLOR_THEME_META: Record<
  ColorThemeId,
  { label: string; mode: 'dark' | 'light'; description: string; swatches: [string, string, string] }
> = {
  void: {
    label: 'Void',
    mode: 'dark',
    description: 'Default night void with gold and teal',
    swatches: ['#060a0e', '#c9b07a', '#4ab5ac'],
  },
  ember: {
    label: 'Ember',
    mode: 'dark',
    description: 'Warm forge tones — copper on charcoal',
    swatches: ['#120a08', '#d4956a', '#e8c4a0'],
  },
  glacier: {
    label: 'Glacier',
    mode: 'dark',
    description: 'Cool steel and ice on deep navy',
    swatches: ['#071018', '#8eb6c9', '#5ec4d4'],
  },
  obsidian: {
    label: 'Obsidian',
    mode: 'dark',
    description: 'Near-black with muted silver accents',
    swatches: ['#010101', '#9aa0a6', '#6e7a84'],
  },
  snow: {
    label: 'Snow',
    mode: 'light',
    description: 'Clean cool light with teal accents',
    swatches: ['#f3f6f8', '#1a6b66', '#2a3540'],
  },
  parchment: {
    label: 'Parchment',
    mode: 'light',
    description: 'Soft warm paper with ink and brass',
    swatches: ['#f2efe8', '#8a6a32', '#2c2924'],
  },
  mist: {
    label: 'Mist',
    mode: 'light',
    description: 'Airy blue-gray with muted gold',
    swatches: ['#eef2f5', '#9a8048', '#243040'],
  },
  harbor: {
    label: 'Harbor',
    mode: 'light',
    description: 'Bright coastal white with seafoam accents',
    swatches: ['#f7fbfb', '#2a8f86', '#1e3338'],
  },
  custom: {
    label: 'Custom',
    mode: 'dark',
    description: 'Your own palette — pick accents below',
    swatches: ['#060a0e', '#b8944f', '#4ab5ac'],
  },
}

/** Modules that can appear on the live overlay (excludes companion-only). */
export const OVERLAY_MODULE_IDS: ModuleId[] = [
  'cycles',
  'fissures',
  'baro',
  'nightwave',
  'relics',
  'arbitration',
  'invasions',
  'archon',
  'deepArchimedea',
  'rivens',
]

export type AppSettings = {
  modules: Record<ModuleId, boolean>
  panelAnchors: Partial<Record<ModuleId, PanelAnchor>>
  /**
   * Legacy global opacity fallback. Prefer `moduleOpacity` per panel;
   * kept so older settings files still load cleanly.
   */
  opacity: number
  /** Per-overlay panel opacity (0.4–1). Missing keys fall back to `opacity`. */
  moduleOpacity: Partial<Record<ModuleId, number>>
  /** Visual scale for overlay panels (WFHelper-style). */
  overlayScale: number
  /** Companion + overlay color palette. */
  colorTheme: ColorThemeId
  /** Seed colors when `colorTheme` is `custom`. */
  customPalette: CustomPalette
  hotkeys: HotkeyConfig
  eeLogPath: string
  inventoryPath: string
  inventorySource: InventorySource
  inventoryConsent: boolean
  inventoryLastSynced: string
  fissureTiers: string[]
  /** Normal (star chart), Steel Path only, or both. */
  fissurePathMode: FissurePathMode
  /** When false, hide Railjack / Void Storm fissures. */
  fissureShowStorms: boolean
  fissureSort: FissureSort
  /**
   * Electron `Display.id` used for OCR capture + overlay placement.
   * `null` = system primary display.
   */
  ocrDisplayId: number | null
  /**
   * Force Warframe UI theme for relic OCR text isolation.
   * `null` = auto-detect from the screenshot (WFInfo-style).
   */
  wfThemeOverride: WfThemeId | null
  /**
   * Force 3 or 4 reward slots. `null` = EE.log hint, then image detect.
   */
  relicSquadSizeOverride: 3 | 4 | null
  overlayVisible: boolean
  layoutEditMode: boolean
  /** After the user has dragged a live overlay once, hide the move-hint chip. */
  overlayDragHintDismissed: boolean
  /** Starred Baro item names (case-insensitive match). */
  baroWishlist: string[]
  /** Locally completed Nightwave challenge ids. */
  nightwaveDoneIds: string[]
  /** Soft chime when relic OCR finishes. */
  relicSoundEnabled: boolean
  /** Soft chime when riven OCR finishes. */
  rivenSoundEnabled: boolean
  /** Chime style for relic/riven alerts. */
  soundPack: SoundPackId
  /** Last applied session profile id (UI highlight only). */
  activePlayProfile: string | null
  /** Item names to track on the Market tab (warframe.market). */
  marketWatchlist: string[]
  /** Serve localhost HTML widgets for OBS / external overlays. */
  widgetServerEnabled: boolean
  /** Port for the widget HTTP server (127.0.0.1 only). */
  widgetServerPort: number
  /** After first-run checklist, minimize companion to tray on launch. */
  quietMode: boolean
  /** Auto-resync inventory while Warframe is running. */
  inventoryAutoSync: boolean
  /** Last app version for which “What’s new” was dismissed. */
  lastSeenVersion: string
  /** First-run checklist + tour state */
  onboarding: {
    checklistDismissed: boolean
    borderlessAck: boolean
    modulesTouched: boolean
    layoutVisited: boolean
    inventoryTouched: boolean
    tourCompleted: boolean
    trayTipShown: boolean
    firstRelicSuccessAck: boolean
    /** Linux: finished or skipped the screen-capture wizard. */
    linuxCaptureAck: boolean
  }
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
    description: 'Arrival status, shop inventory, and wishlist alerts',
    phase: 1,
  },
  nightwave: {
    label: 'Nightwave',
    description: 'Season status and active daily / weekly challenges',
    phase: 1,
  },
  relics: {
    label: 'Relic Rewards',
    description:
      'Popup when a fissure reward screen is detected (EE.log / hotkey) — AlecaFrame-style',
    phase: 2,
  },
  arbitration: {
    label: 'Arbitration',
    description: 'Current Arbitration node and countdown when one is active',
    phase: 1,
  },
  invasions: {
    label: 'Invasions',
    description: 'Active invasions and progress',
    phase: 1,
  },
  archon: {
    label: 'Archon Hunt',
    description: 'Weekly Archon Hunt boss and missions',
    phase: 1,
  },
  deepArchimedea: {
    label: 'Deep Archimedea',
    description: 'Current Deep Archimedea missions and modifiers',
    phase: 1,
  },
  rivens: {
    label: 'Riven Grader',
    description:
      'Popup while rerolling: grades current vs new roll and recommends which to keep',
    phase: 2,
  },
  foundry: {
    label: 'Foundry Planner',
    description:
      'Companion crafting planner: browse recipes, owned/mastered status, and crafting trees',
    phase: 2,
  },
  market: {
    label: 'Market',
    description:
      'warframe.market watchlist with platinum quotes; ties into relic and riven scans',
    phase: 3,
  },
}

export const DEFAULT_SETTINGS: AppSettings = {
  modules: {
    cycles: true,
    fissures: true,
    baro: true,
    nightwave: true,
    relics: true,
    arbitration: true,
    invasions: false,
    archon: true,
    deepArchimedea: false,
    rivens: true,
    foundry: true,
    market: true,
  },
  panelAnchors: {
    cycles: { x: 24, y: 24 },
    fissures: { x: 24, y: 280 },
    baro: { x: 24, y: 560 },
    nightwave: { x: 320, y: 24 },
    relics: { x: 410, y: 640 },
    arbitration: { x: 420, y: 420 },
    invasions: { x: 720, y: 24 },
    archon: { x: 720, y: 320 },
    deepArchimedea: { x: 720, y: 560 },
    /** Above Kuva Cycle compare cards on 1920×1080; Layout reset scales per display. */
    rivens: { x: 720, y: 8 },
  },
  opacity: 0.92,
  moduleOpacity: {
    cycles: 0.92,
    fissures: 0.92,
    baro: 0.92,
    nightwave: 0.92,
    relics: 0.92,
    arbitration: 0.92,
    invasions: 0.92,
    archon: 0.92,
    deepArchimedea: 0.92,
    rivens: 0.92,
  },
  overlayScale: 1,
  colorTheme: 'void',
  customPalette: { ...DEFAULT_CUSTOM_PALETTE },
  hotkeys: {
    toggleOverlay: 'Alt+Shift+V',
    openCompanion: 'Alt+Shift+C',
    refreshWorldstate: 'Alt+Shift+R',
    scanRelics: 'Alt+Shift+F',
    dismissRelics: 'Alt+Shift+D',
    scanRivens: 'Alt+Shift+G',
    dismissRivens: 'Alt+Shift+H',
    editLayout: 'Control+Tab',
  },
  eeLogPath: '',
  inventoryPath: '',
  inventorySource: 'none',
  inventoryConsent: false,
  inventoryLastSynced: '',
  fissureTiers: ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem'],
  fissurePathMode: 'both',
  fissureShowStorms: true,
  fissureSort: 'eta',
  ocrDisplayId: null,
  wfThemeOverride: null,
  relicSquadSizeOverride: null,
  overlayVisible: true,
  layoutEditMode: false,
  overlayDragHintDismissed: false,
  baroWishlist: [],
  nightwaveDoneIds: [],
  relicSoundEnabled: true,
  rivenSoundEnabled: true,
  soundPack: 'soft',
  activePlayProfile: null,
  marketWatchlist: [],
  widgetServerEnabled: false,
  widgetServerPort: 17862,
  quietMode: false,
  inventoryAutoSync: true,
  lastSeenVersion: '',
  onboarding: {
    checklistDismissed: false,
    borderlessAck: false,
    modulesTouched: false,
    layoutVisited: false,
    inventoryTouched: false,
    tourCompleted: false,
    trayTipShown: false,
    firstRelicSuccessAck: false,
    linuxCaptureAck: false,
  },
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
  /** Railjack / Void Storm fissure. */
  isStorm: boolean
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

export type NightwaveChallenge = {
  id: string
  title: string
  description: string
  reputation: number
  isDaily: boolean
  isElite: boolean
  expiry: string
}

export type NightwaveInfo = {
  active: boolean
  season: number
  tag: string
  expiry: string
  phase: number
  challenges: NightwaveChallenge[]
}

export type ArbitrationInfo = {
  node: string
  type: string
  enemy: string
  expiry: string
  eta: string
}

export type InvasionInfo = {
  id: string
  node: string
  desc: string
  attacker: string
  defender: string
  completion: number
  eta: string
  expiry: string
}

export type ArchonHuntInfo = {
  boss: string
  faction: string
  expiry: string
  eta: string
  missions: Array<{ node: string; type: string }>
}

export type DeepArchimedeaInfo = {
  id: string
  expiry: string
  eta: string
  missions: Array<{ node: string; type: string }>
  riskVariables: string[]
}

export type WorldstateSnapshot = {
  fetchedAt: string
  error: string | null
  stale: boolean
  cycles: CycleInfo[]
  fissures: FissureInfo[]
  baro: BaroInfo | null
  nightwave: NightwaveInfo | null
  arbitration: ArbitrationInfo | null
  invasions: InvasionInfo[]
  archonHunt: ArchonHuntInfo | null
  deepArchimedea: DeepArchimedeaInfo | null
}

export type InventoryIndex = Record<string, number>

/** Per-item mastery/owned info from inventory export (may be incomplete). */
export type MasteryEntry = {
  owned: number
  xpLevel: number | null
  /** null = unknown (export lacked XP data) */
  mastered: boolean | null
}

export type MasteryIndex = Record<string, MasteryEntry>

export type FoundryCategory =
  | 'warframe'
  | 'primary'
  | 'secondary'
  | 'melee'
  | 'companion'
  | 'archwing'
  | 'other'

export type RecipeComponent = {
  name: string
  uniqueName: string
  itemCount: number
  /** Nested recipe when present on the API payload. */
  components?: RecipeComponent[]
}

export type RecipeItem = {
  uniqueName: string
  name: string
  category: FoundryCategory
  masteryReq: number | null
  buildPrice: number | null
  buildTime: number | null
  vaulted: boolean | null
  isPrime: boolean
  components: RecipeComponent[]
}

export type FoundryOwnedFilter = 'any' | 'owned' | 'unowned'
export type FoundryMasteryFilter = 'any' | 'mastered' | 'unmastered' | 'unknown'
export type FoundryReadyFilter = 'any' | 'ready' | 'not_ready'
export type FoundryPrimeFilter = 'any' | 'prime' | 'normal'
export type FoundryVaultedFilter = 'any' | 'vaulted' | 'unvaulted'
/** inventory = owned gear + ready-to-build; all = full recipe catalog */
export type FoundryScopeFilter = 'inventory' | 'all'

export type FoundryListFilters = {
  search?: string
  category?: FoundryCategory | 'all'
  prime?: FoundryPrimeFilter
  owned?: FoundryOwnedFilter
  mastery?: FoundryMasteryFilter
  ready?: FoundryReadyFilter
  vaulted?: FoundryVaultedFilter
  /** Defaults to inventory-scoped list for performance. */
  scope?: FoundryScopeFilter
}

export type FoundryListItem = {
  uniqueName: string
  name: string
  category: FoundryCategory
  masteryReq: number | null
  buildPrice: number | null
  buildTime: number | null
  vaulted: boolean | null
  isPrime: boolean
  owned: boolean
  ownedCount: number
  mastered: boolean | null
  readyToBuild: boolean
  missingDirect: number
}

export type FoundryTreeNode = {
  name: string
  uniqueName: string
  required: number
  owned: number
  missing: number
  children: FoundryTreeNode[]
}

export type FoundryTotalLine = {
  name: string
  uniqueName: string
  required: number
  owned: number
  missing: number
}

export type FoundryTreeResult = {
  item: FoundryListItem | null
  tree: FoundryTreeNode | null
  totals: FoundryTotalLine[]
  inventoryLoaded: boolean
  error: string | null
}

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
  /** Node process.platform */
  platform: string
  /** Linux: Warframe Steam/Proton prefix detected */
  protonPlay: boolean
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
  /** Match confidence 0–1 (1 = exact catalog match). */
  matchScore: number
  ducats: number | null
  /** Median warframe.market platinum (sell orders), if available. */
  platinum: number | null
  volume: number | null
  /** Best overall pick among the four rewards. */
  bestPick: boolean
  /** Prime set is currently vaulted (when known from catalog). */
  vaulted: boolean | null
}

export type RelicScanState = {
  active: boolean
  scanning: boolean
  scannedAt: string
  trigger: 'manual' | 'log' | 'none'
  error: string | null
  rewards: RewardEval[]
  inventoryLoaded: boolean
  celebration: boolean
  /** EE.log squad-size hint (1–4) when available. */
  squadSize: number | null
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

export type PrimaryDisplayInfo = {
  width: number
  height: number
  scaleFactor: number
  /** Electron display id when available. */
  id?: number
  label?: string
  isPrimary?: boolean
}

export type DisplayChoice = {
  id: number
  label: string
  width: number
  height: number
  scaleFactor: number
  isPrimary: boolean
}

export type HotkeyRegistration = {
  id: keyof HotkeyConfig
  requested: string
  registered: string | null
  ok: boolean
}

export type BugReportCategory =
  | 'relics'
  | 'rivens'
  | 'overlay'
  | 'inventory'
  | 'linux'
  | 'other'

export type BugReportDraft = {
  title: string
  category: BugReportCategory
  description: string
  includeDiagnostics: boolean
}

export type BugReportOpenResult = {
  ok: boolean
  url: string
  truncated: boolean
  stagingDir: string | null
  debugDirs: string[]
  error?: string
}

export type VoidLensApi = {
  getSettings: () => Promise<AppSettings>
  updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  setModuleEnabled: (id: ModuleId, enabled: boolean) => Promise<AppSettings>
  getPrimaryDisplay: () => Promise<PrimaryDisplayInfo>
  listDisplays: () => Promise<DisplayChoice[]>
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
  ackRelicCelebration: () => Promise<RelicScanState>
  getRivenScan: () => Promise<RivenScanState>
  scanRivens: () => Promise<RivenScanState>
  clearRivenScan: () => Promise<RivenScanState>
  getFoundryItems: (filters?: FoundryListFilters) => Promise<FoundryListItem[]>
  getFoundryTree: (uniqueName: string) => Promise<FoundryTreeResult>
  getHotkeyStatus: () => Promise<HotkeyRegistration[]>
  getAppVersion: () => Promise<string>
  getUpdateStatus: () => Promise<AppUpdateStatus>
  checkForUpdates: () => Promise<AppUpdateStatus>
  installUpdate: () => Promise<boolean>
  openBugReport: (draft: BugReportDraft) => Promise<BugReportOpenResult>
  copyBugDiagnostics: (draft?: Partial<BugReportDraft>) => Promise<boolean>
  pickBugScreenshots: () => Promise<{ stagingDir: string; count: number } | null>
  openBugDebugFolders: () => Promise<string[]>
  lookupMarketPrices: (
    names: string[],
  ) => Promise<Array<{ name: string; platinum: number; volume: number }>>
  openExternal: (url: string) => Promise<boolean>
  testScreenCapture: () => Promise<{ ok: boolean; message: string }>
  getWidgetServerStatus: () => Promise<{ running: boolean; port: number; baseUrl: string }>
  onSettingsChanged: (cb: (settings: AppSettings) => void) => () => void
  onWorldstateUpdated: (cb: (data: WorldstateSnapshot) => void) => () => void
  onOverlayVisibilityChanged: (cb: (visible: boolean) => void) => () => void
  onInventoryUpdated: (cb: (status: InventoryStatus) => void) => () => void
  onRelicScanUpdated: (cb: (state: RelicScanState) => void) => () => void
  onRivenScanUpdated: (cb: (state: RivenScanState) => void) => () => void
  onUpdateStatus: (cb: (status: AppUpdateStatus) => void) => () => void
  onRelicSound: (cb: () => void) => () => void
  onRivenSound: (cb: () => void) => () => void
}
