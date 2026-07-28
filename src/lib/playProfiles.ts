import { AppSettings, ModuleId } from '../../shared/types'

export type PlayProfileId =
  | 'fissure-grind'
  | 'riven-farm'
  | 'open-world'
  | 'baro-day'
  | 'nightwave'

export type PlayProfile = {
  id: PlayProfileId
  label: string
  description: string
  modules: Partial<Record<ModuleId, boolean>>
  /** Optional fissure / path tweaks applied with the profile. */
  extras?: Partial<
    Pick<AppSettings, 'fissurePathMode' | 'fissureShowStorms' | 'fissureSort'>
  >
}

export const PLAY_PROFILES: PlayProfile[] = [
  {
    id: 'fissure-grind',
    label: 'Relic farm',
    description: 'Fissures + relic popup + cycles',
    modules: {
      cycles: true,
      fissures: true,
      relics: true,
      rivens: false,
      relicPlanner: true,
      mastery: true,
      baro: false,
      nightwave: false,
      arbitration: false,
      invasions: false,
      archon: false,
      deepArchimedea: false,
    },
    extras: {
      fissureSort: 'eta',
      fissureShowStorms: true,
    },
  },
  {
    id: 'riven-farm',
    label: 'Riven farm',
    description: 'Riven grader popup + cycles',
    modules: {
      cycles: true,
      fissures: false,
      relics: false,
      rivens: true,
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
    description: 'World cycles, Nightwave, invasions',
    modules: {
      cycles: true,
      fissures: false,
      relics: false,
      rivens: false,
      baro: false,
      nightwave: true,
      arbitration: false,
      invasions: true,
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
      rivens: false,
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
      rivens: false,
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
    activePlayProfile: profile.id,
    ...profile.extras,
  }
}
