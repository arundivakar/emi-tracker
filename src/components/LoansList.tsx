import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { formatINR, roundTo2, parseLoanNotes } from '../utils/calculator';
import { rescheduleAllEmiNotifications } from '../utils/notifications';
import {
  Search,
  Share2,
  Filter,
  X,
  FileText,
  Coins,
  Check,
  User,
  ChevronRight,
  Calendar,
  Clock,
  TrendingUp,
  Calculator,
  BarChart3,
  Zap,
  MoreVertical,
  Bell,
  Moon,
  Sun,
  Menu,
  CreditCard,
  ChevronDown,
  PieChart,
  Shield,
  Car,
  GraduationCap,
  Home as HomeIcon,
  Landmark,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

// ── Helpers ──────────────────────────────────────────────

const getLoanIconData = (purchaseName: string, lenderName: string) => {
  const pName = purchaseName.toLowerCase();
  const lName = lenderName.toLowerCase();
  
  if (pName.includes('car') || pName.includes('bike') || pName.includes('auto') || pName.includes('vehicle') || pName.includes('moto')) {
    return { Icon: Car, bgColor: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' };
  }
  if (pName.includes('home') || pName.includes('house') || pName.includes('property') || pName.includes('flat') || pName.includes('land') || pName.includes('apartment')) {
    return { Icon: HomeIcon, bgColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981' };
  }
  if (pName.includes('education') || pName.includes('study') || pName.includes('school') || pName.includes('college') || pName.includes('fees') || pName.includes('graduation')) {
    return { Icon: GraduationCap, bgColor: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B' };
  }
  if (pName.includes('insurance') || pName.includes('policy') || pName.includes('health') || pName.includes('shield')) {
    return { Icon: Shield, bgColor: 'rgba(99, 102, 241, 0.1)', color: '#6366F1' };
  }
  if (pName.includes('card') || lName.includes('card') || lName.includes('credit')) {
    return { Icon: CreditCard, bgColor: 'rgba(139, 92, 246, 0.1)', color: '#8B5CF6' };
  }
  return { Icon: Landmark, bgColor: 'rgba(100, 116, 139, 0.1)', color: '#64748B' };
};


const getDaysLabel = (dueDateStr: string): string => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr); due.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `Overdue ${Math.abs(diff)}d`;
  if (diff === 0) return 'Due today';
  return `Due in ${diff} days`;
};

const fmtDate = (s: string): string => {
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
};

// ── Interface ────────────────────────────────────────────

interface LoansListProps {
  onSelectLoan: (id: number) => void;
  onNavigate?: (tab: 'loans' | 'dashboard' | 'profiles' | 'calculators' | 'reports' | 'settings', params?: any) => void;
  onOpenDrawer?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

// ── Component ────────────────────────────────────────────

export const LoansList: React.FC<LoansListProps> = ({
  onSelectLoan,
  onNavigate,
  onOpenDrawer,
  theme = 'light',
  onToggleTheme,
}) => {
  const { refreshTrigger, triggerRefresh } = useDatabase();
  const [loans, setLoans] = useState<any[]>([]);
  const [persons, setPersons] = useState<any[]>([]);
  const [lenders, setLenders] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const [homeStats, setHomeStats] = useState<any>({
    nextEmiDue: null,
    nextDueCurrency: 'INR',
    monthlyTotal: 0,
    outstandingBal: 0,
    overdueCount: 0,
    activeLoansCount: 0,
    dueSoonCount: 0,
    currency: 'INR',
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterPerson, setFilterPerson] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLender, setFilterLender] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');

  const currentMonthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => { loadHomeData(); }, [refreshTrigger]);

  const closeMenu = useCallback((e: MouseEvent) => {
    if (!(e.target as Element).closest('.lcn-menu-wrapper')) setOpenMenuId(null);
  }, []);

  useEffect(() => {
    if (openMenuId !== null) {
      document.addEventListener('mousedown', closeMenu);
      return () => document.removeEventListener('mousedown', closeMenu);
    }
  }, [openMenuId, closeMenu]);

  const loadHomeData = () => {
    try {
      setPersons(dbManager.runQuery('SELECT * FROM persons ORDER BY name ASC;'));
      setLenders(dbManager.runQuery('SELECT DISTINCT lender_name FROM loans ORDER BY lender_name ASC;').map((l: any) => l.lender_name));

      const allLoans = dbManager.runQuery(
        `SELECT l.*, p.name as person_name FROM loans l LEFT JOIN persons p ON l.person_id = p.id ORDER BY l.created_at DESC;`
      );
      setLoans(allLoans);

      const pendingEmis = dbManager.runQuery(`
        SELECT e.*, l.purchase_name, l.lender_name, l.status as loan_status, l.notes as loan_notes
        FROM emi_schedule e JOIN loans l ON e.loan_id = l.id
        WHERE l.status = 'Active' AND e.status != 'Paid'
        ORDER BY e.due_date ASC;
      `);

      const nextDue = pendingEmis[0] || null;
      let nextDueCurrency = 'INR';
      if (nextDue?.loan_notes) nextDueCurrency = parseLoanNotes(nextDue.loan_notes).currency;

      const overdueCount = pendingEmis.filter((e: any) => e.status === 'Overdue').length;

      let monthlyTotal = 0, outstandingBal = 0, activeLoansCount = 0;
      const currCounts: Record<string, number> = {};

      allLoans.forEach((loan: any) => {
        if (loan.status !== 'Active') return;
        activeLoansCount++;
        const { currency } = parseLoanNotes(loan.notes);
        currCounts[currency] = (currCounts[currency] || 0) + 1;
        const loanEmis: any[] = dbManager.runQuery('SELECT * FROM emi_schedule WHERE loan_id = ?;', [loan.id]);
        if (loanEmis.length > 0) monthlyTotal += loanEmis[0].total_installment;
        loanEmis.forEach(e => { if (e.status !== 'Paid') outstandingBal += e.total_installment - e.amount_paid; });
      });

      let predominantCurrency = 'INR', maxCount = 0;
      Object.keys(currCounts).forEach(c => { if (currCounts[c] > maxCount) { maxCount = currCounts[c]; predominantCurrency = c; } });

      const now = new Date();
      const cy = now.getFullYear(), cm = now.getMonth() + 1;
      const dueSoonCount = pendingEmis.filter((e: any) => {
        if (!e.due_date) return false;
        const d = new Date(e.due_date);
        return !isNaN(d.getTime()) && d.getFullYear() === cy && d.getMonth() + 1 === cm;
      }).length;

      setHomeStats({ nextEmiDue: nextDue, nextDueCurrency, monthlyTotal: roundTo2(monthlyTotal), outstandingBal: roundTo2(outstandingBal), overdueCount, activeLoansCount, dueSoonCount, currency: predominantCurrency });
    } catch (e) { console.error('loadHomeData error:', e); }
  };

  const filteredLoans = loans.filter(loan => {
    const q = searchTerm.toLowerCase();
    if (q && !loan.purchase_name.toLowerCase().includes(q) && !(loan.person_name || '').toLowerCase().includes(q) && !loan.lender_name.toLowerCase().includes(q)) return false;
    if (filterPerson && loan.person_id !== Number(filterPerson)) return false;
    if (filterLender && loan.lender_name !== filterLender) return false;
    if (filterStatus) {
      if (filterStatus === 'Overdue') {
        const r = dbManager.runQuery("SELECT COUNT(*) as c FROM emi_schedule WHERE loan_id = ? AND status = 'Overdue';", [loan.id]);
        if ((r[0]?.c || 0) === 0) return false;
      } else if (loan.status !== filterStatus) return false;
    }
    if (filterDateStart && loan.purchase_date < filterDateStart) return false;
    if (filterDateEnd && loan.purchase_date > filterDateEnd) return false;
    return true;
  });

  const handleResetFilters = () => { setFilterPerson(''); setFilterStatus(''); setFilterLender(''); setFilterDateStart(''); setFilterDateEnd(''); setSearchTerm(''); };

  const handleMarkPaid = async (loanId: number) => {
    try {
      const next: any[] = dbManager.runQuery("SELECT * FROM emi_schedule WHERE loan_id = ? AND status != 'Paid' ORDER BY emi_number ASC LIMIT 1;", [loanId]);
      if (!next.length) return;
      const today = new Date().toISOString().split('T')[0];
      await dbManager.executeSql("UPDATE emi_schedule SET status = 'Paid', payment_date = ?, amount_paid = total_installment WHERE id = ?;", [today, next[0].id]);
      const rem = dbManager.runQuery("SELECT COUNT(*) as c FROM emi_schedule WHERE loan_id = ? AND status != 'Paid';", [loanId]);
      if ((rem[0]?.c || 0) === 0) await dbManager.executeSql("UPDATE loans SET status = 'Closed', closure_date = ? WHERE id = ?;", [today, loanId]);
      await rescheduleAllEmiNotifications(
        dbManager.runQuery("SELECT * FROM loans WHERE status = 'Active';"),
        dbManager.runQuery("SELECT * FROM emi_schedule;")
      );
      loadHomeData(); triggerRefresh();
    } catch (e) { console.error('markPaid error:', e); }
  };

  const handleShareLoan = async (loan: any, outstanding: number, nextEmi: any) => {
    const { currency } = parseLoanNotes(loan.notes);
    const text = `EMI Tracker\nLoan: ${loan.purchase_name}\nLender: ${loan.lender_name}\nFor: ${loan.person_name || 'N/A'}\nOutstanding: ${formatINR(outstanding, currency)}\nNext EMI: ${nextEmi ? formatINR(nextEmi.total_installment, currency) + ' (Due: ' + nextEmi.due_date + ')' : 'None'}`;
    if (navigator.share) { try { await navigator.share({ title: loan.purchase_name, text }); } catch {} }
    else { try { await navigator.clipboard.writeText(text); alert('Loan details copied!'); } catch {} }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text('Loans Summary', 14, 15);
    const body = filteredLoans.map(l => {
      const { currency } = parseLoanNotes(l.notes);
      const emis: any[] = dbManager.runQuery('SELECT * FROM emi_schedule WHERE loan_id = ?;', [l.id]);
      const out = emis.filter(e => e.status !== 'Paid').reduce((s, e) => s + (e.total_installment - e.amount_paid), 0);
      return [l.purchase_name, l.lender_name, l.person_name || 'N/A', formatINR(l.loan_amount - l.down_payment, currency), formatINR(out, currency), l.status];
    });
    (doc as any).autoTable({ head: [['Name', 'Lender', 'Person', 'Financed', 'Outstanding', 'Status']], body, startY: 22, theme: 'striped', headStyles: { fillColor: [79, 70, 229] }, styles: { fontSize: 9 } });
    doc.save(`loans_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const fmtShort = (val: number, cur: string): string => {
    const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '₹';
    if (val >= 10000000) return `${sym}${(val / 10000000).toFixed(2)}Cr`;
    if (val >= 100000) return `${sym}${(val / 100000).toFixed(2)}L`;
    if (val >= 1000) return `${sym}${(val / 1000).toFixed(1)}K`;
    return formatINR(val, cur);
  };

  return (
    <div className={`home-screen-new ${loans.length === 0 ? 'home-no-loans' : ''}`}>

      {/* ── GRADIENT HEADER ─────────────────────── */}
      <div className="hdr-gradient">
        <div className="hdr-top-row">
          <button className="hdr-icon-btn" onClick={() => onOpenDrawer?.()}>
            <Menu size={18} />
          </button>
          <h1 className="hdr-title">EMI Tracker</h1>
          <div className="hdr-right-actions">
            <button className="hdr-icon-btn" onClick={() => onToggleTheme?.()}>
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button
              className="hdr-icon-btn"
              onClick={() => alert(homeStats.nextEmiDue
                ? `Next: ${homeStats.nextEmiDue.purchase_name} – ${formatINR(homeStats.nextEmiDue.total_installment, homeStats.nextDueCurrency)} due ${homeStats.nextEmiDue.due_date}`
                : 'No upcoming payments.')}
            >
              <Bell size={15} />
            </button>
          </div>
        </div>
        <div className="hdr-emi-row">
          <div>
            <div className="hdr-emi-label">Total Monthly EMI</div>
            <div className="hdr-emi-amount">{formatINR(Math.round(homeStats.monthlyTotal), homeStats.currency)}</div>
          </div>
          <div className="hdr-month-pill">
            <Calendar size={12} />
            <span>{currentMonthLabel}</span>
            <ChevronDown size={12} />
          </div>
        </div>
      </div>

      {/* ── NEXT EMI CARD ───────────────────────── */}
      <div
        className="nec-card"
        onClick={() => homeStats.nextEmiDue && onSelectLoan(homeStats.nextEmiDue.loan_id)}
        style={{ cursor: homeStats.nextEmiDue ? 'pointer' : 'default' }}
      >
        <div className="nec-accent" />
        <div className="nec-left">
          <span className="nec-label">Next EMI Due</span>
          <div className="nec-amount">
            {homeStats.nextEmiDue ? formatINR(Math.round(homeStats.nextEmiDue.total_installment), homeStats.nextDueCurrency) : '—'}
          </div>
          {homeStats.nextEmiDue ? (
            <div className="nec-days-pill"><Clock size={10} />{getDaysLabel(homeStats.nextEmiDue.due_date)}</div>
          ) : (
            <div className="nec-days-pill nec-days-green"><Check size={10} /> All paid!</div>
          )}
        </div>
        <div className="nec-divider" />
        <div className="nec-right">
          {homeStats.nextEmiDue ? (
            <>
              <div className="nec-right-header">
                <div className="nec-loan-info">
                  <div className="nec-loan-name">{homeStats.nextEmiDue.purchase_name}</div>
                  <div className="nec-lender-name">{homeStats.nextEmiDue.lender_name}</div>
                </div>
                <ChevronRight size={14} className="nec-chevron" />
              </div>
              <div className="nec-due-date">
                <Calendar size={11} />
                <span>Due {fmtDate(homeStats.nextEmiDue.due_date)}</span>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#94A3B8', fontSize: '13px' }}>
              No upcoming EMI
            </div>
          )}
        </div>
      </div>

      {/* ── SUMMARY CARDS ───────────────────────── */}
      <div className="summary-row">
        <div className="sumcard sumcard-purple">
          <div className="sumcard-icon"><CreditCard size={11} /></div>
          <div className="sumcard-value" title={formatINR(homeStats.monthlyTotal, homeStats.currency)}>
            {fmtShort(homeStats.monthlyTotal, homeStats.currency)}
          </div>
          <div className="sumcard-label">Monthly EMI</div>
        </div>
        <div className="sumcard sumcard-green">
          <div className="sumcard-icon"><TrendingUp size={11} /></div>
          <div className="sumcard-value" title={formatINR(homeStats.outstandingBal, homeStats.currency)}>
            {fmtShort(homeStats.outstandingBal, homeStats.currency)}
          </div>
          <div className="sumcard-label">Outstanding</div>
        </div>
        <div className="sumcard sumcard-blue">
          <div className="sumcard-icon"><User size={11} /></div>
          <div className="sumcard-value">{homeStats.activeLoansCount}</div>
          <div className="sumcard-label">Active Loans</div>
        </div>
        <div className="sumcard sumcard-orange">
          <div className="sumcard-icon"><Clock size={11} /></div>
          <div className="sumcard-value">{homeStats.dueSoonCount}</div>
          <div className="sumcard-label">Due Soon</div>
        </div>
      </div>

      {/* ── QUICK ACTIONS ───────────────────────── */}
      <div className="qa-card">
        <button className="qa-item" onClick={() => onNavigate?.('calculators', { defaultCalculatorType: 'emi' })}>
          <Calculator size={16} className="qa-icon" />
          <span className="qa-label">Calculator</span>
        </button>
        <button className="qa-item" onClick={() => onNavigate?.('reports')}>
          <BarChart3 size={16} className="qa-icon" />
          <span className="qa-label">Reports</span>
        </button>
        <button className="qa-item" onClick={() => onNavigate?.('calculators', { defaultCalculatorType: 'prepay' })}>
          <Zap size={16} className="qa-icon" />
          <span className="qa-label">Prepay</span>
        </button>
        <button className="qa-item" onClick={() => onNavigate?.('reports')}>
          <PieChart size={16} className="qa-icon" />
          <span className="qa-label">Expenses</span>
        </button>
      </div>

      {loans.length > 0 && (
        <>
          {/* ── LOANS SECTION HEADER ────────────────── */}
          <div className="loans-section-hdr">
            <span className="loans-section-title">Your Loans ({filteredLoans.length})</span>
            <div className="loans-section-actions">
              <button className="lsa-btn" onClick={handleExportPDF}><FileText size={12} /> PDF</button>
              <button className="lsa-btn" onClick={() => setShowFilterModal(true)}><Filter size={12} /> Filter</button>
            </div>
          </div>

          {/* ── SEARCH BAR ──────────────────────────── */}
          <div className="loans-search-bar">
            <Search size={14} color="#94A3B8" />
            <input type="text" placeholder="Search loans..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            {searchTerm && <button className="search-clear" onClick={() => setSearchTerm('')}><X size={12} /></button>}
          </div>
        </>
      )}

      {/* ── LOAN CARDS ──────────────────────────── */}
      <div className="loan-cards-list" style={{ flex: loans.length === 0 ? 1 : undefined, display: loans.length === 0 ? 'flex' : undefined, flexDirection: loans.length === 0 ? 'column' : undefined, justifyContent: loans.length === 0 ? 'center' : undefined, paddingBottom: loans.length === 0 ? '2rem' : '5.5rem' }}>
        {loans.length === 0 ? (
          <div className="home-empty-state animate-scale">
            <div className="empty-state-icon"><Coins size={28} /></div>
            <h4 className="empty-state-title">No Loans Added Yet</h4>
            <p className="empty-state-desc">Start tracking your EMIs, loans and purchases.</p>
            <button className="btn btn-primary" onClick={() => onNavigate?.('loans', { showAddForm: true })} style={{ marginTop: '0.8rem', minHeight: '36px', fontSize: '15px' }}>
              + Add Your First Loan
            </button>
          </div>
        ) : filteredLoans.length === 0 ? (
          <div className="empty-state animate-scale">
            <div className="empty-state-icon"><Search size={20} /></div>
            <h4 className="empty-state-title">No Results</h4>
            <p className="empty-state-desc">Try adjusting your search or filters.</p>
            <button className="btn btn-outline" onClick={handleResetFilters}>Reset Filters</button>
          </div>
        ) : (
          filteredLoans.map(loan => {
            const { currency } = parseLoanNotes(loan.notes);
            const emis: any[] = dbManager.runQuery('SELECT * FROM emi_schedule WHERE loan_id = ?;', [loan.id]);
            const total = emis.length;
            const paid = emis.filter(e => e.status === 'Paid').length;
            const pct = total > 0 ? roundTo2((paid / total) * 100) : 0;
            const nextEmi = emis.filter(e => e.status !== 'Paid').sort((a, b) => a.emi_number - b.emi_number)[0];
            const outstanding = emis.filter(e => e.status !== 'Paid').reduce((s, e) => s + (e.total_installment - e.amount_paid), 0);
            const isOverdue = (dbManager.runQuery("SELECT COUNT(*) as c FROM emi_schedule WHERE loan_id = ? AND status = 'Overdue';", [loan.id])[0]?.c || 0) > 0;
            const now = new Date();
            const hasDueSoon = emis.some(e => {
              if (e.status === 'Paid' || !e.due_date) return false;
              const d = new Date(e.due_date);
              return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() + 1 === now.getMonth() + 1;
            });

            let statusKey = 'closed';
            let statusLabel = loan.status;
            let barColor = '#94A3B8';

            if (loan.status === 'Active') {
              if (isOverdue) { statusKey = 'overdue'; statusLabel = 'Overdue'; barColor = '#EF4444'; }
              else if (hasDueSoon) { statusKey = 'duesoon'; statusLabel = 'Due Soon'; barColor = '#F59E0B'; }
              else { statusKey = 'active'; statusLabel = 'Active'; barColor = '#22C55E'; }
            } else if (loan.status === 'Foreclosed') {
              statusKey = 'closed'; statusLabel = 'Foreclosed';
            }

            const menuOpen = openMenuId === loan.id;
            const iconData = getLoanIconData(loan.purchase_name, loan.lender_name);
            const LoanIcon = iconData.Icon;

            return (
              <div key={loan.id} className={`loan-card-new lc-${statusKey}`}>
                {/* Identity Row (left avatar, center name/meta, right status badge) */}
                <div className="lcn-header-row">
                  <div className="ld-avatar" style={{ backgroundColor: iconData.bgColor, color: iconData.color, flexShrink: 0, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LoanIcon size={15} />
                  </div>
                  <div className="lcn-name-block">
                    <div className="lcn-name">{loan.purchase_name}</div>
                    <div className="lcn-meta">
                      <span>{loan.lender_name}</span>
                      <span className="lcn-dot">•</span>
                      <span>{loan.person_name || 'Self'}</span>
                    </div>
                  </div>
                  <div className="ld-status-group">
                    <span className={`ld-status-badge ld-s-${statusKey}`}>{statusLabel}</span>
                  </div>
                </div>

                {/* 2-Column Stats Grid */}
                <div className="lcn-stats-grid">
                  <div className="ld-stat">
                    <span className="ld-stat-label">Outstanding</span>
                    <span className="ld-stat-value">{formatINR(outstanding, currency)}</span>
                  </div>
                  <div className="ld-stat">
                    <span className="ld-stat-label">Next EMI</span>
                    <span className="ld-stat-value ld-val-primary" style={{ color: nextEmi && nextEmi.status === 'Overdue' ? 'var(--status-overdue)' : 'var(--primary)' }}>
                      {nextEmi ? formatINR(nextEmi.total_installment, currency) : '—'}
                    </span>
                    {nextEmi && <span className="ld-stat-sub">{nextEmi.due_date}</span>}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="ld-progress-track" style={{ marginTop: '0.2rem' }}>
                  <div className="ld-progress-fill" style={{ width: `${pct}%`, background: barColor }} />
                </div>
                
                {/* Progress Text & Menu Trigger */}
                <div className="lcn-progress-footer">
                  <span className="lcn-progress-text">{paid} / {total} EMIs paid ({pct}%)</span>
                  
                  <div className="lcn-menu-wrapper">
                    <button className="lcn-three-dot" onClick={e => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : loan.id); }}>
                      <MoreVertical size={14} />
                    </button>
                    {menuOpen && (
                      <div className="lcn-menu-dropdown">
                        <button onClick={e => { e.stopPropagation(); handleShareLoan(loan, outstanding, nextEmi); setOpenMenuId(null); }}>
                          <Share2 size={12} /> Share
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Row */}
                <div className="lcn-actions">
                  <button className="btn-view-det" onClick={e => { e.stopPropagation(); onSelectLoan(loan.id); }}>
                    View
                  </button>
                  {nextEmi && (
                    <button className="btn-mark-pd" onClick={e => { e.stopPropagation(); handleMarkPaid(loan.id); }}>
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── FILTER MODAL ────────────────────────── */}
      {showFilterModal && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setShowFilterModal(false)}>
          <div className="modal-content animate-scale" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="card-title" style={{ margin: 0 }}>Filter Loans</h3>
              <button className="btn btn-secondary btn-circle" onClick={() => setShowFilterModal(false)} style={{ width: 32, height: 32 }}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label>Person</label>
                <select className="form-control" value={filterPerson} onChange={e => setFilterPerson(e.target.value)}>
                  <option value="">All Persons</option>
                  {persons.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Loan Status</label>
                <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Closed">Closed</option>
                  <option value="Foreclosed">Foreclosed</option>
                  <option value="Overdue">Has Overdue EMIs</option>
                </select>
              </div>
              <div className="form-group">
                <label>Lender</label>
                <select className="form-control" value={filterLender} onChange={e => setFilterLender(e.target.value)}>
                  <option value="">All Lenders</option>
                  {lenders.map((l: string) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label>Start Date</label>
                  <input type="date" className="form-control" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input type="date" className="form-control" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleResetFilters}>Reset</button>
              <button className="btn btn-primary" onClick={() => setShowFilterModal(false)}>Apply</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
