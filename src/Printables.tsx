import { useState } from 'react'
import { toString as qrSvg } from 'qrcode'
import { eventTime, kg, labels, receiptInspection, reference } from './inventory'
import type { Position, Transaction } from './inventory'

const slipNames = { receive: 'Goods received slip', issue: 'Stock issue slip', transfer: 'Stock transfer note', adjust: 'Adjustment record', spoil: 'Spoilage record', dispose: 'Disposal record' }

export function TransactionSlip({ t }: { t: Transaction }) {
  const split = t.kind === 'receive' ? receiptInspection(t) : undefined
  return <section className="print-document" aria-hidden="true">
    <p>Fish Inventory · Prototype</p><h1>{slipNames[t.kind]}</h1><h2>{reference(t)} · {t.status}</h2>
    <dl className="details-grid">
      <div><dt>Batch</dt><dd>{t.lot} · {t.species}</dd></div>
      <div><dt>Date</dt><dd>{t.date}</dd></div>
      <div><dt>Location</dt><dd>{t.location}{t.destination && ' → ' + t.destination}</dd></div>
      <div><dt>{labels[t.kind]} quantity</dt><dd>{kg(t.quantity)}</dd></div>
      {t.kind === 'transfer' && <div><dt>Received at destination</dt><dd>{kg(t.processed)}</dd></div>}
      {t.kind === 'dispose' && <div><dt>Disposal confirmed</dt><dd>{kg(t.processed)}</dd></div>}
      {split && <div className="wide"><dt>Inspection split</dt><dd>{kg(split.accepted)} accepted · {kg(split.held)} held · {kg(split.rejected)} rejected</dd></div>}
      {t.party && <div><dt>{t.kind === 'receive' ? 'Supplier' : 'Recipient'}</dt><dd>{t.party}</dd></div>}
      {t.documentRef && <div><dt>Delivery reference</dt><dd>{t.documentRef}</dd></div>}
      {t.expiry && <div><dt>Expiry</dt><dd>{t.expiry}</dd></div>}
      {t.reason && <div><dt>Reason</dt><dd>{t.reason}</dd></div>}
      {t.notes && <div className="wide"><dt>Notes</dt><dd>{t.notes}</dd></div>}
    </dl>
    <h2>Transaction history</h2>
    <table><thead><tr><th>Action</th><th>Profile</th><th>Time</th><th>Note</th></tr></thead>
      <tbody>{t.events.map((event, i) => <tr key={i}><td>{event.action}</td><td>{event.role}</td><td>{eventTime(event)}</td><td>{event.note || '—'}</td></tr>)}</tbody>
    </table>
  </section>
}

export function BatchLabel({ batch, expiry, onPrint }: { batch: Position; expiry?: string; onPrint: () => void }) {
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const href = new URL(window.location.pathname, window.location.origin)
  href.hash = 'inventory?' + new URLSearchParams({ city: batch.location, batch: batch.lot }).toString()
  async function generate() {
    setLoading(true)
    setError('')
    try {
      const svg = await qrSvg(href.toString(), { type: 'svg', errorCorrectionLevel: 'M', margin: 3 })
      setQr('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg))
    } catch { setError('The QR label could not be generated. Try again.') }
    finally { setLoading(false) }
  }
  const label = qr ? <div className="batch-label"><img src={qr} alt={'QR code for ' + batch.lot + ' in ' + batch.location} width={110} height={110} />
    <div><strong>{batch.lot}</strong><p>{batch.species}</p><p>{batch.location}{expiry ? ' · Expiry ' + expiry : ''}</p></div></div> : null
  return <div className="label-controls">
    <div className="button-row">
      {!qr && <button className="secondary" disabled={loading} onClick={generate}>{loading ? 'Generating…' : 'Show QR label'}</button>}
      {qr && <button className="secondary" onClick={() => { onPrint(); window.print() }}>Print batch label</button>}
      {qr && <a className="text-link" href={href.toString()}>Batch link ↗</a>}
    </div>
    {label}
    {qr && <p className="hint">The link opens this batch if its record is available in the browser opening it.</p>}
    {label && <section className="print-document" aria-hidden="true">{label}</section>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>
}
