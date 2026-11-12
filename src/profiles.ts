import type { Command, Role, Transaction } from './inventory'

export const profiles = {
  kuching: { name: 'Aina Rahman', initials: 'AR', role: 'Store Officer', city: 'Kuching' },
  miri: { name: 'Hafiz Tan', initials: 'HT', role: 'Store Officer', city: 'Miri' },
  sibu: { name: 'Mei Ling Lau', initials: 'ML', role: 'Store Officer', city: 'Sibu' },
  bintulu: { name: 'Nur Iman', initials: 'NI', role: 'Store Officer', city: 'Bintulu' },
  supervisor: { name: 'Daniel Tan', initials: 'DT', role: 'Supervisor', city: '' },
  manager: { name: 'Sara Lim', initials: 'SL', role: 'Manager', city: '' },
} as const satisfies Record<string, { name: string; initials: string; role: Role; city: string }>
export type ProfileId = keyof typeof profiles
export type Profile = typeof profiles[ProfileId]
export function mayAct(profile: Profile, transaction: Transaction, command: Command) {
  if (profile.role === 'Supervisor') return true
  if (profile.role !== 'Store Officer') return false
  return profile.city === (command === 'receive' ? transaction.destination : transaction.location)
}
