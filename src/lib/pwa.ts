import { create } from 'zustand'
import { isIOS, isStandalone } from './device'
import { isNative } from './native'

/** Установка PWA: Android/ПК — системный запрос (beforeinstallprompt), iOS — подсказка «Поделиться → На экран Домой» */
interface Pwa { prompt: any | null; installed: boolean; iosHint: boolean }
export const usePwa = create<Pwa>(() => ({ prompt: null, installed: typeof window !== 'undefined' && isStandalone(), iosHint: false }))

if (typeof window !== 'undefined' && !isNative()) {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); usePwa.setState({ prompt: e }) })
  addEventListener('appinstalled', () => usePwa.setState({ prompt: null, installed: true }))
  usePwa.setState({ iosHint: isIOS() && !isStandalone() })
}

/** можно ли предложить установку на этом устройстве */
export const canInstall = (s: Pwa) => !s.installed && (!!s.prompt || s.iosHint)

export async function install(): Promise<'accepted' | 'dismissed' | 'ios' | 'unavailable'> {
  const { prompt, iosHint } = usePwa.getState()
  if (prompt) {
    prompt.prompt()
    const r = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }))
    usePwa.setState({ prompt: null })
    return r.outcome === 'accepted' ? 'accepted' : 'dismissed'
  }
  return iosHint ? 'ios' : 'unavailable'
}
