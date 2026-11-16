import { useEffect, useRef, useState } from 'react'
import d2149 from '../assets/banners/v2/banner-discount-30-2149.webp'
import d1200 from '../assets/banners/v2/banner-discount-30-1200.webp'
import v2149 from '../assets/banners/v2/banner-delivery-2149.webp'
import v1200 from '../assets/banners/v2/banner-delivery-1200.webp'
import s2149 from '../assets/banners/v2/banner-pixel-shop-2149.webp'
import s1200 from '../assets/banners/v2/banner-pixel-shop-1200.webp'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from '../ui/kit'
import { useNav } from '../store/nav'

// Баннеры 2149×732 (исходники в brand/banners-v2, прошлые в brand/banners-archive); два размера WebP для srcset
const BANNERS: { src: string; big: string; alt: string; open?: () => void }[] = [
  { src: d1200, big: d2149, alt: 'Скидки до 30%', open: () => useNav.getState().go('terms', { q: 'Есть ли скидки за срок?' }) },
  { src: v1200, big: v2149, alt: 'Доступна доставка оборудования', open: () => useNav.getState().go('terms', { q: 'Доставка' }) },
  { src: s1200, big: s2149, alt: 'Pixel Shop. Магазин фото-видео техники' },
]
const AUTO_MS = 5000

/** Компактная карусель: нативный свайп (scroll-snap), автопрокрутка раз в 5 с, точки */
export function Banners() {
  const ref = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(0)
  const touching = useRef(false)
  const lastUser = useRef(0)

  const goTo = (i: number) => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  // текущий слайд по позиции прокрутки
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  // автопрокрутка; пауза, пока палец на баннере, и 5 с после свайпа; не крутим в фоне
  useEffect(() => {
    const t = setInterval(() => {
      if (touching.current || document.hidden || Date.now() - lastUser.current < AUTO_MS) return
      const el = ref.current
      if (!el) return
      const cur = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
      goTo((cur + 1) % BANNERS.length)
    }, AUTO_MS)
    return () => clearInterval(t)
  }, [])

  const hold = () => { touching.current = true; lastUser.current = Date.now() }
  const release = () => { touching.current = false; lastUser.current = Date.now() }

  return (
    <section aria-roledescription="carousel" aria-label="Акции" className="relative -mb-3 w-full">
      <div ref={ref} onTouchStart={hold} onTouchEnd={release} onTouchCancel={release} onPointerDown={hold} onPointerUp={release}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none rounded-2xl bg-[#0b0b0b] overscroll-x-contain">
        {BANNERS.map((b, i) => (
          <div key={b.src} className="snap-center snap-always shrink-0 w-full aspect-[2149/732]" aria-roledescription="slide" aria-label={`${i + 1} из ${BANNERS.length}`}>
            {/* картинка с собственной рамкой: соотношение контейнера = соотношению файла, без обрезки */}
            {(() => {
              const img = <img src={b.src} srcSet={`${b.src} 1200w, ${b.big} 2149w`} sizes="(min-width: 64rem) 90vw, 100vw" width={2149} height={732} alt={b.alt} draggable={false} decoding="async"
                loading={i === 0 ? 'eager' : 'lazy'} {...(i === 0 ? { fetchPriority: 'high' as const } : {})} className="size-full object-cover" />
              return b.open ? <button type="button" onClick={b.open} className="block size-full" aria-label={b.alt}>{img}</button> : img
            })()}
          </div>
        ))}
      </div>
      {/* стрелки — только там, где есть мышь (на сайте), на телефоне листают свайпом */}
      {(['prev', 'next'] as const).map(d => (
        <button key={d} aria-label={d === 'prev' ? 'Предыдущий баннер' : 'Следующий баннер'}
          onClick={() => { lastUser.current = Date.now(); goTo((idx + (d === 'next' ? 1 : BANNERS.length - 1)) % BANNERS.length) }}
          className={cx('press hidden [@media(hover:hover)]:grid absolute top-[calc(50%-14px)] -translate-y-1/2 size-9 place-items-center rounded-full bg-bg/80 text-fg hover:bg-bg', d === 'prev' ? 'left-2.5' : 'right-2.5')}>
          {d === 'prev' ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
        </button>
      ))}
      <div className="mt-1 flex justify-center">
        {BANNERS.map((_, i) => (
          <button key={i} aria-label={`Баннер ${i + 1}`} onClick={() => { lastUser.current = Date.now(); goTo(i) }}
            className="h-6 min-w-6 px-1 grid place-items-center">
            <span className={cx('block h-1.5 rounded-full transition-[width,background-color] duration-300', i === idx ? 'w-4 bg-accent' : 'w-1.5 bg-line-2')} />
          </button>
        ))}
      </div>
    </section>
  )
}
