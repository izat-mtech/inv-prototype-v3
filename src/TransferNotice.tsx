import { commands, kg, reference } from './inventory'
import type { Transaction } from './inventory'
import { mayAct } from './profiles'
import type { Profile } from './profiles'

export function getTransferReminders(data: Transaction[], profile: Profile) {
  if (profile.role !== 'Store Officer') return []
  return data.slice().reverse().flatMap(record => {
    if (record.kind !== 'transfer') return []
    const action = commands(record, profile.role).find(command =>
      (command === 'dispatch' || command === 'receive') && mayAct(profile, record, command))
    return action ? [{ record, action }] : []
  })
}

export function TransferNotice({ reminders, onDismiss }: {
  reminders: ReturnType<typeof getTransferReminders>; onDismiss: () => void
}) {
  const count = reminders.length
  const title = count ? count + (count === 1 ? ' transfer to confirm' : ' transfers to confirm') : ''
  return <div className="no-print">
    <p className="transfer-notice-announcement" role="status" aria-atomic="true">{title}</p>
    {count > 0 && <section className="transfer-notice" aria-label="Transfer confirmations">
      <div className="transfer-notice-heading">
        <h2>{title}</h2>
        <button className="text-button" type="button" aria-label="Dismiss transfer reminders" onClick={onDismiss}>Dismiss</button>
      </div>
      <ul>{reminders.map(({ record, action }) => {
        const dispatch = action === 'dispatch'
        const quantity = dispatch ? record.quantity : record.quantity - record.processed
        return <li key={record.id}>
          <div>
            <strong>{dispatch ? 'Dispatch to ' + record.destination : 'Receive from ' + record.location}</strong>
            <small>{reference(record)} · {kg(quantity)} {record.species}{dispatch ? ' to dispatch' : ' awaiting receipt'}</small>
          </div>
          <a className="secondary button-link" href={'#stock-transfer/' + record.id} aria-label={'Open transfer ' + reference(record)}>Open transfer →</a>
        </li>
      })}</ul>
    </section>}
  </div>
}
