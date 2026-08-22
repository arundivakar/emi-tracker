import React, { useState, useEffect } from 'react';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { formatINR, roundTo2 } from '../utils/calculator';
import { TrendingUp, TrendingDown, CreditCard, Building2, ShieldCheck, Calendar, Edit3, Check, X } from 'lucide-react';

interface FinancialOverviewProps {}

export const FinancialOverview: React.FC<FinancialOverviewProps> = () => {
  const { refreshTrigger } = useDatabase();
  const [data, setData] = useState({
    bankBalance: 0,
    creditCardOutstanding: 0,
    loanOutstanding: 0,
    upcomingEMIs: 0,
    upcomingCardBills: 0,
    reserve: 0,
    accounts: [] as any[],
    cards: [] as any[],
    upcomingObligations: [] as any[],
  });
  const [editReserve, setEditReserve] = useState(false);
  const [reserveInput, setReserveInput] = useState('');

  useEffect(() => { loadData(); }, [refreshTrigger]);

  const loadData = () => {
    try {
      // Bank balances
      const accounts = dbManager.runQuery('SELECT * FROM accounts WHERE is_active = 1;');
      const bankBalance = accounts.reduce((s: number, a: any) => s + (a.current_balance || 0), 0);

      // Credit card outstanding
      const cards = dbManager.runQuery('SELECT * FROM credit_cards WHERE is_active = 1;');
      const creditCardOutstanding = cards.reduce((s: number, c: any) => s + (c.current_outstanding || 0), 0);

      // Loan outstanding (all pending EMI amounts)
      const allPendingEMIs = dbManager.runQuery(
        `SELECT e.*, l.purchase_name FROM emi_schedule e JOIN loans l ON e.loan_id = l.id WHERE l.status = 'Active' AND e.status != 'Paid';`
      );
      const loanOutstanding = allPendingEMIs.reduce((s: number, e: any) => s + (e.total_installment - (e.amount_paid || 0)), 0);

      // Upcoming EMIs (next 30 days)
      const today = new Date();
      const in30 = new Date(today); in30.setDate(today.getDate() + 30);
      const todayStr = today.toISOString().split('T')[0];
      const in30Str = in30.toISOString().split('T')[0];

      const upcomingEMIRows = dbManager.runQuery(
        `SELECT e.*, l.purchase_name FROM emi_schedule e JOIN loans l ON e.loan_id = l.id WHERE l.status = 'Active' AND e.status != 'Paid' AND e.due_date >= ? AND e.due_date <= ? ORDER BY e.due_date;`,
        [todayStr, in30Str]
      );
      const upcomingEMIs = upcomingEMIRows.reduce((s: number, e: any) => s + (e.total_installment - (e.amount_paid || 0)), 0);

      // Upcoming card bills
      const upcomingCardBills = cards.reduce((s: number, c: any) => {
        if (c.due_date_day && c.current_outstanding > 0) {
          const d = new Date(today.getFullYear(), today.getMonth(), c.due_date_day);
          if (d < today) d.setMonth(d.getMonth() + 1);
          if (d <= in30) return s + c.current_outstanding;
        }
        return s;
      }, 0);

      // Reserve setting
      const reserveRes = dbManager.runQuery("SELECT value FROM settings WHERE key = 'reserve_amount';");
      const reserve = reserveRes.length ? parseFloat(reserveRes[0].value) || 0 : 0;

      // Build upcoming obligations list
      const obligations: any[] = [];
      upcomingEMIRows.forEach((e: any) => {
        const diff = Math.ceil((new Date(e.due_date).getTime() - today.getTime()) / 86400000);
        obligations.push({ type: 'EMI', name: e.purchase_name, amount: e.total_installment - (e.amount_paid || 0), dueDate: e.due_date, daysLeft: diff });
      });
      cards.forEach((c: any) => {
        if (c.due_date_day && c.current_outstanding > 0) {
          const d = new Date(today.getFullYear(), today.getMonth(), c.due_date_day);
          if (d < today) d.setMonth(d.getMonth() + 1);
          if (d <= in30) {
            const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
            obligations.push({ type: 'Card', name: c.nickname || c.card_name, amount: c.current_outstanding, dueDate: d.toISOString().split('T')[0], daysLeft: diff });
          }
        }
      });
      obligations.sort((a, b) => a.daysLeft - b.daysLeft);

      setData({ bankBalance, creditCardOutstanding, loanOutstanding: roundTo2(loanOutstanding), upcomingEMIs: roundTo2(upcomingEMIs), upcomingCardBills: roundTo2(upcomingCardBills), reserve, accounts, cards, upcomingObligations: obligations });
      setReserveInput(String(reserve));
    } catch (e) { console.error(e); }
  };

  const saveReserve = async () => {
    const val = parseFloat(reserveInput) || 0;
    await dbManager.executeSql("INSERT INTO settings (key, value) VALUES ('reserve_amount', ?) ON CONFLICT(key) DO UPDATE SET value = ?;", [String(val), String(val)]);
    setEditReserve(false);
    loadData();
  };

  const netWorth = roundTo2(data.bankBalance - data.creditCardOutstanding - data.loanOutstanding);
  const safeToSpend = roundTo2(data.bankBalance - data.upcomingEMIs - data.upcomingCardBills - data.reserve);
  const totalUpcoming = roundTo2(data.upcomingEMIs + data.upcomingCardBills);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)', paddingBottom: '5.5rem' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(160deg, #0c1445 0%, #1e3a5f 50%, #1a5276 100%)', padding: 'calc(env(safe-area-inset-top, 0px) + 0.65rem) 1rem 2rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,152,219,0.2) 0%, transparent 70%)', top: -60, right: -40, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Net Worth</div>
          <div style={{ color: netWorth >= 0 ? '#4ADE80' : '#F87171', fontSize: 36, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 4 }}>{formatINR(netWorth)}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>Assets − Liabilities</div>
        </div>
      </div>

      <div style={{ padding: '0 1rem', marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

        {/* Assets vs Liabilities */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {/* Assets */}
          <div style={{ background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', borderRadius: 16, border: '1px solid #A7F3D0', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <TrendingUp size={14} color="#059669" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assets</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#059669', letterSpacing: '-0.02em', marginBottom: 6 }}>{formatINR(data.bankBalance)}</div>
            {data.accounts.slice(0, 3).map((a: any) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#065F46', marginTop: 2 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{a.account_name}</span>
                <span style={{ fontWeight: 600 }}>{formatINR(a.current_balance)}</span>
              </div>
            ))}
            {data.accounts.length > 3 && <div style={{ fontSize: 10, color: '#065F46', marginTop: 2 }}>+{data.accounts.length - 3} more accounts</div>}
          </div>

          {/* Liabilities */}
          <div style={{ background: 'linear-gradient(135deg, #FEF2F2 0%, #FECACA 100%)', borderRadius: 16, border: '1px solid #FCA5A5', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <TrendingDown size={14} color="#EF4444" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Liabilities</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#EF4444', letterSpacing: '-0.02em', marginBottom: 6 }}>{formatINR(data.creditCardOutstanding + data.loanOutstanding)}</div>
            {data.creditCardOutstanding > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7F1D1D', marginTop: 2 }}>
                <span>Credit Cards</span>
                <span style={{ fontWeight: 600 }}>-{formatINR(data.creditCardOutstanding)}</span>
              </div>
            )}
            {data.loanOutstanding > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7F1D1D', marginTop: 2 }}>
                <span>EMI / Loans</span>
                <span style={{ fontWeight: 600 }}>-{formatINR(data.loanOutstanding)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Safe to Spend */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 18, border: `2px solid ${safeToSpend >= 0 ? '#10B981' : '#EF4444'}`, padding: '1rem', boxShadow: `0 4px 20px ${safeToSpend >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
            <ShieldCheck size={18} color={safeToSpend >= 0 ? '#10B981' : '#EF4444'} />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Safe to Spend</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 28, color: safeToSpend >= 0 ? '#10B981' : '#EF4444', letterSpacing: '-0.04em', marginBottom: '0.75rem' }}>
            {formatINR(safeToSpend)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Building2 size={11} /> Bank Balance</span>
              <span style={{ fontWeight: 600, color: '#059669' }}>+{formatINR(data.bankBalance)}</span>
            </div>
            {data.upcomingEMIs > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Calendar size={11} /> Upcoming EMIs (30d)</span>
                <span style={{ fontWeight: 600, color: '#EF4444' }}>-{formatINR(data.upcomingEMIs)}</span>
              </div>
            )}
            {data.upcomingCardBills > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><CreditCard size={11} /> Card Bills Due (30d)</span>
                <span style={{ fontWeight: 600, color: '#EF4444' }}>-{formatINR(data.upcomingCardBills)}</span>
              </div>
            )}
            {data.reserve > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><ShieldCheck size={11} /> Reserve</span>
                <span style={{ fontWeight: 600, color: '#F59E0B' }}>-{formatINR(data.reserve)}</span>
              </div>
            )}
            <div style={{ height: 1, background: 'var(--border)', margin: '0.3rem 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>
              <span>Safe Available</span>
              <span style={{ color: safeToSpend >= 0 ? '#10B981' : '#EF4444' }}>{formatINR(safeToSpend)}</span>
            </div>
          </div>
        </div>

        {/* Reserve Setting */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 16, border: '1px solid var(--border)', padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Minimum Reserve</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Excluded from Safe to Spend</div>
          </div>
          {editReserve ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input type="number" inputMode="decimal" value={reserveInput} onChange={e => setReserveInput(e.target.value)}
                style={{ width: 90, padding: '0.3rem 0.5rem', borderRadius: 8, border: '1.5px solid var(--primary)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700 }} />
              <button onClick={saveReserve} style={{ width: 30, height: 30, borderRadius: 8, background: '#10B981', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={14} /></button>
              <button onClick={() => setEditReserve(false)} style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: '#F59E0B' }}>{formatINR(data.reserve)}</span>
              <button onClick={() => setEditReserve(true)} style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit3 size={13} /></button>
            </div>
          )}
        </div>

        {/* Upcoming Obligations */}
        {data.upcomingObligations.length > 0 && (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '0.9rem 1rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Upcoming (30 days)</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#EF4444' }}>{formatINR(totalUpcoming)}</div>
            </div>
            {data.upcomingObligations.map((ob: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: ob.type === 'EMI' ? '#EEF2FF' : '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {ob.type === 'EMI' ? <Building2 size={14} color="#4F46E5" /> : <CreditCard size={14} color="#EF4444" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ob.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ob.type} · {ob.daysLeft <= 0 ? 'Due today' : `in ${ob.daysLeft} day${ob.daysLeft !== 1 ? 's' : ''}`}</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 14, color: ob.daysLeft <= 3 ? '#EF4444' : ob.daysLeft <= 7 ? '#F59E0B' : 'var(--text-primary)', flexShrink: 0 }}>{formatINR(ob.amount)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Quick summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div style={{ background: '#EEF2FF', borderRadius: 14, padding: '0.75rem', border: '1px solid #C7D2FE' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#4F46E5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>EMI Burden</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: '#4F46E5' }}>{formatINR(data.upcomingEMIs)}</div>
            <div style={{ fontSize: 11, color: '#6366F1', marginTop: 2 }}>Next 30 days</div>
          </div>
          <div style={{ background: '#FEF3C7', borderRadius: 14, padding: '0.75rem', border: '1px solid #FDE68A' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Card Bills</div>
            <div style={{ fontWeight: 800, fontSize: 17, color: '#D97706' }}>{formatINR(data.upcomingCardBills)}</div>
            <div style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>Due this month</div>
          </div>
        </div>
      </div>
    </div>
  );
};
