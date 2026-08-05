import React, { useState, useEffect } from 'react';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { formatINR, roundTo2 } from '../utils/calculator';
import { Search, Calendar, Landmark, User, Clock, Eye, Plus } from 'lucide-react';

interface LoansListProps {
  onSelectLoan: (id: number) => void;
  onAddLoan: () => void;
}

export const LoansList: React.FC<LoansListProps> = ({ onSelectLoan, onAddLoan }) => {
  const { refreshTrigger } = useDatabase();
  
  // Data States
  const [loans, setLoans] = useState<any[]>([]);
  const [persons, setPersons] = useState<any[]>([]);
  const [lenders, setLenders] = useState<string[]>([]);
  
  // Home Screen Stats States
  const [homeStats, setHomeStats] = useState<any>({
    nextEmiDue: null,
    todayDueCount: 0,
    todayDueAmount: 0,
    monthlyTotal: 0,
    outstandingBal: 0,
    overdueCount: 0,
    recentPayments: []
  });

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPerson, setFilterPerson] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLender, setFilterLender] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');

  useEffect(() => {
    loadHomeData();
  }, [refreshTrigger]);

  const loadHomeData = () => {
    try {
      // 1. Load persons and lenders for filters
      const personsRes = dbManager.runQuery('SELECT * FROM persons ORDER BY name ASC;');
      setPersons(personsRes);

      const lendersRes = dbManager.runQuery('SELECT DISTINCT lender_name FROM loans ORDER BY lender_name ASC;');
      setLenders(lendersRes.map(l => l.lender_name));

      // 2. Fetch all loans
      const allLoans = dbManager.runQuery(`
        SELECT l.*, p.name as person_name 
        FROM loans l 
        JOIN persons p ON l.person_id = p.id 
        ORDER BY l.created_at DESC;
      `);
      setLoans(allLoans);

      // 3. Compute Home Screen Specific Statistics
      const todayStr = new Date().toISOString().split('T')[0];

      // Fetch all active/pending EMIs
      const pendingEmis = dbManager.runQuery(`
        SELECT e.*, l.purchase_name, l.lender_name, l.status as loan_status
        FROM emi_schedule e
        JOIN loans l ON e.loan_id = l.id
        WHERE l.status = 'Active' AND e.status != 'Paid'
        ORDER BY e.due_date ASC;
      `);

      // Next EMI Due
      const nextDue = pendingEmis[0] || null;

      // Today's Due
      const todayDue = pendingEmis.filter(e => e.due_date === todayStr);
      const todayDueCount = todayDue.length;
      const todayDueAmount = todayDue.reduce((sum, e) => sum + e.total_installment, 0);

      // Overdue
      const overdueEmis = pendingEmis.filter(e => e.status === 'Overdue');
      const overdueCount = overdueEmis.length;

      // Monthly Total (Active) & Outstanding Balance
      let monthlyTotal = 0;
      let outstandingBal = 0;

      allLoans.forEach((loan: any) => {
        if (loan.status === 'Active') {
          const loanEmis = dbManager.runQuery('SELECT * FROM emi_schedule WHERE loan_id = ?;', [loan.id]);
          if (loanEmis.length > 0) {
            monthlyTotal += loanEmis[0].total_installment;
          }
          loanEmis.forEach((emi: any) => {
            if (emi.status !== 'Paid') {
              outstandingBal += (emi.total_installment - emi.amount_paid);
            }
          });
        }
      });

      // Recent Payments
      const recentPayments = dbManager.runQuery(`
        SELECT e.*, l.purchase_name 
        FROM emi_schedule e
        JOIN loans l ON e.loan_id = l.id
        WHERE e.status = 'Paid' OR e.status = 'Partially Paid'
        ORDER BY e.payment_date DESC, e.id DESC
        LIMIT 4;
      `);

      setHomeStats({
        nextEmiDue: nextDue,
        todayDueCount,
        todayDueAmount: roundTo2(todayDueAmount),
        monthlyTotal: roundTo2(monthlyTotal),
        outstandingBal: roundTo2(outstandingBal),
        overdueCount,
        recentPayments
      });
    } catch (e) {
      console.error('Failed to load loans list data:', e);
    }
  };

  // Filter application logic
  const filteredLoans = loans.filter((loan) => {
    // Search filter
    const matchesSearch =
      loan.purchase_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loan.person_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loan.lender_name.toLowerCase().includes(searchTerm.toLowerCase());

    // Person filter
    const matchesPerson = filterPerson === '' || loan.person_id === Number(filterPerson);

    // Lender filter
    const matchesLender = filterLender === '' || loan.lender_name === filterLender;

    // Status filter
    let matchesStatus = true;
    if (filterStatus === 'Active') matchesStatus = loan.status === 'Active';
    else if (filterStatus === 'Closed') matchesStatus = loan.status === 'Closed';
    else if (filterStatus === 'Foreclosed') matchesStatus = loan.status === 'Foreclosed';
    else if (filterStatus === 'Overdue') {
      // Check if this loan has any overdue EMIs
      const overdueRes = dbManager.runQuery("SELECT COUNT(*) as count FROM emi_schedule WHERE loan_id = ? AND status = 'Overdue';", [loan.id]);
      matchesStatus = (overdueRes[0]?.count || 0) > 0;
    }

    // Date range filter (matching purchase date)
    let matchesDate = true;
    if (filterDateStart && loan.purchase_date < filterDateStart) matchesDate = false;
    if (filterDateEnd && loan.purchase_date > filterDateEnd) matchesDate = false;

    return matchesSearch && matchesPerson && matchesLender && matchesStatus && matchesDate;
  });

  return (
    <div className="animate-fade">
      {/* 1. Home Quick Summary stats widgets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {/* Next EMI due widget */}
        <div className="card widget-card" style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="widget-icon" style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
              <Clock size={24} />
            </div>
            <div className="widget-info">
              <span className="widget-label">Next EMI Due</span>
              {homeStats.nextEmiDue ? (
                <>
                  <span className="widget-value">{formatINR(homeStats.nextEmiDue.total_installment)}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {homeStats.nextEmiDue.purchase_name} on {homeStats.nextEmiDue.due_date}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 600 }}>No upcoming EMIs</span>
              )}
            </div>
          </div>
          {homeStats.nextEmiDue && (
            <button className="btn btn-secondary" onClick={() => onSelectLoan(homeStats.nextEmiDue.loan_id)} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
              Track
            </button>
          )}
        </div>

        {/* Today's due */}
        <div className="card widget-card">
          <div className="widget-icon" style={{ backgroundColor: homeStats.todayDueCount > 0 ? 'var(--status-overdue-bg)' : 'var(--input-bg)', color: homeStats.todayDueCount > 0 ? 'var(--status-overdue)' : 'var(--text-secondary)' }}>
            <Calendar size={20} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Due Today</span>
            <span className="widget-value">{formatINR(homeStats.todayDueAmount)}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{homeStats.todayDueCount} bills pending</span>
          </div>
        </div>

        {/* Overdue Count */}
        <div className="card widget-card">
          <div className="widget-icon" style={{ backgroundColor: homeStats.overdueCount > 0 ? 'var(--status-overdue-bg)' : 'var(--input-bg)', color: homeStats.overdueCount > 0 ? 'var(--status-overdue)' : 'var(--text-secondary)' }}>
            <ShieldAlert size={20} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Overdue Bills</span>
            <span className="widget-value" style={{ color: homeStats.overdueCount > 0 ? 'var(--status-overdue)' : 'inherit' }}>
              {homeStats.overdueCount}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Action required</span>
          </div>
        </div>
      </div>

      {/* 2. Search & Filters Bar */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Global search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-secondary)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search by Purchase, Person, Lender..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>

          <button className="btn btn-primary" onClick={onAddLoan}>
            <Plus size={16} /> New Loan
          </button>
        </div>

        {/* Advanced Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Person</label>
            <select className="form-control" value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
              <option value="">All Persons</option>
              {persons.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Loan Status</label>
            <select className="form-control" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
              <option value="Foreclosed">Foreclosed</option>
              <option value="Overdue">Has Overdue EMIs</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Lender</label>
            <select className="form-control" value={filterLender} onChange={(e) => setFilterLender(e.target.value)}>
              <option value="">All Lenders</option>
              {lenders.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Purchase Date Start</label>
            <input type="date" className="form-control" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '0.75rem' }}>Purchase Date End</label>
            <input type="date" className="form-control" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)} />
          </div>
        </div>
      </div>

      {/* 3. Main Grid layout: Left - Loans List, Right - Recent Payments */}
      <div className="grid-cols-12">
        {/* Left Side: Loans list */}
        <div className="col-span-8">
          <h3 className="card-title" style={{ marginBottom: '1rem', display: 'flex', justifySelf: 'start' }}>
            My Loans ({filteredLoans.length})
          </h3>

          {filteredLoans.length === 0 ? (
            <div className="card" style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No loans matched your filters. Click "New Loan" to create one.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredLoans.map((loan) => {
                // Compute progress percentages
                const emis = dbManager.runQuery('SELECT * FROM emi_schedule WHERE loan_id = ?;', [loan.id]);
                const totalEmis = emis.length;
                const paidEmis = emis.filter(e => e.status === 'Paid').length;
                const progressPct = totalEmis > 0 ? roundTo2((paidEmis / totalEmis) * 100) : 0;
                
                // Get next pending EMI
                const nextEmi = emis.filter(e => e.status !== 'Paid').sort((a, b) => a.emi_number - b.emi_number)[0];
                
                // Calculate outstanding
                const outstanding = emis.filter(e => e.status !== 'Paid').reduce((sum, e) => sum + (e.total_installment - e.amount_paid), 0);

                return (
                  <div key={loan.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ fontSize: '1.2rem', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>{loan.purchase_name}</h4>
                        <div style={{ display: 'flex', gap: '0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Landmark size={12} /> {loan.lender_name}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><User size={12} /> {loan.person_name}</span>
                        </div>
                      </div>
                      <div>
                        {loan.status === 'Active' && <span className="badge badge-active">Active</span>}
                        {loan.status === 'Closed' && <span className="badge badge-closed">Closed</span>}
                        {loan.status === 'Foreclosed' && <span className="badge badge-foreclosed">Foreclosed</span>}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem', fontSize: '0.88rem' }}>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Financed:</span>
                        <strong>{formatINR(loan.loan_amount - loan.down_payment)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Outstanding Balance:</span>
                        <strong style={{ color: 'var(--primary)' }}>{formatINR(outstanding)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>Next EMI:</span>
                        {nextEmi ? (
                          <strong>{formatINR(nextEmi.total_installment)} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>({nextEmi.due_date})</span></strong>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>None</span>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        <span>EMI Progress ({paidEmis}/{totalEmis} paid)</span>
                        <strong>{progressPct}%</strong>
                      </div>
                      <div style={{ width: '100%', height: 6, backgroundColor: 'var(--input-bg)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--accent))', borderRadius: 10 }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                      <button className="btn btn-secondary" onClick={() => onSelectLoan(loan.id)} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                        <Eye size={14} /> View Amortization & Manage
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Recent Payments */}
        <div className="col-span-4 card" style={{ alignSelf: 'start' }}>
          <div className="card-header" style={{ marginBottom: '1.25rem' }}>
            <h3 className="card-title">Recent Payments</h3>
          </div>

          {homeStats.recentPayments.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              No payments recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {homeStats.recentPayments.map((pmt: any) => (
                <div key={pmt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--input-bg)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: '0.88rem' }}>{pmt.purchase_name}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.1rem' }}>
                      EMI #{pmt.emi_number} • {pmt.payment_date}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--status-paid)' }}>
                      +{formatINR(pmt.amount_paid)}
                    </span>
                    <span className="badge badge-paid" style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', marginTop: '0.2rem' }}>
                      {pmt.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Workaround for import error of X
const ShieldAlert: React.FC<{ size: number; style?: any; color?: string }> = ({ size, style, color }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
);
