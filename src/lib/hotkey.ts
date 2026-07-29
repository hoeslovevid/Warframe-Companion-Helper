/** Pretty-print Electron accelerators for UI hints (WFHelper-style). */
export function prettyHotkey(hotkey: string | null | undefined): string {
  return String(hotkey || '')
    .replace(/CommandOrControl/g, 'Ctrl')
    .replace(/Control/g, 'Ctrl')
    .replace(/Command/g, 'Cmd')
    .replace(/\+/g, ' + ')
}

const CODE_TO_ACCEL: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Return',
  NumpadEnter: 'Return',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  NumpadAdd: 'Plus',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
}

/**
 * Convert a KeyboardEvent into an Electron accelerator string, or null if the
 * event is modifiers-only / not a bindable key.
 */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  const code = e.code || ''

  // Modifier-only — wait for a real key.
  if (
    code === 'ControlLeft' ||
    code === 'ControlRight' ||
    code === 'ShiftLeft' ||
    code === 'ShiftRight' ||
    code === 'AltLeft' ||
    code === 'AltRight' ||
    code === 'MetaLeft' ||
    code === 'MetaRight' ||
    code === 'OSLeft' ||
    code === 'OSRight'
  ) {
    return null
  }

  let key: string | null = null
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3)
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5)
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code
  else if (/^Numpad[0-9]$/.test(code)) key = `num${code.slice(6)}`
  else if (CODE_TO_ACCEL[code]) key = CODE_TO_ACCEL[code]
  else if (e.key && e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
    key = e.key.toUpperCase()
  }

  if (!key) return null

  const parts: string[] = []
  // Match existing defaults (Control+Tab, Alt+Shift+F) — prefer Control over CommandOrControl.
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Command')
  parts.push(key)
  return parts.join('+')
}
