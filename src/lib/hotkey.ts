/** Pretty-print Electron accelerators for UI hints (WFHelper-style). */
export function prettyHotkey(hotkey: string | null | undefined): string {
  return String(hotkey || '')
    .replace(/CommandOrControl/g, 'Ctrl')
    .replace(/Control/g, 'Ctrl')
    .replace(/Command/g, 'Cmd')
    .replace(/\+/g, ' + ')
}
