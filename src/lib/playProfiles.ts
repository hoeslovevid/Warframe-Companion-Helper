import { AppSettings, ModuleId } from '../../shared/types'

export type PlayProfileId = 'fissure-grind' | 'open-world' | 'baro-day' | 'nightwave'

export type PlayProfile = {
  id: PlayProfileId
  label: string
  description: string
  modules: Partial<Record<ModuleId, boolean>>
}

export const PLAY_PROFILES: PlayProfile[] = [
  {
    id: 'fissure-grind',
    label: 'Fissure grind',
    description: 'Fissures + relic popup + cycles',
    modules: {
      cycles: true,
      fissures: true,
      relics: true,
      baro: false,
      nightwave: false,
      arbitration: false,
      invasions: false,
      archon: false,
      deepArchimedea: false,
    },
  },
  {
    id: 'open-world',
    label: 'Open world',
    description: 'World cycles front and center',
    modules: {
      cycles: true,
      fissures: false,
      relics: false,
      baro: false,
      nightwave: true,
      arbitration: false,
      invasions: false,
      archon: false,
      deepArchimedea: false,
    },
  },
  {
    id: 'baro-day',
    label: 'Baro day',
    description: 'Baro inventory + wishlist focus',
    modules: {
      cycles: false,
      fissures: false,
      relics: false,
      baro: true,
      nightwave: false,
      arbitration: false,
      invasions: false,
      archon: false,
      deepArchimedea: false,
    },
  },
  {
    id: 'nightwave',
    label: 'Nightwave',
    description: 'Challenges + weekly Archon Hunt',
    modules: {
      cycles: false,
      fissures: false,
      relics: false,
      baro: false,
      nightwave: true,
      arbitration: false,
      invasions: false,
      archon: true,
      deepArchimedea: false,
    },
  },
]

export function applyPlayProfile(
  settings: AppSettings,
  profileId: PlayProfileId,
): Partial<AppSettings> {
  const profile = PLAY_PROFILES.find((p) => p.id === profileId)
  if (!profile) return {}
  return {
    modules: { ...settings.modules, ...profile.modules },
  }
}
