import React, { useState, useEffect } from 'react';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { formatINR, roundTo2 } from '../utils/calculator';
import {
  Plus, CreditCard, ChevronRight, Edit3, Trash2, X, Check, AlertCircle,
  Calendar, TrendingUp, ShoppingBag, AlertTriangle
} from 'lucide-react';

// ── CARD ISSUERS ─────────────────────────────────────────────────────────────
const ISSUERS = [
  'HDFC Bank', 'ICICI Bank', 'SBI Card', 'Axis Bank', 'Kotak Bank',
  'HSBC', 'Standard Chartered', 'Federal Bank', 'IDFC FIRST Bank',
  'RBL Bank', 'IndusInd Bank', 'AU Small Finance Bank', 'YES Bank',
  'American Express', 'OneCard', 'Amazon Pay ICICI', 'Flipkart Axis',
  'Airtel Axis', 'Other'
];

const NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex', 'Other'];

const SPEND_CATEGORIES = [
  'Food', 'Groceries', 'Fuel', 'Shopping', 'Electronics', 'Travel',
  'Bills', 'Entertainment', 'Medical', 'Dining', 'Online Shopping',
  'Subscriptions', 'Education', 'Home', 'Transport', 'Other'
];

// Card gradient based on network
const networkGradient = (network: string) => {
  switch (network) {
    case 'Visa':       return 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
    case 'Mastercard': return 'linear-gradient(135deg, #eb3349 0%, #f45c43 100%)';
    case 'RuPay':      return 'linear-gradient(135deg, #0f4c75 0%, #1b262c 100%)';
    case 'Amex':       return 'linear-gradient(135deg, #1a6b3c 0%, #2d9950 100%)';
    default:           return 'linear-gradient(135deg, #2c3e50 0%, #4a6572 100%)';
  }
};

const utilizationColor = (pct: number) => {
  if (pct >= 75) return '#EF4444';
  if (pct >= 50) return '#F59E0B';
  return '#10B981';
};

// ── CREDIT CARD FORM ─────────────────────────────────────────────────────────
interface CardFormProps {
  editId?: number | null;
  onClose: () => void;
  onSaved: () => void;
}

const CardForm: React.FC<CardFormProps> = ({ editId, onClose, onSaved }) => {
  const [issuer, setIssuer] = useState('HDFC Bank');
  const [cardName, setCardName] = useState('');
  const [nickname, setNickname] = useState('');
  const [network, setNetwork] = useState('Visa');
  const [last4, setLast4] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [outstanding, setOutstanding] = useState('');
  const [statementDate, setStatementDate] = useState('');
  const [dueDateDay, setDueDateDay] = useState('');
  const [minDue, setMinDue] = useState('');
  const [annualFee, setAnnualFee] = useState('');
  const [rewardType, setRewardType] = useState('');
  const [notes, setNotes] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [linkedAccountId, setLinkedAccountId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1); // 2-step form

  useEffect(() => {
    setAccounts(dbManager.runQuery('SELECT * FROM accounts WHERE is_active = 1;'));
    if (editId) {
      const rows = dbManager.runQuery('SELECT * FROM credit_cards WHERE id = ?;', [editId]);
      if (rows.length) {
        const c = rows[0];
        setIssuer(c.issuer); setCardName(c.card_name); setNickname(c.nickname || '');
        setNetwork(c.network || 'Visa'); setLast4(c.last4);
        setCreditLimit(String(c.credit_limit || '')); setOutstanding(String(c.current_outstanding || ''));
        setStatementDate(String(c.statement_date || '')); setDueDateDay(String(c.due_date_day || ''));
        setMinDue(String(c.min_due || '')); setAnnualFee(String(c.annual_fee || ''));
        setRewardType(c.reward_type || ''); setNotes(c.notes || '');
        setLinkedAccountId(c.linked_account_id ? String(c.linked_account_id) : '');
      }
    }
  }, [editId]);

  const handleSave = async () => {
    if (!last4 || last4.length !== 4) { setError('Enter valid last 4 digits'); return; }
    if (!creditLimit || parseFloat(creditLimit) <= 0) { setError('Enter valid credit limit'); return; }
    try {
      const params = [
        issuer, cardName.trim() || issuer, nickname.trim() || null,
        network, last4, parseFloat(creditLimit) || 0,
        parseFloat(outstanding) || 0, parseInt(statementDate) || null,
        parseInt(dueDateDay) || null, parseFloat(minDue) || 0,
        parseFloat(annualFee) || 0, rewardType.trim() || null,
        linkedAccountId ? Number(linkedAccountId) : null, notes.trim() || null
      ];
      if (editId) {
        await dbManager.executeSql(
          `UPDATE credit_cards SET issuer=?,card_name=?,nickname=?,network=?,last4=?,credit_limit=?,current_outstanding=?,statement_date=?,due_date_day=?,min_due=?,annual_fee=?,reward_type=?,linked_account_id=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?;`,
          [...params, editId]
        );
      } else {
        await dbManager.executeSql(
          `INSERT INTO credit_cards (issuer,card_name,nickname,network,last4,credit_limit,current_outstanding,statement_date,due_date_day,min_due,annual_fee,reward_type,linked_account_id,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
          params
        );
      }
      onSaved();
    } catch (e) { console.error(e); setError('Failed to save card'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale" onClick={e => e.stopPropagation()} style={{ maxHeight: '92dvh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="card-title" style={{ margin: 0 }}>{editId ? 'Edit Card' : 'Add Credit Card'}</h3>
          <button className="btn btn-secondary btn-circle" onClick={onClose} style={{ width: 32, height: 32 }}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && <div className="form-error"><AlertCircle size={14} />{error}</div>}

          {/* Step tabs */}
          <div style={{ display: 'flex', background: 'var(--bg-primary)', borderRadius: 10, padding: 3, gap: 2 }}>
            {['Card Info', 'Limits & Dates'].map((s, i) => (
              <button key={s} onClick={() => setStep(i + 1)}
                style={{ flex: 1, padding: '0.4rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: step === i + 1 ? 'var(--bg-secondary)' : 'transparent', color: step === i + 1 ? 'var(--primary)' : 'var(--text-secondary)', boxShadow: step === i + 1 ? 'var(--shadow-sm)' : 'none' }}>
                {s}
              </button>
            ))}
          </div>

          {step === 1 && <>
            <div className="form-group">
              <label>Bank / Issuer</label>
              <select className="form-control" value={issuer} onChange={e => setIssuer(e.target.value)}>
                {ISSUERS.map(i => <option key={i}>{i}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Card Name (optional)</label>
              <input className="form-control" value={cardName} onChange={e => setCardName(e.target.value)} placeholder="e.g. Millennia, Cashback, SimplyCLICK" />
            </div>

            <div className="form-group">
              <label>Nickname (optional)</label>
              <input className="form-control" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="e.g. My HDFC Card" />
            </div>

            <div className="form-group">
              <label>Network</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {NETWORKS.map(n => (
                  <button key={n} onClick={() => setNetwork(n)}
                    style={{ flex: 1, padding: '0.35rem 0.1rem', borderRadius: 8, border: `1.5px solid ${network === n ? 'var(--primary)' : 'var(--border)'}`, background: network === n ? '#EEF2FF' : 'var(--bg-secondary)', color: network === n ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Last 4 Digits *</label>
              <input className="form-control" value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" maxLength={4} inputMode="numeric" style={{ letterSpacing: '0.3em', fontSize: 18, fontWeight: 700 }} />
            </div>

            <div className="form-group">
              <label>Default Payment Account (optional)</label>
              <select className="form-control" value={linkedAccountId} onChange={e => setLinkedAccountId(e.target.value)}>
                <option value="">None</option>
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
              </select>
            </div>
          </>}

          {step === 2 && <>
            <div className="form-group">
              <label>Credit Limit (₹) *</label>
              <input className="form-control" type="number" inputMode="decimal" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="e.g. 100000" />
            </div>

            <div className="form-group">
              <label>Current Outstanding (₹)</label>
              <input className="form-control" type="number" inputMode="decimal" value={outstanding} onChange={e => setOutstanding(e.target.value)} placeholder="0" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Statement Date</label>
                <input className="form-control" type="number" inputMode="numeric" value={statementDate} onChange={e => setStatementDate(e.target.value)} placeholder="Day (1-31)" min={1} max={31} />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input className="form-control" type="number" inputMode="numeric" value={dueDateDay} onChange={e => setDueDateDay(e.target.value)} placeholder="Day (1-31)" min={1} max={31} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Minimum Due (₹)</label>
                <input className="form-control" type="number" inputMode="decimal" value={minDue} onChange={e => setMinDue(e.target.value)} placeholder="0" />
              </div>
              <div className="form-group">
                <label>Annual Fee (₹)</label>
                <input className="form-control" type="number" inputMode="decimal" value={annualFee} onChange={e => setAnnualFee(e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="form-group">
              <label>Reward Type (optional)</label>
              <input className="form-control" value={rewardType} onChange={e => setRewardType(e.target.value)} placeholder="e.g. Cashback 1.5%, 5x Points" />
            </div>

            <div className="form-group">
              <label>Notes (optional)</label>
              <input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
            </div>
          </>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={step === 1 ? onClose : () => setStep(1)}>
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step === 1
            ? <button className="btn btn-primary" onClick={() => setStep(2)}>Next →</button>
            : <button className="btn btn-primary" onClick={handleSave}><Check size={14} /> Save Card</button>
          }
        </div>
      </div>
    </div>
  );
};

// ── CREDIT CARD SPEND FORM ────────────────────────────────────────────────────
interface SpendFormProps {
  cardId: number;
  onClose: () => void;
  onSaved: () => void;
}

const SpendForm: React.FC<SpendFormProps> = ({ cardId, onClose, onSaved }) => {
  const [type, setType] = useState<'card_spend' | 'refund' | 'card_payment'>('card_spend');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('Shopping');
  const [txnDate, setTxnDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    try {
      await dbManager.executeSql(
        `INSERT INTO transactions (type, amount, merchant, category, txn_date, credit_card_id, source, status) VALUES (?,?,?,?,?,?,'manual','confirmed');`,
        [type, amt, merchant.trim() || merchant, category, txnDate, cardId]
      );
      // Update card outstanding
      const card = dbManager.runQuery('SELECT * FROM credit_cards WHERE id = ?;', [cardId]);
      if (card.length) {
        let newOutstanding = card[0].current_outstanding;
        if (type === 'card_spend') newOutstanding += amt;
        else if (type === 'refund') newOutstanding = Math.max(0, newOutstanding - amt);
        await dbManager.executeSql(
          'UPDATE credit_cards SET current_outstanding = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;',
          [roundTo2(newOutstanding), cardId]
        );
      }
      onSaved();
    } catch (e) { setError('Failed to save'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="card-title" style={{ margin: 0 }}>Add Spend</h3>
          <button className="btn btn-secondary btn-circle" onClick={onClose} style={{ width: 32, height: 32 }}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && <div className="form-error"><AlertCircle size={14} />{error}</div>}
          <div className="form-group">
            <label>Type</label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[
                { value: 'card_spend', label: 'Spend', color: '#EF4444' },
                { value: 'refund', label: 'Refund', color: '#10B981' },
              ].map(t => (
                <button key={t.value} onClick={() => setType(t.value as any)}
                  style={{ flex: 1, padding: '0.4rem', borderRadius: 10, border: `1.5px solid ${type === t.value ? t.color : 'var(--border)'}`, background: type === t.value ? `${t.color}15` : 'var(--bg-secondary)', color: type === t.value ? t.color : 'var(--text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Amount (₹) *</label>
            <input className="form-control" type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={{ fontSize: 22, fontWeight: 700 }} />
          </div>
          <div className="form-group">
            <label>Merchant / Description</label>
            <input className="form-control" value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="e.g. Amazon, Swiggy, Zomato" />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select className="form-control" value={category} onChange={e => setCategory(e.target.value)}>
              {SPEND_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Date</label>
            <input className="form-control" type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Notes (optional)</label>
            <input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}><Check size={14} /> Add</button>
        </div>
      </div>
    </div>
  );
};

// ── CARD DETAIL SCREEN ────────────────────────────────────────────────────────
interface CardDetailProps {
  cardId: number;
  onBack: () => void;
}

const CardDetail: React.FC<CardDetailProps> = ({ cardId, onBack }) => {
  const { refreshTrigger, triggerRefresh } = useDatabase();
  const [card, setCard] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showSpend, setShowSpend] = useState(false);
  const [showEditCard, setShowEditCard] = useState(false);

  useEffect(() => { loadData(); }, [refreshTrigger]);

  const loadData = () => {
    const cards = dbManager.runQuery('SELECT * FROM credit_cards WHERE id = ?;', [cardId]);
    if (cards.length) setCard(cards[0]);
    const txns = dbManager.runQuery(
      `SELECT * FROM transactions WHERE credit_card_id = ? AND status = 'confirmed' ORDER BY txn_date DESC, created_at DESC;`,
      [cardId]
    );
    setTransactions(txns);
  };

  if (!card) return null;

  const utilizationPct = card.credit_limit > 0 ? roundTo2((card.current_outstanding / card.credit_limit) * 100) : 0;
  const availableLimit = roundTo2(card.credit_limit - card.current_outstanding);
  const totalSpend = transactions.filter(t => t.type === 'card_spend').reduce((s: number, t: any) => s + t.amount, 0);
  const totalRefunds = transactions.filter(t => t.type === 'refund').reduce((s: number, t: any) => s + t.amount, 0);

  const today = new Date();
  let nextDueDate = '';
  if (card.due_date_day) {
    const d = new Date(today.getFullYear(), today.getMonth(), card.due_date_day);
    if (d < today) d.setMonth(d.getMonth() + 1);
    nextDueDate = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', paddingBottom: '5.5rem' }}>
      {/* Card Visual */}
      <div style={{ background: networkGradient(card.network), padding: 'calc(env(safe-area-inset-top, 0px) + 0.65rem) 1rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', top: -80, right: -60, pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button onClick={onBack} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18 }}>←</button>
          <div style={{ flex: 1, color: '#fff', fontSize: 17, fontWeight: 700 }}>{card.nickname || card.card_name}</div>
          <button onClick={() => setShowEditCard(true)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Edit3 size={14} />
          </button>
        </div>

        {/* Card visual */}
        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.12)', padding: '1rem 1.25rem', backdropFilter: 'blur(10px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Outstanding</div>
              <div style={{ color: '#fff', fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>{formatINR(card.current_outstanding)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: 600 }}>NETWORK</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{card.network}</div>
            </div>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, letterSpacing: '0.15em', fontFamily: 'monospace' }}>•••• •••• •••• {card.last4}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{card.issuer}</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{card.card_name}</div>
          </div>
        </div>

        {/* Quick Add */}
        <button onClick={() => setShowSpend(true)} style={{ width: '100%', marginTop: '0.75rem', padding: '0.6rem', borderRadius: 12, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Plus size={15} /> Add Spend
        </button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0 1rem', marginTop: '1rem' }}>
        {[
          { label: 'CREDIT LIMIT', value: formatINR(card.credit_limit), color: 'var(--text-primary)' },
          { label: 'AVAILABLE', value: formatINR(availableLimit), color: availableLimit < 0 ? '#EF4444' : '#059669' },
          { label: 'UTILIZATION', value: `${utilizationPct}%`, color: utilizationColor(utilizationPct) },
          { label: nextDueDate ? `DUE ${nextDueDate}` : 'DUE DATE', value: card.due_date_day ? `Day ${card.due_date_day}` : '—', color: 'var(--text-primary)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-secondary)', borderRadius: 14, border: '1px solid var(--border)', padding: '0.75rem', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color, letterSpacing: '-0.02em' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Utilization Bar */}
      <div style={{ margin: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: 14, border: '1px solid var(--border)', padding: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Credit Utilization</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: utilizationColor(utilizationPct) }}>{utilizationPct}%</span>
        </div>
        <div style={{ height: 6, background: 'var(--bg-primary)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, utilizationPct)}%`, height: '100%', background: utilizationColor(utilizationPct), borderRadius: 99, transition: 'width 0.5s ease' }} />
        </div>
        {utilizationPct >= 75 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, color: '#EF4444' }}>
            <AlertTriangle size={11} /> High utilization may affect credit score
          </div>
        )}
      </div>

      {/* Spending Summary */}
      <div style={{ margin: '0 1rem', background: 'var(--bg-secondary)', borderRadius: 14, border: '1px solid var(--border)', padding: '0.75rem' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>THIS MONTH</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Spend</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#EF4444' }}>{formatINR(totalSpend)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Refunds</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#059669' }}>+{formatINR(totalRefunds)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Net Spend</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>{formatINR(roundTo2(totalSpend - totalRefunds))}</div>
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div style={{ padding: '0.75rem 1rem 0' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Spending History</div>
        {transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: 14 }}>No transactions yet. Tap + Add Spend to start tracking.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {transactions.map((txn: any) => (
              <div key={txn.id} style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', padding: '0.7rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: txn.type === 'refund' ? '#ECFDF5' : '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {txn.type === 'refund' ? <TrendingUp size={14} color="#059669" /> : <ShoppingBag size={14} color="#EF4444" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{txn.merchant || txn.type}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{txn.category} · {txn.txn_date}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 14, color: txn.type === 'refund' ? '#059669' : '#EF4444', flexShrink: 0 }}>
                  {txn.type === 'refund' ? '+' : '-'}{formatINR(txn.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showSpend && <SpendForm cardId={cardId} onClose={() => setShowSpend(false)} onSaved={() => { setShowSpend(false); triggerRefresh(); }} />}
      {showEditCard && <CardForm editId={cardId} onClose={() => setShowEditCard(false)} onSaved={() => { setShowEditCard(false); triggerRefresh(); }} />}
    </div>
  );
};

// ── MAIN CREDIT CARDS SCREEN ──────────────────────────────────────────────────
export const CreditCards: React.FC = () => {
  const { refreshTrigger, triggerRefresh } = useDatabase();
  const [cards, setCards] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => { loadCards(); }, [refreshTrigger]);

  const loadCards = () => {
    try {
      const rows = dbManager.runQuery('SELECT * FROM credit_cards WHERE is_active = 1 ORDER BY created_at ASC;');
      setCards(rows);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this credit card?')) return;
    await dbManager.executeSql('UPDATE credit_cards SET is_active = 0 WHERE id = ?;', [id]);
    triggerRefresh();
  };

  if (detailId !== null) {
    return <CardDetail cardId={detailId} onBack={() => setDetailId(null)} />;
  }

  const totalOutstanding = cards.reduce((s, c) => s + (c.current_outstanding || 0), 0);
  const totalLimit = cards.reduce((s, c) => s + (c.credit_limit || 0), 0);
  const totalAvailable = totalLimit - totalOutstanding;
  const overallUtilization = totalLimit > 0 ? roundTo2((totalOutstanding / totalLimit) * 100) : 0;

  return (
    <div className="animate-fade" style={{ minHeight: '100dvh', background: 'var(--bg-primary)', paddingBottom: '5.5rem' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)', padding: 'calc(env(safe-area-inset-top, 0px) + 0.65rem) 1rem 2.5rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(165,180,252,0.2) 0%, transparent 70%)', top: -50, right: -30, pointerEvents: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total Outstanding</div>
            <div style={{ color: '#fff', fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 4 }}>{formatINR(totalOutstanding)}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 }}>
              {formatINR(totalAvailable)} available · {overallUtilization}% used
            </div>
          </div>
          <button onClick={() => { setEditId(null); setShowForm(true); }}
            style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Plus size={20} />
          </button>
        </div>
        <div style={{ marginTop: '0.75rem', position: 'relative', zIndex: 1 }}>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, overallUtilization)}%`, height: '100%', background: utilizationColor(overallUtilization), borderRadius: 99 }} />
          </div>
        </div>
      </div>

      <div style={{ padding: '0 1rem', marginTop: '-1rem' }}>
        {cards.length === 0 ? (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 18, border: '1px solid var(--border)', padding: '2rem 1.5rem', textAlign: 'center', marginTop: '0.5rem' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <CreditCard size={24} color="#4F46E5" />
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>No Credit Cards Yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Add your credit cards to track outstanding balances, spending, and due dates.</div>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Add Credit Card</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            {cards.map(card => {
              const utilPct = card.credit_limit > 0 ? roundTo2((card.current_outstanding / card.credit_limit) * 100) : 0;
              const avail = roundTo2(card.credit_limit - card.current_outstanding);
              const today = new Date();
              let dueText = '';
              if (card.due_date_day) {
                const d = new Date(today.getFullYear(), today.getMonth(), card.due_date_day);
                if (d < today) d.setMonth(d.getMonth() + 1);
                const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
                dueText = diff <= 0 ? 'Due Today!' : diff <= 7 ? `Due in ${diff}d` : `Due ${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })}`;
              }

              return (
                <div key={card.id} style={{ background: 'var(--bg-secondary)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => setDetailId(card.id)}>
                  {/* Card header strip */}
                  <div style={{ background: networkGradient(card.network), padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{card.issuer}</div>
                      <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{card.nickname || card.card_name}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>••••{card.last4}</div>
                      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>{card.network}</div>
                    </div>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Outstanding</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#EF4444', letterSpacing: '-0.03em' }}>{formatINR(card.current_outstanding)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Available</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: avail >= 0 ? '#059669' : '#EF4444' }}>{formatINR(avail)}</div>
                      </div>
                      <ChevronRight size={16} color="var(--text-muted)" />
                    </div>

                    {/* Utilization bar */}
                    <div style={{ height: 4, background: 'var(--bg-primary)', borderRadius: 99, overflow: 'hidden', marginBottom: 4 }}>
                      <div style={{ width: `${Math.min(100, utilPct)}%`, height: '100%', background: utilizationColor(utilPct), borderRadius: 99 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Limit: {formatINR(card.credit_limit)}</div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {dueText && (
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: dueText.includes('Today') || dueText.includes('in') ? '#EF4444' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Calendar size={9} />{dueText}
                          </span>
                        )}
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: utilizationColor(utilPct) }}>{utilPct}% used</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => setDetailId(card.id)}
                      style={{ flex: 1, padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
                      <ShoppingBag size={12} /> View Spending
                    </button>
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <button onClick={() => { setEditId(card.id); setShowForm(true); }}
                      style={{ flex: 1, padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <Edit3 size={12} /> Edit
                    </button>
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <button onClick={() => handleDelete(card.id)}
                      style={{ flex: 1, padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: '#EF4444' }}>
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <CardForm editId={editId} onClose={() => { setShowForm(false); setEditId(null); }} onSaved={() => { setShowForm(false); setEditId(null); triggerRefresh(); }} />
      )}
    </div>
  );
};
