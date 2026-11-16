// Мост к нативной обёртке (Expo / React Native WebView). В браузере просто ничего не делает.
type Msg = { type: 'haptic'; style?: 'light' | 'medium' | 'success' } | { type: 'exit' } | { type: 'ready' } | { type: 'theme'; color: string }

export const isNative = () => typeof window !== 'undefined' && !!(window as any).ReactNativeWebView

export function postNative(m: Msg) {
  try { (window as any).ReactNativeWebView?.postMessage(JSON.stringify(m)) } catch { /* noop */ }
}

/** Стек открытых шторок: аппаратная «назад» на Android сначала закрывает их */
export const sheetStack: (() => void)[] = []
