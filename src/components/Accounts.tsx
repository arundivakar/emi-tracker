import React, { useState, useEffect } from 'react';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { formatINR } from '../utils/calculator';
import {
  Plus, Building2, Wallet, Banknote, PiggyBank, ChevronRight,
  TrendingUp, TrendingDown, Edit3, Trash2, X, Check, AlertCircle
} from 'lucide-react';

const ACCOUNT_TYPES = [
  { value: 'savings', label: 'Savings Account', icon: Building2 },
  { value: 'current', label: 'Current Account', icon: Building2 },
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'wallet', label: 'Wallet / UPI', icon: Wallet },
  { value: 'fd', label: 'Fixed Deposit', icon: PiggyBank },
  { value: 'other', label: 'Other', icon: Building2 },
];

const getAccountIcon = (type: string) => {
  const found = ACCOUNT_TYPES.find(t => t.value === type);
  return found ? found.icon : Building2;
};

const ACCOUNT_COLORS: Record<string, { bg: string; color: string }> = {
  savings: { bg: '#EEF2FF', color: '#4F46E5' },
  current: { bg: '#EFF6FF', color: '#2563EB' },
  cash:    { bg: '#ECFDF5', color: '#059669' },
  wallet:  { bg: '#FDF4FF', color: '#9333EA' },
  fd:      { bg: '#FFFBEB', color: '#D97706' },
  other:   { bg: '#F8FAFC', color: '#64748B' },
};

interface AccountFormProps {
  editId?: number | null;
  onClose: () => void;
  onSaved: () => void;
}

const AccountForm: React.FC<AccountFormProps> = ({ editId, onClose, onSaved }) => {
  const [accountName, setAccountName] = useState('');
  const [bank, setBank] = useState('');
  const [accountType, setAccountType] = useState('savings');
  const [last4, setLast4] = useState('');
  const [currentBalance, setCurrentBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editId) {
      const rows = dbManager.runQuery('SELECT * FROM accounts WHERE id = ?;', [editId]);
      if (rows.length > 0) {
        const a = rows[0];
        setAccountName(a.account_name);
        setBank(a.bank || '');
        setAccountType(a.account_type);
        setLast4(a.last4 || '');
        setCurrentBalance(String(a.current_balance));
        setNotes(a.notes || '');
      }
    }
  }, [editId]);

  const handleSave = async () => {
    if (!accountName.trim()) { setError('Account name is required'); return; }
    const bal = parseFloat(currentBalance) || 0;
    try {
      if (editId) {
        await dbManager.executeSql(
          `UPDATE accounts SET account_name=?, bank=?, account_type=?, last4=?, current_balance=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?;`,
          [accountName.trim(), bank.trim(), accountType, last4.trim(), bal, notes.trim(), editId]
        );
      } else {
        await dbManager.executeSql(
          `INSERT INTO accounts (account_name, bank, account_type, last4, current_balance, notes) VALUES (?,?,?,?,?,?);`,
          [accountName.trim(), bank.trim(), accountType, last4.trim(), bal, notes.trim()]
        );
      }
      onSaved();
    } catch (e) {
      console.error(e);
      setError('Failed to save account');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale" onClick={e => e.stopPropagation()} style={{ maxHeight: '90dvh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="card-title" style={{ margin: 0 }}>{editId ? 'Edit Account' : 'Add Account'}</h3>
          <button className="btn btn-secondary btn-circle" onClick={onClose} style={{ width: 32, height: 32 }}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && <div className="form-error"><AlertCircle size={14} />{error}</div>}

          <div className="form-group">
            <label>Account Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
              {ACCOUNT_TYPES.map(t => (
                <button key={t.value} onClick={() => setAccountType(t.value)}
                  style={{ padding: '0.5rem 0.25rem', borderRadius: 10, border: `2px solid ${accountType === t.value ? '#4F46E5' : 'var(--border)'}`, background: accountType === t.value ? '#EEF2FF' : 'var(--bg-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: accountType === t.value ? '#4F46E5' : 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <t.icon size={14} />
                  {t.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Account / Wallet Name *</label>
            <input className="form-control" value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="e.g. HDFC Savings, Cash, PhonePe" />
          </div>

          {accountType !== 'cash' && accountType !== 'wallet' && (
            <div className="form-group">
              <label>Bank Name</label>
              <input className="form-control" value={bank} onChange={e => setBank(e.target.value)} placeholder="e.g. HDFC Bank, SBI" />
            </div>
          )}

          <div className="form-group">
            <label>Current Balance (₹)</label>
            <input className="form-control" type="number" inputMode="decimal" value={currentBalance} onChange={e => setCurrentBalance(e.target.value)} placeholder="0" />
          </div>

          {accountType !== 'cash' && (
            <div className="form-group">
              <label>Last 4 digits (optional)</label>
              <input className="form-control" value={last4} onChange={e => setLast4(e.target.value.slice(0, 4))} placeholder="1234" maxLength={4} inputMode="numeric" />
            </div>
          )}

          <div className="form-group">
            <label>Notes (optional)</label>
            <input className="form-control" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}><Check size={14} /> Save Account</button>
        </div>
      </div>
    </div>
  );
};

interface AccountsProps {
  onNavigateToDetail?: (accountId: number) => void;
}

export const Accounts: React.FC<AccountsProps> = (_props) => {
  const { refreshTrigger, triggerRefresh } = useDatabase();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);

  useEffect(() => { loadAccounts(); }, [refreshTrigger]);

  const loadAccounts = () => {
    try {
      const rows = dbManager.runQuery('SELECT * FROM accounts WHERE is_active = 1 ORDER BY created_at ASC;');
      setAccounts(rows);
    } catch (e) { console.error(e); }
  };

  const totalBalance = accounts.reduce((s, a) => s + (a.current_balance || 0), 0);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this account? All linked transactions will be unlinked.')) return;
    await dbManager.executeSql('UPDATE accounts SET is_active = 0 WHERE id = ?;', [id]);
    triggerRefresh();
  };

  const getRecentTxns = (accountId: number) => {
    try {
      return dbManager.runQuery(
        `SELECT * FROM transactions WHERE (account_id = ? OR to_account_id = ?) AND status = 'confirmed' ORDER BY txn_date DESC, created_at DESC LIMIT 3;`,
        [accountId, accountId]
      );
    } catch { return []; }
  };

  if (selectedAccount !== null) {
    return <AccountDetail accountId={selectedAccount} onBack={() => setSelectedAccount(null)} />;
  }

  return (
    <div className="animate-fade" style={{ minHeight: '100dvh', background: 'var(--bg-primary)', paddingBottom: '5.5rem' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg, #064e3b 0%, #065f46 50%, #047857 100%)', padding: 'calc(env(safe-area-inset-top, 0px) + 0.65rem) 1rem 2.5rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,211,153,0.2) 0%, transparent 70%)', top: -60, right: -40, pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total Balance</div>
            <div style={{ color: '#fff', fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 4 }}>{formatINR(totalBalance)}</div>
          </div>
          <button onClick={() => { setEditId(null); setShowForm(true); }}
            style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Plus size={20} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', position: 'relative', zIndex: 1 }}>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: '0.2rem 0.6rem', color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 500 }}>
            {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div style={{ padding: '0 1rem', marginTop: '-1rem' }}>
        {accounts.length === 0 ? (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 18, border: '1px solid var(--border)', padding: '2rem 1.5rem', textAlign: 'center', marginTop: '0.5rem' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <Wallet size={24} color="#059669" />
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 6 }}>No Accounts Yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Add your bank accounts and cash to track your complete financial picture.</div>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Add First Account</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            {accounts.map(acc => {
              const colors = ACCOUNT_COLORS[acc.account_type] || ACCOUNT_COLORS.other;
              const AccIcon = getAccountIcon(acc.account_type);
              const recentTxns = getRecentTxns(acc.id);
              return (
                <div key={acc.id}
                  style={{ background: 'var(--bg-secondary)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => setSelectedAccount(acc.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1rem 0.75rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <AccIcon size={18} color={colors.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acc.account_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                        {acc.bank ? acc.bank : ACCOUNT_TYPES.find(t => t.value === acc.account_type)?.label}
                        {acc.last4 ? ` ••••${acc.last4}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 17, color: acc.current_balance >= 0 ? '#059669' : '#EF4444', letterSpacing: '-0.02em' }}>{formatINR(acc.current_balance)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>balance</div>
                    </div>
                    <ChevronRight size={16} color="var(--text-muted)" />
                  </div>
                  {recentTxns.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '0.5rem 1rem 0.6rem' }}>
                      {recentTxns.slice(0, 2).map((txn: any) => (
                        <div key={txn.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.15rem 0' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '65%' }}>{txn.merchant || txn.type}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: ['income', 'refund'].includes(txn.type) ? '#059669' : 'var(--text-primary)', flexShrink: 0 }}>
                            {['income', 'refund'].includes(txn.type) ? '+' : '-'}{formatINR(txn.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setEditId(acc.id); setShowForm(true); }}
                      style={{ flex: 1, padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <Edit3 size={12} /> Edit
                    </button>
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <button onClick={() => handleDelete(acc.id)}
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

      {showForm && <AccountForm editId={editId} onClose={() => { setShowForm(false); setEditId(null); }} onSaved={() => { setShowForm(false); setEditId(null); triggerRefresh(); }} />}
    </div>
  );
};

// ── ACCOUNT DETAIL SCREEN ────────────────────────────────────────────────────

const TXN_TYPES = [
  { value: 'income', label: 'Income', color: '#059669' },
  { value: 'expense', label: 'Expense', color: '#EF4444' },
  { value: 'transfer', label: 'Transfer', color: '#2563EB' },
  { value: 'card_payment', label: 'Card Payment', color: '#7C3AED' },
  { value: 'adjustment', label: 'Adjustment', color: '#D97706' },
];

const TXN_CATEGORIES = ['Salary', 'Business', 'Food', 'Groceries', 'Fuel', 'Shopping', 'Bills', 'Entertainment', 'Medical', 'Education', 'Transport', 'Travel', 'Other'];

interface AddTxnFormProps {
  accountId: number;
  onClose: () => void;
  onSaved: () => void;
}

const AddTxnForm: React.FC<AddTxnFormProps> = ({ accountId, onClose, onSaved }) => {
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('Other');
  const [txnDate, setTxnDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [allCards, setAllCards] = useState<any[]>([]);
  const [linkedCardId, setLinkedCardId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAllAccounts(dbManager.runQuery('SELECT * FROM accounts WHERE is_active = 1 ORDER BY account_name;'));
    setAllCards(dbManager.runQuery('SELECT * FROM credit_cards WHERE is_active = 1 ORDER BY card_name;'));
  }, []);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }

    try {
      const acct = dbManager.runQuery('SELECT * FROM accounts WHERE id = ?;', [accountId]);
      if (!acct.length) return;
      let newBalance = acct[0].current_balance;

      if (type === 'income' || type === 'refund') newBalance += amt;
      else if (type === 'expense' || type === 'card_payment' || type === 'transfer' || type === 'adjustment') newBalance -= amt;

      await dbManager.executeSql(
        `INSERT INTO transactions (type, amount, merchant, category, txn_date, account_id, to_account_id, credit_card_id, notes, source, status) VALUES (?,?,?,?,?,?,?,?,?,'manual','confirmed');`,
        [type, amt, merchant.trim() || type, category, txnDate, accountId,
          (type === 'transfer' || type === 'card_payment') && toAccountId ? Number(toAccountId) : null,
          type === 'card_payment' && linkedCardId ? Number(linkedCardId) : null,
          notes.trim()]
      );
      await dbManager.executeSql('UPDATE accounts SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;', [newBalance, accountId]);

      // If card payment: reduce card outstanding
      if (type === 'card_payment' && linkedCardId) {
        const card = dbManager.runQuery('SELECT * FROM credit_cards WHERE id = ?;', [Number(linkedCardId)]);
        if (card.length) {
          const newOutstanding = Math.max(0, card[0].current_outstanding - amt);
          await dbManager.executeSql('UPDATE credit_cards SET current_outstanding = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;', [newOutstanding, Number(linkedCardId)]);
        }
      }
      onSaved();
    } catch (e) { console.error(e); setError('Failed to save transaction'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-scale" onClick={e => e.stopPropagation()} style={{ maxHeight: '90dvh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="card-title" style={{ margin: 0 }}>Add Transaction</h3>
          <button className="btn btn-secondary btn-circle" onClick={onClose} style={{ width: 32, height: 32 }}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && <div className="form-error"><AlertCircle size={14} />{error}</div>}

          <div className="form-group">
            <label>Type</label>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {TXN_TYPES.map(t => (
                <button key={t.value} onClick={() => setType(t.value)}
                  style={{ padding: '0.3rem 0.7rem', borderRadius: 20, border: `1.5px solid ${type === t.value ? t.color : 'var(--border)'}`, background: type === t.value ? `${t.color}15` : 'var(--bg-secondary)', color: type === t.value ? t.color : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Amount (₹) *</label>
            <input className="form-control" type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>

          <div className="form-group">
            <label>{type === 'income' ? 'Source' : 'Merchant / Description'}</label>
            <input className="form-control" value={merchant} onChange={e => setMerchant(e.target.value)} placeholder={type === 'income' ? 'e.g. Salary, Freelance' : 'e.g. Amazon, Swiggy'} />
          </div>

          {type !== 'transfer' && type !== 'card_payment' && (
            <div className="form-group">
              <label>Category</label>
              <select className="form-control" value={category} onChange={e => setCategory(e.target.value)}>
                {TXN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {type === 'card_payment' && (
            <div className="form-group">
              <label>Credit Card *</label>
              <select className="form-control" value={linkedCardId} onChange={e => setLinkedCardId(e.target.value)}>
                <option value="">Select card...</option>
                {allCards.map((c: any) => <option key={c.id} value={c.id}>{c.nickname || c.card_name} ••••{c.last4}</option>)}
              </select>
            </div>
          )}

          {type === 'transfer' && (
            <div className="form-group">
              <label>Transfer To Account</label>
              <select className="form-control" value={toAccountId} onChange={e => setToAccountId(e.target.value)}>
                <option value="">Select account...</option>
                {allAccounts.filter((a: any) => a.id !== accountId).map((a: any) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
              </select>
            </div>
          )}

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
          <button className="btn btn-primary" onClick={handleSave}><Check size={14} /> Add Transaction</button>
        </div>
      </div>
    </div>
  );
};

interface AccountDetailProps {
  accountId: number;
  onBack: () => void;
}

export const AccountDetail: React.FC<AccountDetailProps> = ({ accountId, onBack }) => {
  const { refreshTrigger, triggerRefresh } = useDatabase();
  const [account, setAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showAddTxn, setShowAddTxn] = useState(false);

  useEffect(() => { loadData(); }, [refreshTrigger]);

  const loadData = () => {
    const accts = dbManager.runQuery('SELECT * FROM accounts WHERE id = ?;', [accountId]);
    if (accts.length) setAccount(accts[0]);
    const txns = dbManager.runQuery(
      `SELECT * FROM transactions WHERE (account_id = ? OR to_account_id = ?) AND status = 'confirmed' ORDER BY txn_date DESC, created_at DESC;`,
      [accountId, accountId]
    );
    setTransactions(txns);
  };

  if (!account) return null;

  const colors = ACCOUNT_COLORS[account.account_type] || ACCOUNT_COLORS.other;
  const income = transactions.filter(t => t.account_id === accountId && ['income', 'refund'].includes(t.type)).reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.account_id === accountId && !['income', 'refund'].includes(t.type)).reduce((s, t) => s + t.amount, 0);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', paddingBottom: '5.5rem' }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(160deg, ${colors.color}dd 0%, ${colors.color}99 100%)`, padding: 'calc(env(safe-area-inset-top, 0px) + 0.65rem) 1rem 2.5rem', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <button onClick={onBack} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>←</button>
          <h2 style={{ color: '#fff', fontSize: 17, fontWeight: 700, margin: 0, flex: 1 }}>{account.account_name}</h2>
          <button onClick={() => setShowAddTxn(true)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Plus size={16} />
          </button>
        </div>
        <div style={{ color: '#fff', fontSize: 34, fontWeight: 800, letterSpacing: '-0.04em' }}>{formatINR(account.current_balance)}</div>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>
          {account.bank ? `${account.bank}` : ''}{account.last4 ? ` ••••${account.last4}` : ''}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0 1rem', marginTop: '-1rem' }}>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 14, border: '1px solid var(--border)', padding: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><TrendingUp size={13} color="#059669" /><span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>MONEY IN</span></div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#059669' }}>{formatINR(income)}</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 14, border: '1px solid var(--border)', padding: '0.75rem', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><TrendingDown size={13} color="#EF4444" /><span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>MONEY OUT</span></div>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#EF4444' }}>{formatINR(expense)}</div>
        </div>
      </div>

      {/* Transactions */}
      <div style={{ padding: '1rem 1rem 0' }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Transactions ({transactions.length})</div>
        {transactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: 14 }}>
            No transactions yet.<br />
            <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowAddTxn(true)}><Plus size={14} /> Add Transaction</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {transactions.map(txn => {
              const isCredit = txn.account_id === accountId && ['income', 'refund'].includes(txn.type);
              const isDebit = txn.account_id === accountId && !['income', 'refund'].includes(txn.type);
              const sign = isCredit ? '+' : isDebit ? '-' : '↔';
              const col = isCredit ? '#059669' : isDebit ? '#EF4444' : '#2563EB';
              return (
                <div key={txn.id} style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border)', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{txn.merchant || txn.type}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{txn.category} · {txn.txn_date}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: col, flexShrink: 0 }}>{sign}{formatINR(txn.amount)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddTxn && <AddTxnForm accountId={accountId} onClose={() => setShowAddTxn(false)} onSaved={() => { setShowAddTxn(false); triggerRefresh(); }} />}
    </div>
  );
};
