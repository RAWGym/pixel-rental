import type { Booking, Contract, ContractSnapshot, ContractTemplate, Customer, Product, Settings, Unit } from '../data/types'

/** Текст условий по умолчанию (версия 1) — совпадает с supabase/migrations/…_issue_contracts.sql */
export const DEFAULT_CONTRACT_BODY = `Поставщик (Pixel Rental) передаёт, а Арендатор принимает во временное пользование технику, указанную в акте, на указанный срок.
1. Арендатор проверил комплектность и внешнее состояние техники при получении. Замечания внесены в акт.
2. Арендатор обязуется использовать технику бережно, по назначению, не передавать третьим лицам и вернуть её в срок в том же состоянии с учётом нормального износа.
3. Стоимость аренды указана в акте.
4. За просрочку возврата начисляется оплата за каждые начатые сутки по тарифу. При утрате или повреждении Арендатор возмещает стоимость ремонта или рыночную стоимость техники.
5. Риск случайной гибели и повреждения техники с момента выдачи до возврата несёт Арендатор.
6. Подписывая акт, Арендатор подтверждает согласие с условиями аренды и достоверность своих данных.`

export const DEFAULT_TEMPLATES: ContractTemplate[] = [{ version: 2, body: DEFAULT_CONTRACT_BODY, createdAt: Date.UTC(2026, 10, 16) }]
export const currentTemplate = (s: Settings): ContractTemplate => {
  const list = s.contractTemplates?.length ? s.contractTemplates : DEFAULT_TEMPLATES
  return list.reduce((a, b) => (b.version > a.version ? b : a))
}

/** снимок брони для договора (в общей базе его собирает сервер — здесь для демо и предпросмотра) */
export function buildSnapshot(b: Booking, c: Customer | undefined, products: Product[], units: Unit[], unitIds?: Record<string, string[]>): ContractSnapshot {
  return {
    code: b.code, city: b.city, supplier: 'Pixel Rental',
    customer: { id: c?.id ?? b.customerId, name: c?.name ?? '-', phone: c?.phone ?? '', iin: c?.iin ?? null, verification: c?.verification ?? (c?.verified ? 'verified' : 'none') },
    start: b.start, end: b.end, days: b.days,
    items: b.items.map(i => {
      const p = products.find(x => x.id === i.productId)
      const ids = unitIds?.[i.productId] ?? i.unitIds
      return { product_id: i.productId, name: p?.name ?? i.productId, qty: i.qty, price: i.price, units: ids.map(id => ({ id, serial: units.find(u => u.id === id)?.serial ?? id })) }
    }),
    subtotal: b.subtotal, discount: b.discount, delivery: b.delivery, total: b.total, paid: b.paid, payment_status: b.paymentStatus, payment_method: b.paymentMethod,
  }
}

export const activeContract = (b: Booking): Contract | undefined => (b.contract && b.contract.status === 'signed' ? b.contract : undefined)

/* ---------- SHA-256 (свой — работает и без защищённого контекста, например в приложении из файла) ---------- */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
export function sha256(input: Uint8Array | string): string {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const len = data.length, total = ((len + 9 + 63) >> 6) << 6
  const buf = new Uint8Array(total); buf.set(data); buf[len] = 0x80
  const dv = new DataView(buf.buffer); dv.setUint32(total - 4, len * 8 >>> 0); dv.setUint32(total - 8, Math.floor(len / 0x20000000))
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const W = new Uint32Array(64)
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4)
    for (let i = 16; i < 64; i++) W[i] = (r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3)) + W[i - 7] + (r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10)) + W[i - 16]
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h
  }
  return [...H].map(x => x.toString(16).padStart(8, '0')).join('')
}
export const dataUrlBytes = (u: string) => Uint8Array.from(atob(u.split(',')[1]), ch => ch.charCodeAt(0))
