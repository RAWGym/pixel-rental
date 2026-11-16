// Подстройка под устройство: слабые телефоны получают облегчённые анимации,
// реальная высота экрана (100dvh) и признак «установлено как приложение»
export const isLowEnd = () => {
  const n = navigator as any
  const cores = n.hardwareConcurrency ?? 8
  const mem = n.deviceMemory ?? 8
  const saveData = !!n.connection?.saveData
  return saveData || cores <= 4 || mem <= 3
}
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function initDevice() {
  const el = document.documentElement
  if (isLowEnd()) el.classList.add('lite')
  if (isStandalone()) el.classList.add('standalone')
}
