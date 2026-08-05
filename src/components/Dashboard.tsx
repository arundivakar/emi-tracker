import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { formatINR, roundTo2, parseLoanNotes, getCurrencySymbol } from '../utils/calculator';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Percent,
  Wallet,
  DollarSign,
  Briefcase,
  X
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  CartesianGrid
} from 'recharts';

interface DashboardProps {
  onSelectLoan: (loanId: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectLoan }) => {
  const { refreshTrigger } = useDatabase();
  
  // Drilldown states
  const [modalType, setModalType] = useState<'active' | 'overdue' | 'upcoming' | 'outstanding' | 'emi' | null>(null);
  const [activeLoansList, setActiveLoansList] = useState<any[]>([]);
  const [overdueEmisList, setOverdueEmisList] = useState<any[]>([]);
  const [upcomingEmisList, setUpcomingEmisList] = useState<any[]>([]);

  const [stats, setStats] = useState<any>({
    totalOutstanding: 0,
    totalMonthlyEmi: 0,
    totalInterestPayable: 0,
    totalGstPayable: 0,
    totalProcessingFees: 0,
    activeLoansCount: 0,
    closedLoansCount: 0,
    upcomingThisMonthCount: 0,
    overdueCount: 0,
    completionPercentage: 0,
    totalPaidAmount: 0,
    totalPendingAmount: 0,
    currency: 'INR'
  });

  const [chartsData, setChartsData] = useState<any>({
    outstandingVsPaid: [],
    breakdown: [],
    monthlyTrend: [],
    personOutstanding: [],
    completionProgress: 0
  });

  useEffect(() => {
    loadDashboardData();
  }, [refreshTrigger]);

  const loadDashboardData = () => {
    try {
      // 1. Basic Counts
      const activeLoans = dbManager.runQuery("SELECT id, purchase_name, loan_amount, down_payment, interest_rate, period_months, emi_start_date, notes FROM loans WHERE status = 'Active';");
      const closedLoans = dbManager.runQuery("SELECT COUNT(*) as count FROM loans WHERE status IN ('Closed', 'Foreclosed');");
      const closedCount = closedLoans[0]?.count || 0;
      const activeCount = activeLoans.length;

      // 2. Fetch all EMIs to calculate summaries
      const allEmis = dbManager.runQuery(`
        SELECT e.*, l.purchase_name, l.status as loan_status, l.person_id, l.notes as loan_notes 
        FROM emi_schedule e 
        JOIN loans l ON e.loan_id = l.id;
      `);

      // Determine predominant currency of active loans
      const currencyCounts: { [key: string]: number } = {};
      activeLoans.forEach((loan: any) => {
        const { currency } = parseLoanNotes(loan.notes);
        currencyCounts[currency] = (currencyCounts[currency] || 0) + 1;
      });
      let predominantCurrency = 'INR';
      let maxCount = 0;
      Object.keys(currencyCounts).forEach((curr) => {
        if (currencyCounts[curr] > maxCount) {
          maxCount = currencyCounts[curr];
          predominantCurrency = curr;
        }
      });

      let totalOutstanding = 0;
      let totalInterestPayable = 0;
      let totalGstPayable = 0;
      let totalPaidAmount = 0;
      let totalPendingAmount = 0;
      let overdueCount = 0;
      let upcomingThisMonthCount = 0;
      
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1; // 1-12

      allEmis.forEach((emi: any) => {
        const emiOutstanding = emi.total_installment - emi.amount_paid;
        totalPaidAmount += emi.amount_paid;

        if (emi.loan_status === 'Active') {
          if (emi.status !== 'Paid') {
            totalOutstanding += emiOutstanding;
            totalInterestPayable += emi.interest_component;
            totalGstPayable += emi.gst_on_interest;
            totalPendingAmount += emiOutstanding;
          }
          
          if (emi.status === 'Overdue') {
            overdueCount++;
          }

          // Check if due in current calendar month
          if (emi.due_date) {
            const dueDate = new Date(emi.due_date);
            if (!isNaN(dueDate.getTime())) {
              if (dueDate.getFullYear() === currentYear && (dueDate.getMonth() + 1) === currentMonth && emi.status !== 'Paid') {
                upcomingThisMonthCount++;
              }
            }
          }
        }
      });

      // 3. Total Processing Fees (including GST)
      const feeRes = dbManager.runQuery(`
        SELECT SUM(processing_fee) as base_fee, 
               SUM(processing_fee * (gst_processing_fee_rate / 100)) as gst_fee 
        FROM loans;
      `);
      const baseFee = feeRes[0]?.base_fee || 0;
      const gstFee = feeRes[0]?.gst_fee || 0;
      const totalProcessingFees = baseFee + gstFee;

      // 4. Calculate Total Monthly EMI for active loans
      // (This is the sum of standard installments that are due in the future or currently active)
      let totalMonthlyEmi = 0;
      activeLoans.forEach((loan: any) => {
        const activeEmis = allEmis.filter((e: any) => e.loan_id === loan.id);
        if (activeEmis.length > 0) {
          // Add standard installment (Principal + Interest + GST)
          totalMonthlyEmi += activeEmis[0].total_installment;
        }
      });

      // 5. Completion Percentage
      const totalEmisCount = allEmis.length;
      const paidEmisCount = allEmis.filter((e: any) => e.status === 'Paid').length;
      const completionPercentage = totalEmisCount > 0 ? roundTo2((paidEmisCount / totalEmisCount) * 100) : 0;

      setStats({
        totalOutstanding: roundTo2(totalOutstanding),
        totalMonthlyEmi: roundTo2(totalMonthlyEmi),
        totalInterestPayable: roundTo2(totalInterestPayable),
        totalGstPayable: roundTo2(totalGstPayable),
        totalProcessingFees: roundTo2(totalProcessingFees),
        activeLoansCount: activeCount,
        closedLoansCount: closedCount,
        upcomingThisMonthCount,
        overdueCount,
        completionPercentage,
        totalPaidAmount: roundTo2(totalPaidAmount),
        totalPendingAmount: roundTo2(totalPendingAmount),
        currency: predominantCurrency
      });

      // --- CHART DATA GENERATION ---
      
      // A. Outstanding vs Paid
      const outstandingVsPaid = [
        { name: 'Paid Amount', value: roundTo2(totalPaidAmount), color: '#10b981' },
        { name: 'Outstanding Amount', value: roundTo2(totalOutstanding), color: '#6366f1' }
      ];

      // B. Principal vs Interest vs GST
      let totalPrincipalPaid = 0;
      let totalInterestPaid = 0;
      let totalGstPaid = 0;

      allEmis.forEach((emi: any) => {
        if (emi.status === 'Paid' || emi.status === 'Partially Paid') {
          // Estimate proportional components for paid amounts
          const ratio = emi.amount_paid / emi.total_installment;
          totalPrincipalPaid += emi.principal_component * ratio;
          totalInterestPaid += emi.interest_component * ratio;
          totalGstPaid += emi.gst_on_interest * ratio;
        }
      });

      const breakdown = [
        { name: 'Principal', Paid: roundTo2(totalPrincipalPaid), Pending: roundTo2(Math.max(0, (totalOutstanding - totalInterestPayable - totalGstPayable))) },
        { name: 'Interest', Paid: roundTo2(totalInterestPaid), Pending: roundTo2(totalInterestPayable) },
        { name: 'GST on Interest', Paid: roundTo2(totalGstPaid), Pending: roundTo2(totalGstPayable) }
      ];

      // C. Monthly Outflow Trend (Grouped by Month-Year)
      const monthlyOutflowMap: { [key: string]: { dateStr: string; amount: number } } = {};
      allEmis.forEach((emi: any) => {
        if (emi.due_date) {
          const date = new Date(emi.due_date);
          if (!isNaN(date.getTime())) {
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyOutflowMap[key]) {
              monthlyOutflowMap[key] = {
                dateStr: date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
                amount: 0
              };
            }
            monthlyOutflowMap[key].amount += emi.total_installment;
          }
        }
      });

      const monthlyTrend = Object.keys(monthlyOutflowMap)
        .sort()
        .map(key => ({
          month: monthlyOutflowMap[key].dateStr,
          Outflow: roundTo2(monthlyOutflowMap[key].amount)
        }))
        .slice(0, 12); // Limit to next/past 12 months for readable chart

      // D. Person-wise Outstanding
      const personsRes = dbManager.runQuery("SELECT id, name FROM persons;");
      const personOutstanding: any[] = [];
      
      personsRes.forEach((p: any) => {
        let pOutstanding = 0;
        allEmis.forEach((emi: any) => {
          if (emi.loan_status === 'Active' && emi.status !== 'Paid') {
            if (emi.person_id === p.id) {
              pOutstanding += (emi.total_installment - emi.amount_paid);
            }
          }
        });
        
        if (pOutstanding > 0) {
          personOutstanding.push({
            name: p.name,
            Outstanding: roundTo2(pOutstanding)
          });
        }
      });

      setChartsData({
        outstandingVsPaid,
        breakdown,
        monthlyTrend,
        personOutstanding,
      });

      // Load detailed lists for drill-down and alerts
      const activeList = dbManager.runQuery(`
        SELECT l.*, p.name as person_name 
        FROM loans l 
        LEFT JOIN persons p ON l.person_id = p.id 
        WHERE l.status = 'Active'
        ORDER BY l.created_at DESC;
      `);
      
      const activeListWithDetails = activeList.map((loan: any) => {
        const { currency } = parseLoanNotes(loan.notes);
        const loanEmis = allEmis.filter((e: any) => e.loan_id === loan.id);
        const outstanding = loanEmis
          .filter((e: any) => e.status !== 'Paid')
          .reduce((sum: number, e: any) => sum + (e.total_installment - e.amount_paid), 0);
        const monthlyEmi = loanEmis.length > 0 ? loanEmis[0].total_installment : 0;
        return {
          ...loan,
          outstanding_balance: roundTo2(outstanding),
          monthly_emi: roundTo2(monthlyEmi),
          currencyCode: currency
        };
      });
      setActiveLoansList(activeListWithDetails);

      const overdueList = dbManager.runQuery(`
        SELECT e.*, l.purchase_name, l.lender_name, l.notes as loan_notes, p.name as person_name 
        FROM emi_schedule e 
        JOIN loans l ON e.loan_id = l.id 
        LEFT JOIN persons p ON l.person_id = p.id
        WHERE l.status = 'Active' AND e.status = 'Overdue'
        ORDER BY e.due_date ASC;
      `);
      setOverdueEmisList(overdueList);

      const upcomingList = dbManager.runQuery(`
        SELECT e.*, l.purchase_name, l.lender_name, l.notes as loan_notes, p.name as person_name 
        FROM emi_schedule e 
        JOIN loans l ON e.loan_id = l.id 
        LEFT JOIN persons p ON l.person_id = p.id
        WHERE l.status = 'Active' AND e.status != 'Paid'
        ORDER BY e.due_date ASC;
      `).filter((emi: any) => {
        if (!emi.due_date) return false;
        const dueDate = new Date(emi.due_date);
        return !isNaN(dueDate.getTime()) && 
               dueDate.getFullYear() === currentYear && 
               (dueDate.getMonth() + 1) === currentMonth;
      });
      setUpcomingEmisList(upcomingList);

    } catch (e) {
      console.error('Error loading dashboard data:', e);
    }
  };

  return (
    <div className="animate-fade dashboard-page">
      {/* 12 Metric Cards */}
      <div className="dashboard-grid">
        <div className="card widget-card clickable" onClick={() => setModalType('outstanding')} title="Click to view Outstanding Balance Breakdown">
          <div className="widget-icon" style={{ backgroundColor: 'var(--status-active-bg)', color: 'var(--status-active)' }}>
            <Wallet size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Outstanding Balance</span>
            <span className="widget-value">{formatINR(stats.totalOutstanding, stats.currency)}</span>
          </div>
        </div>

        <div className="card widget-card clickable" onClick={() => setModalType('emi')} title="Click to view Monthly EMI Breakdown">
          <div className="widget-icon" style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#6366f1' }}>
            <TrendingUp size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Monthly EMI Total</span>
            <span className="widget-value">{formatINR(stats.totalMonthlyEmi, stats.currency)}</span>
          </div>
        </div>

        <div className="card widget-card">
          <div className="widget-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
            <Percent size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Interest Payable</span>
            <span className="widget-value">{formatINR(stats.totalInterestPayable, stats.currency)}</span>
          </div>
        </div>

        <div className="card widget-card">
          <div className="widget-icon" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
            <TrendingUp size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">GST Payable</span>
            <span className="widget-value">{formatINR(stats.totalGstPayable, stats.currency)}</span>
          </div>
        </div>

        <div className="card widget-card">
          <div className="widget-icon" style={{ backgroundColor: 'rgba(8, 145, 178, 0.1)', color: '#0891b2' }}>
            <DollarSign size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Processing Fees</span>
            <span className="widget-value">{formatINR(stats.totalProcessingFees, stats.currency)}</span>
          </div>
        </div>

        <div className="card widget-card clickable" onClick={() => setModalType('active')} title="Click to view Active Loans">
          <div className="widget-icon" style={{ backgroundColor: 'var(--status-active-bg)', color: 'var(--status-active)' }}>
            <Briefcase size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Active Loans</span>
            <span className="widget-value">{stats.activeLoansCount}</span>
          </div>
        </div>

        <div className="card widget-card">
          <div className="widget-icon" style={{ backgroundColor: 'var(--status-closed-bg)', color: 'var(--status-closed)' }}>
            <CheckCircle size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Closed Loans</span>
            <span className="widget-value">{stats.closedLoansCount}</span>
          </div>
        </div>

        <div className="card widget-card clickable" onClick={() => setModalType('upcoming')} title="Click to view Upcoming EMIs">
          <div className="widget-icon" style={{ backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#eab308' }}>
            <Clock size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Upcoming (Month)</span>
            <span className="widget-value">{stats.upcomingThisMonthCount}</span>
          </div>
        </div>

        <div className="card widget-card clickable" onClick={() => setModalType('overdue')} title="Click to view Overdue EMIs">
          <div className="widget-icon" style={{ backgroundColor: 'var(--status-overdue-bg)', color: 'var(--status-overdue)' }}>
            <AlertTriangle size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Overdue EMIs</span>
            <span className="widget-value" style={{ color: stats.overdueCount > 0 ? 'var(--status-overdue)' : 'inherit' }}>
              {stats.overdueCount}
            </span>
          </div>
        </div>

        <div className="card widget-card">
          <div className="widget-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <Percent size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">EMI Completed %</span>
            <span className="widget-value">{stats.completionPercentage}%</span>
          </div>
        </div>

        <div className="card widget-card">
          <div className="widget-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <CheckCircle size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Total Paid Amount</span>
            <span className="widget-value" style={{ color: '#10b981' }}>{formatINR(stats.totalPaidAmount, stats.currency)}</span>
          </div>
        </div>

        <div className="card widget-card">
          <div className="widget-icon" style={{ backgroundColor: 'rgba(100, 116, 139, 0.1)', color: '#64748b' }}>
            <Clock size={24} />
          </div>
          <div className="widget-info">
            <span className="widget-label">Total Pending Amount</span>
            <span className="widget-value">{formatINR(stats.totalPendingAmount, stats.currency)}</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid-cols-12" style={{ marginBottom: '2rem' }}>
        <div className="col-span-6 card">
          <div className="card-header">
            <h3 className="card-title">Outstanding vs Paid Outflow</h3>
          </div>
          <div style={{ width: '100%', height: 300 }}>
            {stats.totalOutstanding === 0 && stats.totalPaidAmount === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                No active loan data to display chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartsData.outstandingVsPaid}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartsData.outstandingVsPaid.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatINR(Number(value), stats.currency)} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="col-span-6 card">
          <div className="card-header">
            <h3 className="card-title">Principal vs Interest vs GST Breakdown</h3>
          </div>
          <div style={{ width: '100%', height: 300 }}>
            {stats.totalOutstanding === 0 && stats.totalPaidAmount === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                No active loan data to display chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartsData.breakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-secondary)" />
                  <YAxis stroke="var(--text-secondary)" tickFormatter={(v) => `${getCurrencySymbol(stats.currency)}${v/1000}k`} />
                  <Tooltip formatter={(value: any) => formatINR(Number(value), stats.currency)} />
                  <Legend />
                  <Bar dataKey="Paid" stackId="a" fill="#10b981" />
                  <Bar dataKey="Pending" stackId="a" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="col-span-8 card">
          <div className="card-header">
            <h3 className="card-title">Monthly EMI Outflow Trend</h3>
          </div>
          <div style={{ width: '100%', height: 320 }}>
            {chartsData.monthlyTrend.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                No EMI schedule to plot outflow trend.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartsData.monthlyTrend}>
                  <defs>
                    <linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" stroke="var(--text-secondary)" />
                  <YAxis stroke="var(--text-secondary)" tickFormatter={(v) => `${getCurrencySymbol(stats.currency)}${v/1000}k`} />
                  <Tooltip formatter={(value: any) => formatINR(Number(value), stats.currency)} />
                  <Area type="monotone" dataKey="Outflow" stroke="#6366f1" fillOpacity={1} fill="url(#colorOutflow)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="col-span-4 card">
          <div className="card-header">
            <h3 className="card-title">Person Wise Outstanding</h3>
          </div>
          <div style={{ width: '100%', height: 320 }}>
            {chartsData.personOutstanding.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                No outstanding balances for other people.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartsData.personOutstanding} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" stroke="var(--text-secondary)" tickFormatter={(v) => `${getCurrencySymbol(stats.currency)}${v/1000}k`} />
                  <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" width={80} />
                  <Tooltip formatter={(value: any) => formatINR(Number(value), stats.currency)} />
                  <Legend />
                  <Bar dataKey="Outstanding" fill="#0891b2" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>



      {/* Drill-down Modals */}
      {modalType !== null && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setModalType(null)}>
          <div className="modal-content animate-scale" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 650 }}>
            <div className="modal-header">
              <h3 className="card-title">
                {modalType === 'active' && 'Active Loans List'}
                {modalType === 'overdue' && 'Overdue EMIs Detail'}
                {modalType === 'upcoming' && 'Upcoming EMIs (This Month)'}
                {modalType === 'outstanding' && 'Outstanding Balance Breakdown'}
                {modalType === 'emi' && 'Monthly EMI Commitment Breakdown'}
              </h3>
              <button className="btn btn-secondary btn-circle" onClick={() => setModalType(null)} style={{ width: 32, height: 32 }}>
                <X size={16} />
              </button>
            </div>
            
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
              {modalType === 'active' && (
                activeLoansList.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No active loans found.</p>
                ) : (
                  activeLoansList.map(loan => (
                    <div 
                      key={loan.id} 
                      className="card" 
                      onClick={() => { onSelectLoan(loan.id); setModalType(null); }}
                      style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px solid var(--border)' }}
                    >
                      <div>
                        <strong style={{ display: 'block', fontSize: '1rem' }}>{loan.purchase_name}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {loan.lender_name} • For {loan.person_name || 'N/A'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'block', fontWeight: 700, color: 'var(--primary)' }}>
                          {formatINR(loan.loan_amount - (loan.down_payment || 0), loan.currencyCode)}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {loan.interest_rate}% • {loan.period_months} mo
                        </span>
                      </div>
                    </div>
                  ))
                )
              )}

              {modalType === 'outstanding' && (
                activeLoansList.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No active loans found.</p>
                ) : (
                  activeLoansList.map(loan => (
                    <div 
                      key={loan.id} 
                      className="card" 
                      onClick={() => { onSelectLoan(loan.id); setModalType(null); }}
                      style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px solid var(--border)' }}
                    >
                      <div>
                        <strong style={{ display: 'block', fontSize: '1rem' }}>{loan.purchase_name}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {loan.lender_name} • For {loan.person_name || 'N/A'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'block', fontWeight: 700, color: 'var(--primary)' }}>
                          {formatINR(loan.outstanding_balance, loan.currencyCode)}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {loan.interest_rate}% • {loan.period_months} mo
                        </span>
                      </div>
                    </div>
                  ))
                )
              )}

              {modalType === 'emi' && (
                activeLoansList.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No active loans found.</p>
                ) : (
                  activeLoansList.map(loan => (
                    <div 
                      key={loan.id} 
                      className="card" 
                      onClick={() => { onSelectLoan(loan.id); setModalType(null); }}
                      style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px solid var(--border)' }}
                    >
                      <div>
                        <strong style={{ display: 'block', fontSize: '1rem' }}>{loan.purchase_name}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {loan.lender_name} • For {loan.person_name || 'N/A'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'block', fontWeight: 700, color: 'var(--primary)' }}>
                          {formatINR(loan.monthly_emi, loan.currencyCode)}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {loan.interest_rate}% • {loan.period_months} mo
                        </span>
                      </div>
                    </div>
                  ))
                )
              )}

              {modalType === 'overdue' && (
                overdueEmisList.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No overdue EMIs! Great job.</p>
                ) : (
                  overdueEmisList.map(emi => {
                    const { currency } = parseLoanNotes(emi.loan_notes);
                    return (
                      <div 
                        key={emi.id} 
                        className="card" 
                        onClick={() => { onSelectLoan(emi.loan_id); setModalType(null); }}
                        style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px dotted var(--status-overdue)' }}
                      >
                        <div>
                          <strong style={{ display: 'block', fontSize: '1rem', color: 'var(--status-overdue)' }}>
                            {emi.purchase_name} (EMI #{emi.emi_number})
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Due date: {emi.due_date} • {emi.lender_name}
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ display: 'block', fontWeight: 700, color: 'var(--status-overdue)' }}>
                            {formatINR(emi.total_installment, currency)}
                          </span>
                          <span className="badge badge-overdue" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', marginTop: '0.2rem' }}>
                            Overdue
                          </span>
                        </div>
                      </div>
                    );
                  })
                )
              )}

              {modalType === 'upcoming' && (
                upcomingEmisList.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No upcoming EMIs due this calendar month.</p>
                ) : (
                  upcomingEmisList.map(emi => {
                    const { currency } = parseLoanNotes(emi.loan_notes);
                    return (
                      <div 
                        key={emi.id} 
                        className="card" 
                        onClick={() => { onSelectLoan(emi.loan_id); setModalType(null); }}
                        style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', border: '1px solid var(--border)' }}
                      >
                        <div>
                          <strong style={{ display: 'block', fontSize: '1rem' }}>
                            {emi.purchase_name} (EMI #{emi.emi_number})
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Due date: {emi.due_date} • {emi.lender_name}
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ display: 'block', fontWeight: 700 }}>
                            {formatINR(emi.total_installment, currency)}
                          </span>
                          <span className="badge badge-pending" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', marginTop: '0.2rem' }}>
                            Upcoming
                          </span>
                        </div>
                      </div>
                    );
                  })
                )
              )}
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalType(null)}>
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
