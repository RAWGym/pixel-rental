import { create } from 'zustand'

// Навигация админки живёт отдельно от её экранов: так клиентская часть не тянет код админки в стартовый бандл
export type AdminPage = 'dashboard' | 'bookings' | 'calendar' | 'products' | 'leads' | 'customers' | 'staff' | 'settings' | 'audit'
export const useAdminNav = create<{ page: AdminPage; focus?: string; go: (p: AdminPage, focus?: string) => void }>(set => ({ page: 'dashboard', go: (page, focus) => set({ page, focus }) }))
