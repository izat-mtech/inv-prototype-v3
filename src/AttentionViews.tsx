import { useState } from 'react'
import type { FormEvent } from 'react'
import { Drawer, Empty } from './components'
import { cityStock, expiryWindow, needsAction, stockAlerts } from './attention'
import { kg, locations, parseNonNegative, species } from './inventory'
import type { Rule } from './attention'
import type { Transaction } from './inventory'
import type { CountSheet } from './stocktake'
import type { Profile } from './profiles'

export function DashboardAttention({ data, sheets, city, rules, onRule }: {
  data: Transaction[]; sheets: CountSheet[]; city: string; rules: Rule[]; onRule?: (rule: Rule) => void
}) {
  const { minimums, expiry } = stockAlerts(data, rules, city)
  const actions = needsAction(data, sheets, city)
  const [editing, setEditing] = useState(false)
  return <div className="attention-grid">
    <section className="panel"><div className="panel-heading"><h2>Stock alerts <span className="count">{minimums.length + expiry.length}</span></h2>
      {onRule && <button className="text-button city-clear" onClick={() => setEditing(true)}>Edit minimums</button>}</div>
      {minimums.length + expiry.length ? <ul className="action-list">
        {minimums.map(row => <li key={row.city + row.fish}><div><strong>Low stock · {row.fish}</strong>
          <small>{row.city} · {kg(row.available)} available / {kg(row.minimum)} minimum</small></div>
          <a className="text-link" href={'#inventory?fish=' + encodeURIComponent(row.fish) + '&to=' + encodeURIComponent(row.city)}>Find stock →</a></li>)}
        {expiry.map(row => <li key={row.lot + row.location}><div><strong>{row.days < 0 ? 'Expired' : row.days === 0 ? 'Expires today' : 'Expires in ' + row.days + (row.days === 1 ? ' day' : ' days')} · {row.species}</strong>
          <small>{row.lot} · {row.location} · {kg(row.available)} available · {row.date}</small></div>
          <a className="text-link" href={'#inventory?city=' + encodeURIComponent(row.location) + '&batch=' + encodeURIComponent(row.lot)}>View batch →</a></li>)}
      </ul> : <Empty>No low-stock or expiry alerts in this view.</Empty>}
      <p className="panel-note">Expiry alerts cover batches with a recorded date within {expiryWindow} days or already past it.</p>
    </section>
    <section className="panel"><div className="panel-heading"><h2>Needs Action <span className="count">{actions.length}</span></h2></div>
      {actions.length ? <ul className="action-list">{actions.map(item => <li key={item.key}>
        <div><strong>{item.label}</strong><small>{item.note}</small></div>
        <a className="text-link" href={item.href}>Open →</a>
      </li>)}</ul> : <Empty>No exceptions need attention in this view.</Empty>}
    </section>
    {editing && onRule && <MinimumEditor city={city} rules={rules} onClose={() => setEditing(false)} onSave={onRule} />}
  </div>
}

function MinimumEditor({ city, rules, onClose, onSave }: {
  city: string; rules: Rule[]; onClose: () => void; onSave: (rule: Rule) => void
}) {
  const [location, setLocation] = useState(city || 'Miri')
  const [fish, setFish] = useState<string>(species[0])
  const [error, setError] = useState('')
  const minimum = rules.find(rule => rule.city === location && rule.fish === fish)?.minimum ?? 0
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = parseNonNegative(String(new FormData(event.currentTarget).get('minimum') ?? ''))
    if (value === undefined) { setError('Enter a non-negative weight in kg with up to three decimals.'); return }
    onSave({ city: location, fish, minimum: value })
    onClose()
  }
  return <Drawer title="Stock minimums" onClose={onClose}><form className="entry-form" onSubmit={save}>
    <div className="field-grid">
      <label>City<select value={location} onChange={e => setLocation(e.target.value)}>{locations.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Fish species<select value={fish} onChange={e => setFish(e.target.value)}>{species.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="wide">Minimum available stock (kg)<input key={location + fish} name="minimum" inputMode="decimal" defaultValue={minimum / 1000} required /></label>
    </div>
    <p className="hint">Set 0 to remove this minimum.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="button-row"><button className="primary" type="submit">Save minimum</button><button className="secondary" type="button" onClick={onClose}>Cancel</button></div>
  </form></Drawer>
}

export function CityLookup({ data, profile, rules, initialFish, initialDestination }: {
  data: Transaction[]; profile: Profile; rules: Rule[]; initialFish: string; initialDestination: string
}) {
  const [fish, setFish] = useState<string>(species.some(item => item === initialFish) ? initialFish : species[0])
  const [destination, setDestination] = useState(initialDestination)
  const rows = cityStock(data, fish)
  return <section className="panel city-lookup">
    <div className="panel-heading toolbar"><h2>Find stock by city</h2><div className="filters">
      <label className="compact-field">Fish species<select value={fish} onChange={e => setFish(e.target.value)}>{species.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="compact-field">Replenish city<select value={destination} onChange={e => setDestination(e.target.value)}>
        <option value="">Choose a destination</option>{locations.map(item => <option key={item}>{item}</option>)}</select></label>
    </div></div>
    <div className="lookup-grid">{rows.map(row => {
      const minimum = rules.find(rule => rule.city === row.city && rule.fish === fish)?.minimum ?? 0
      const eligible = destination && destination !== row.city && row.preferred
      const params = eligible ? new URLSearchParams({ city: row.city, to: destination, lot: row.preferred!, new: 'transfer' }) : undefined
      return <article key={row.city} className={destination === row.city ? 'lookup-target' : ''}>
        <span>{row.city}</span><strong>{kg(row.available)}</strong>
        <small>{minimum ? kg(minimum) + ' minimum' : 'Available to issue'}{minimum > row.available ? ' · Below minimum' : ''}</small>
        {params && profile.role === 'Store Officer' && (profile.city === row.city ?
          <a className="text-link" href={'#stock-transfer?' + params.toString()}>Start transfer →</a> : <small>Use the {row.city} officer to transfer</small>)}
      </article>
    })}</div>
  </section>
}
