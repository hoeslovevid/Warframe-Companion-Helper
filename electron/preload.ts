import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  AppUpdateStatus,
  HotkeyRegistration,
  InventoryStatus,
  ModuleId,
  PrimaryDisplayInfo,
  RelicScanState,
  VoidLensApi,
  WorldstateSnapshot,
} from '../shared/types'

const api: VoidLensApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial),
  setModuleEnabled: (id: ModuleId, enabled: boolean) =>
    ipcRenderer.invoke('settings:setModule', id, enabled),
  getPrimaryDisplay: () => ipcRenderer.invoke('display:getPrimary') as Promise<PrimaryDisplayInfo>,
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
  getHotkeyStatus: () => ipcRenderer.invoke('hotkeys:status') as Promise<HotkeyRegistration[]>,
  getAppVersion: () => ipcRenderer.invoke('app:version') as Promise<string>,
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
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
}

contextBridge.exposeInMainWorld('voidlens', api)
