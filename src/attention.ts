import { calendarDate, inspectionOutstanding, inventory, kg, labels, locations, reference, species } from './inventory'
import { countRef, variance } from './stocktake'
import type { Transaction } from './inventory'
import type { CountSheet } from './stocktake'

export type Rule = { city: string; fish: string; minimum: number }
export const defaultRules: Rule[] = [{ city: 'Miri', fish: 'Asian seabass', minimum: 30_000 }]
export const expiryWindow = 3

export function stockAlerts(data: Transaction[], rules: Rule[], city = '', today = calendarDate()) {
  const positions = inventory(data).filter(row => !city || row.location === city)
  const minimums = rules.filter(rule => (!city || city === rule.city) && rule.minimum > 0)
    .map(rule => ({ ...rule, available: positions.filter(row => row.location === rule.city && row.species === rule.fish).reduce((sum, row) => sum + row.available, 0) }))
    .filter(rule => rule.available < rule.minimum)
  const expiryByLot = new Map(data.filter(t => t.kind === 'receive' && t.expiry).map(t => [t.lot, t.expiry!]))
  const expiry = positions.filter(p => p.available > 0 && expiryByLot.has(p.lot)).map(p => {
    const date = expiryByLot.get(p.lot)!
    return { ...p, date, days: Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000) }
  }).filter(row => row.days <= expiryWindow).sort((a, b) => a.days - b.days)
  return { minimums, expiry }
}

export const cityStock = (data: Transaction[], fish: string) => {
  const rows = inventory(data).filter(row => row.species === fish)
  return locations.map(city => {
    const batches = rows.filter(row => row.location === city)
    const available = batches.reduce((sum, row) => sum + row.available, 0)
    const preferred = batches.filter(row => row.available > 0).sort((a, b) => b.available - a.available)[0]?.lot
    return { city, available, preferred }
  })
}

type Action = { key: string; label: string; note: string; href: string }
const tabFor = { receive: 'stock-receive', issue: 'stock-issue', transfer: 'stock-transfer', adjust: 'stock-transfer', spoil: 'spoilage', dispose: 'spoilage' }

export function needsAction(data: Transaction[], sheets: CountSheet[], city: string, now = Date.now()): Action[] {
  const actions: Action[] = []
  for (const t of data) {
    if (city && ![t.location, t.destination].includes(city)) continue
    const href = '#' + tabFor[t.kind] + '/' + t.id
    if (t.status === 'Pending review' && now - Date.parse(t.events.at(-1)!.at) >= 86_400_000) {
      actions.push({ key: 'review-' + t.id, label: labels[t.kind] + ' awaiting review', note: reference(t) + ' · ' + t.location + ' · 24 hours or more', href })
    }
    if (inspectionOutstanding(t) > 0) {
      actions.push({ key: 'inspection-' + t.id, label: 'Receipt held for inspection',
        note: reference(t) + ' · ' + t.location + ' · ' + kg(inspectionOutstanding(t)), href })
    }
    if (t.kind === 'transfer' && t.status === 'Partially received') {
      actions.push({ key: 'transfer-' + t.id, label: 'Transfer partially received',
        note: reference(t) + ' · ' + t.location + ' → ' + t.destination + ' · ' + kg(t.quantity - t.processed) + ' outstanding', href })
    }
  }
  for (const row of inventory(data)) {
    if ((city && row.location !== city) || row.spoiled <= 0) continue
    actions.push({ key: 'dispose-' + row.lot + row.location, label: 'Spoilage awaiting disposal',
      note: row.lot + ' · ' + row.location + ' · ' + kg(row.spoiled), href: '#spoilage?city=' + encodeURIComponent(row.location) + '&view=dispose' })
  }
  for (const sheet of sheets) {
    if ((city && sheet.location !== city) || sheet.status !== 'Pending review') continue
    const hasVariance = sheet.lines.some(line => variance(line))
    const overdue = now - Date.parse(sheet.events.at(-1)!.at) >= 86_400_000
    if (hasVariance || overdue) actions.push({ key: 'count-' + sheet.id, label: hasVariance ? 'Stocktake variance awaiting review' : 'Stocktake awaiting review',
      note: countRef(sheet.id) + ' · ' + sheet.location + (overdue ? ' · 24 hours or more' : ''), href: '#stocktaking/' + sheet.id })
  }
  return actions
}

export const validRule = (rule: Rule) => locations.some(city => city === rule.city) &&
  species.some(fish => fish === rule.fish) && Number.isSafeInteger(rule.minimum) && rule.minimum >= 0 && rule.minimum <= 100_000_000
