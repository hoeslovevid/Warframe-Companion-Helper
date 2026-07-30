import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  AppUpdateStatus,
  BugReportDraft,
  FoundryListFilters,
  HotkeyRegistration,
  InventoryStatus,
  MasteryHelperQuery,
  ModuleId,
  DisplayChoice,
  PrimaryDisplayInfo,
  RelicPlannerQuery,
  RelicScanState,
  RivenScanState,
  UninstallInfo,
  VoidLensApi,
  WorldstateSnapshot,
} from '../shared/types'

const api: VoidLensApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial),
  setModuleEnabled: (id: ModuleId, enabled: boolean) =>
    ipcRenderer.invoke('settings:setModule', id, enabled),
  getPrimaryDisplay: () => ipcRenderer.invoke('display:getPrimary') as Promise<PrimaryDisplayInfo>,
  listDisplays: () => ipcRenderer.invoke('display:list') as Promise<DisplayChoice[]>,
  getWorldstate: () => ipcRenderer.invoke('worldstate:get'),
  refreshWorldstate: () => ipcRenderer.invoke('worldstate:refresh'),
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  setLayoutEditMode: (enabled: boolean) => ipcRenderer.invoke('overlay:setLayoutEdit', enabled),
  pickEeLogPath: () => ipcRenderer.invoke('dialog:pickEeLog'),
  pickInventoryPath: () => ipcRenderer.invoke('dialog:pickInventory'),
  detectEeLogPath: () => ipcRenderer.invoke('log:detectEe'),
  getInventoryStatus: () => ipcRenderer.invoke('inventory:status'),
  setInventoryConsent: (consent: boolean) => ipcRenderer.invoke('inventory:consent', consent),
  detectInventorySources: () => ipcRenderer.invoke('inventory:detect'),
  useInventoryCandidate: (path: string) => ipcRenderer.invoke('inventory:use', path),
  syncInventoryFromGame: () => ipcRenderer.invoke('inventory:sync'),
  clearInventory: () => ipcRenderer.invoke('inventory:clear'),
  getInventoryIndex: () => ipcRenderer.invoke('inventory:index'),
  getRelicScan: () => ipcRenderer.invoke('relics:get'),
  scanRelicRewards: () => ipcRenderer.invoke('relics:scan'),
  clearRelicScan: () => ipcRenderer.invoke('relics:clear'),
  ackRelicCelebration: () => ipcRenderer.invoke('relics:ackCelebration'),
  getRivenScan: () => ipcRenderer.invoke('rivens:get'),
  scanRivens: () => ipcRenderer.invoke('rivens:scan'),
  clearRivenScan: () => ipcRenderer.invoke('rivens:clear'),
  getFoundryItems: (filters?: FoundryListFilters) => ipcRenderer.invoke('foundry:list', filters),
  getFoundryTree: (uniqueName: string) => ipcRenderer.invoke('foundry:tree', uniqueName),
  getRelicPlanner: (query) => ipcRenderer.invoke('relicPlanner:list', query),
  getDropSources: (nameOrUnique: string) => ipcRenderer.invoke('relicPlanner:drops', nameOrUnique),
  getSetFarm: (opts) => ipcRenderer.invoke('setFarm:get', opts),
  getMasteryHelper: (query) => ipcRenderer.invoke('mastery:list', query),
  getHotkeyStatus: () => ipcRenderer.invoke('hotkeys:status') as Promise<HotkeyRegistration[]>,
  getAppVersion: () => ipcRenderer.invoke('app:version') as Promise<string>,
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openBugReport: (draft: BugReportDraft) => ipcRenderer.invoke('bugReport:open', draft),
  copyBugDiagnostics: (draft?: Partial<BugReportDraft>) =>
    ipcRenderer.invoke('bugReport:copyDiagnostics', draft),
  pickBugScreenshots: () => ipcRenderer.invoke('bugReport:pickScreenshots'),
  openBugDebugFolders: () => ipcRenderer.invoke('bugReport:openDebugFolders'),
  getUninstallInfo: () => ipcRenderer.invoke('app:uninstallInfo') as Promise<UninstallInfo>,
  launchUninstaller: () => ipcRenderer.invoke('app:launchUninstaller'),
  openWindowsAppsSettings: () => ipcRenderer.invoke('app:openWindowsAppsSettings'),
  openUserDataFolder: () => ipcRenderer.invoke('app:openUserDataFolder'),
  clearUserDataAndQuit: () => ipcRenderer.invoke('app:clearUserDataAndQuit'),
  lookupMarketPrices: (names) => ipcRenderer.invoke('market:lookup', names),
  getWfmSession: () => ipcRenderer.invoke('market:wfmSession'),
  setWfmJwt: (jwt) => ipcRenderer.invoke('market:wfmSetJwt', jwt),
  clearWfmJwt: () => ipcRenderer.invoke('market:wfmClear'),
  getWfmOrders: () => ipcRenderer.invoke('market:wfmOrders'),
  deleteWfmOrder: (orderId) => ipcRenderer.invoke('market:wfmDeleteOrder', orderId),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  testScreenCapture: () => ipcRenderer.invoke('capture:test'),
  getWidgetServerStatus: () => ipcRenderer.invoke('widgets:status'),
  onSettingsChanged: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, settings: AppSettings) => cb(settings)
    ipcRenderer.on('settings:changed', listener)
    return () => ipcRenderer.removeListener('settings:changed', listener)
  },
  onWorldstateUpdated: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, data: WorldstateSnapshot) => cb(data)
    ipcRenderer.on('worldstate:updated', listener)
    return () => ipcRenderer.removeListener('worldstate:updated', listener)
  },
  onOverlayVisibilityChanged: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, visible: boolean) => cb(visible)
    ipcRenderer.on('overlay:visibility', listener)
    return () => ipcRenderer.removeListener('overlay:visibility', listener)
  },
  onInventoryUpdated: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, status: InventoryStatus) => cb(status)
    ipcRenderer.on('inventory:updated', listener)
    return () => ipcRenderer.removeListener('inventory:updated', listener)
  },
  onRelicScanUpdated: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, state: RelicScanState) => cb(state)
    ipcRenderer.on('relics:updated', listener)
    return () => ipcRenderer.removeListener('relics:updated', listener)
  },
  onRivenScanUpdated: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, state: RivenScanState) => cb(state)
    ipcRenderer.on('rivens:updated', listener)
    return () => ipcRenderer.removeListener('rivens:updated', listener)
  },
  onUpdateStatus: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, status: AppUpdateStatus) => cb(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
  onRelicSound: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('relics:sound', listener)
    return () => ipcRenderer.removeListener('relics:sound', listener)
  },
  onRivenSound: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('rivens:sound', listener)
    return () => ipcRenderer.removeListener('rivens:sound', listener)
  },
}

contextBridge.exposeInMainWorld('voidlens', api)
