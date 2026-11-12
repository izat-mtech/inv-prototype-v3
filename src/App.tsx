import { useEffect, useRef, useState } from 'react'
import { Dashboard, Inventory } from './StockViews'
import { TransactionDetail, TransactionPage } from './Transactions'
import { Reports } from './Reports'
import { TransferNotice } from './TransferNotice'
import { Approvals, AuditTrail } from './Oversight'
import { Stocktaking, StocktakeDetail } from './StocktakingView'
import { apply, kg, locations, reference, revise, submit } from './inventory'
import { captureCount, countRef, reviewCount, startCount, submitCount } from './stocktake'
import { auditEntries, loadWorkspace, persistWorkspace, resetWorkspace } from './workspace'
import type { Command, Entry, Kind, Result, Transaction } from './inventory'
import type { CountDecision } from './stocktake'
import type { Activity, RecordTarget } from './workspace'
import { mayAct, profiles } from './profiles'
import type { ProfileId } from './profiles'
import { validRule } from './attention'
import type { Rule } from './attention'
import './App.css'

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'inventory', label: 'Inventory', icon: 'stack' },
  { id: 'stock-receive', label: 'Stock Receive', icon: 'down' },
  { id: 'stock-issue', label: 'Stock Issue', icon: 'up' },
  { id: 'stock-transfer', label: 'Stock Transfer', icon: 'swap' },
  { id: 'spoilage', label: 'Spoilage', icon: 'warning' },
  { id: 'stocktaking', label: 'Stocktaking', icon: 'count-icon' },
  { id: 'approvals', label: 'Approvals', icon: 'check-icon' },
  { id: 'audit-trail', label: 'Audit Trail', icon: 'audit-icon' },
  { id: 'reports', label: 'Reports', icon: 'doc' },
] as const
type Tab = typeof tabs[number]['id']
const transactionTabs: Partial<Record<Tab, Kind>> = {
  'stock-receive': 'receive', 'stock-issue': 'issue', 'stock-transfer': 'transfer', spoilage: 'spoil',
}
const kindTab: Record<Kind, Tab> = {
  receive: 'stock-receive', issue: 'stock-issue', transfer: 'stock-transfer', adjust: 'stock-transfer',
  spoil: 'spoilage', dispose: 'spoilage',
}
function readRoute() {
  const [path, query] = window.location.hash.slice(1).split('?')
  const [name, id] = path.split('/')
  const tab: Tab = tabs.find(item => item.id === name)?.id ?? 'dashboard'
  const params = new URLSearchParams(query)
  const city = params.get('city') ?? ''
  const to = params.get('to') ?? ''
  const destination = locations.some(item => item === to) ? to : ''
  const fish = params.get('fish') ?? ''
  const batch = params.get('batch') ?? ''
  const view = params.get('view') ?? ''
  const lot = params.get('lot') ?? ''
  const transferDraft = tab === 'stock-transfer' && params.get('new') === 'transfer' && lot && destination ? { lot, destination } : undefined
  const location = locations.some(item => item === city) ? city : ''
  const selected: RecordTarget | undefined = /^\d+$/.test(id ?? '') ?
    { type: tab === 'stocktaking' ? 'count' : 'transaction', id: Number(id) } : undefined
  return { tab, location, selected, destination, fish, batch, view, transferDraft }
}

export default function App() {
  const [workspace, setWorkspace] = useState(loadWorkspace)
  const [profileId, setProfileId] = useState<ProfileId>('kuching')
  const [route, setRoute] = useState(readRoute)
  const [dashboardCity, setDashboardCity] = useState(() => readRoute().location)
  const [selected, setSelected] = useState<RecordTarget | undefined>(() => readRoute().selected)
  const [message, setMessage] = useState('')
  const [transferNoticeDismissed, setTransferNoticeDismissed] = useState(false)
  const profileMenu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const onHash = () => {
      const next = readRoute()
      setRoute(next)
      setSelected(next.selected)
      if (next.tab === 'dashboard' && next.location) setDashboardCity(next.location)
      setMessage('')
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    onHash()
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => persistWorkspace(workspace), [workspace])

  const { data, sheets } = workspace
  const { tab, location } = route
  const scopeKey = [tab, location, route.fish, route.destination, route.batch, route.view, route.transferDraft?.lot].join(':')
  const audit = auditEntries(workspace)
  const profile = profiles[profileId]
  const role = profile.role
  const screen = tabs.find(item => item.id === tab)!
  const kind = transactionTabs[tab]
  const selectedTransaction = selected?.type === 'transaction' ? data.find(t => t.id === selected.id) : undefined
  const selectedCount = selected?.type === 'count' ? sheets.find(sheet => sheet.id === selected.id) : undefined

  function commit(result: Result, note: string, open = false) {
    if (!result.ok) return result.error
    setWorkspace(current => ({ ...current, data: result.data }))
    setMessage(note)
    if (open) setSelected({ type: 'transaction', id: result.id })
    return undefined
  }
  function create(entry: Entry) {
    if (entry.location !== profile.city) return 'Use the Store Officer assigned to ' + entry.location + '.'
    const result = submit(data, role, entry)
    return commit(result, result.ok ? reference(result.data[result.data.length - 1]) + ' submitted for review.' : '', true)
  }
  function action(id: number, command: Command, note: string, quantity: number) {
    const transaction = data.find(t => t.id === id)
    if (!transaction || !mayAct(profile, transaction, command)) return 'This action is unavailable for the active profile.'
    const result = apply(data, role, id, command, note, quantity)
    const updated = result.ok ? result.data.find(t => t.id === id) : undefined
    return commit(result, updated ? reference(updated) + ' · ' + updated.events.at(-1)?.action + '.' : '')
  }
  function correction(id: number, entry: Entry, note: string) {
    if (profile.city !== entry.location || data.find(t => t.id === id)?.location !== profile.city) return 'Use the officer assigned to this record.'
    return commit(revise(data, role, id, entry, note), 'Correction submitted for review.')
  }
  function commitCount(result: ReturnType<typeof startCount>, message: string, open = false) {
    if (!result.ok) return result.error
    setWorkspace(current => ({ ...current, data: result.data, sheets: result.sheets }))
    setMessage(countRef(result.id) + ' · ' + message)
    if (open) setSelected({ type: 'count', id: result.id })
    return undefined
  }
  function review(id: number, decision: CountDecision, note: string) {
    return commitCount(reviewCount(sheets, data, role, id, decision, note),
      decision === 'approve' ? 'Stocktake reconciled.' : decision === 'return' ? 'Returned for recount.' : 'Stocktake rejected.')
  }
  function log(action: string, note?: string, location?: string) {
    const event: Activity = { at: new Date().toISOString(), role, action, note, location }
    setWorkspace(current => ({ ...current, activity: [...current.activity, event] }))
  }
  function close() {
    setSelected(undefined)
    if (route.selected) {
      window.history.replaceState(null, '', '#' + tab + (location ? '?city=' + encodeURIComponent(location) : ''))
      setRoute({ ...route, selected: undefined })
    }
  }
  function switchProfile(next: ProfileId) {
    if (next !== profileId) log('Switched demo profile', profile.name + ' → ' + profiles[next].name, profile.city || profiles[next].city || undefined)
    setProfileId(next)
    setTransferNoticeDismissed(false)
    setMessage('')
    window.scrollTo(0, 0)
    close()
    if (profileMenu.current) profileMenu.current.open = false
  }
  function reset() {
    if (!window.confirm('Reset the fictional transactions and counts in this browser?')) return
    setWorkspace(resetWorkspace(role))
    setProfileId('kuching')
    setTransferNoticeDismissed(false)
    close()
    setMessage('Demo data reset.')
    if (profileMenu.current) profileMenu.current.open = false
  }
  function saveRule(rule: Rule) {
    if (role !== 'Supervisor' || !validRule(rule)) return
    setWorkspace(current => {
      const rules = current.rules.filter(existing => existing.city !== rule.city || existing.fish !== rule.fish)
      return { ...current, rules: rule.minimum > 0 ? [...rules, rule] : rules }
    })
    log('Stock minimum updated', rule.fish + ' · ' + kg(rule.minimum), rule.city)
    setMessage('Stock minimum saved.')
  }
  const open = (record: Transaction) => setSelected({ type: 'transaction', id: record.id })
  const openCount = (id: number) => setSelected({ type: 'count', id })
  const stockPending = sheets.filter(sheet => sheet.status === 'Pending review').length
  const txnPending = data.filter(t => t.status === 'Pending review')

  return <div className="app">
    <aside className="sidebar">
      <details className="profile" ref={profileMenu}>
        <summary aria-label={'Active profile: ' + role + (profile.city ? ' · ' + profile.city : '')}>
          <span className="avatar" aria-hidden="true">{profile.initials}</span>
          <span className="profile-name"><strong>{profile.name}</strong><small>{role}{profile.city && ' · ' + profile.city}</small></span>
          <span className="chevron" aria-hidden="true">⌄</span>
        </summary>
        <div className="profile-options">
          {(Object.keys(profiles) as ProfileId[]).map(option => <button type="button" key={option}
            aria-pressed={option === profileId} onClick={() => switchProfile(option)}>{profiles[option].role}{profiles[option].city && ' · ' + profiles[option].city}</button>)}
          <button type="button" className="reset" onClick={reset}>Reset demo data</button>
        </div>
      </details>
      <nav aria-label="Main navigation">
        {tabs.map(item => {
          const count = item.id === 'approvals' ? txnPending.length + stockPending : item.id === 'stocktaking' ? stockPending :
            txnPending.filter(t => kindTab[t.kind] === item.id).length
          return <a key={item.id} href={'#' + item.id} aria-current={tab === item.id ? 'page' : undefined}>
            <span className={'nav-icon ' + item.icon} aria-hidden="true" />{item.label}
            {count > 0 && role === 'Supervisor' && <span className="nav-count" aria-label={count + ' pending'}>{count}</span>}
          </a>
        })}
      </nav>
      <div className="sidebar-footer">Fish Inventory<span>Fictional demo records</span></div>
    </aside>
    <main>
      <div className="topbar"><span>Fish Inventory <span className="crumb">/ {screen.label}</span></span><span className="demo-tag"><i />Prototype</span></div>
      <div className="content">
        <div className="notice no-print" role="status">{message}</div>
        <TransferNotice data={data} profile={profile} dismissed={transferNoticeDismissed} onDismiss={() => setTransferNoticeDismissed(true)} />
        {tab === 'dashboard' && <Dashboard data={data} sheets={sheets} location={dashboardCity} rules={workspace.rules} onRule={role === 'Supervisor' ? saveRule : undefined}
          onLocation={setDashboardCity} onOpen={open} />}
        {tab === 'inventory' && <Inventory key={scopeKey} initialLocation={location} initialFish={route.fish} initialBatch={route.batch} destination={route.destination}
          profile={profile} rules={workspace.rules} data={data} onOpen={open} onPrintLabel={batch => log('Opened batch label print preview', batch.lot, batch.location)} />}
        {kind && <TransactionPage key={scopeKey} initialKind={kind} initialLocation={location} initialView={route.view}
          transferDraft={location === profile.city ? route.transferDraft : undefined} profile={profile} data={data} onOpen={open} onCreate={create} />}
        {tab === 'stocktaking' && <Stocktaking key={scopeKey} initialLocation={location} sheets={sheets} role={role} officerCity={profile.city} onOpen={openCount}
          onStart={(city, note) => city !== profile.city ? 'Use the Store Officer assigned to ' + city + '.' :
            commitCount(startCount(sheets, data, role, city, note), 'Snapshot captured.', true)} />}
        {tab === 'approvals' && <Approvals key={scopeKey} initialLocation={location} workspace={workspace} role={role} onOpen={setSelected} />}
        {tab === 'audit-trail' && <AuditTrail key={scopeKey} initialLocation={location} entries={audit} onOpen={setSelected} />}
        {tab === 'reports' && <Reports key={scopeKey} initialLocation={location} data={data} audit={audit} onOpen={setSelected}
          onExport={(report, city, format) => log(format === 'CSV' ? 'Downloaded CSV report' : 'Opened print preview', report + ' report', city || undefined)} />}
      </div>
    </main>
    {selectedTransaction && <TransactionDetail key={'transaction-' + selectedTransaction.id} t={selectedTransaction} data={data}
      profile={profile} workflowHref={tab !== kindTab[selectedTransaction.kind] && !(tab === 'approvals' && selectedTransaction.status === 'Pending review') ?
        '#' + kindTab[selectedTransaction.kind] + '/' + selectedTransaction.id : undefined}
      onClose={close} onCommand={action} onRevise={correction}
      onPrint={() => log('Opened transaction slip print preview', reference(selectedTransaction), selectedTransaction.location)} />}
    {selectedCount && <StocktakeDetail key={'count-' + selectedCount.id} sheet={selectedCount} role={role} officerCity={profile.city}
      workflowHref={tab !== 'stocktaking' && !(tab === 'approvals' && selectedCount.status === 'Pending review') ? '#stocktaking/' + selectedCount.id : undefined}
      onRecord={(lot, actual) => profile.city !== selectedCount.location ? 'Use the assigned Store Officer.' :
        commitCount(captureCount(sheets, data, role, selectedCount.id, lot, actual), 'Count recorded.')}
      onSubmit={() => profile.city !== selectedCount.location ? 'Use the assigned Store Officer.' :
        commitCount(submitCount(sheets, data, role, selectedCount.id), 'Submitted for review.')}
      onReview={(decision, note) => review(selectedCount.id, decision, note)} onClose={close} />}
  </div>
}
