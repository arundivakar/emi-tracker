import React, { useState, useEffect } from 'react';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { formatINR, roundTo2, calculateProcessingFee, calculateForeclosure, calculatePrepaymentImpact, parseLoanNotes, getCurrencySymbol } from '../utils/calculator';
import { Calendar, User, Landmark, Clock, Check, Edit2, RotateCcw, ShieldAlert, TrendingUp, Info, X, FileDown } from 'lucide-react';
import { rescheduleAllEmiNotifications } from '../utils/notifications';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface LoanDetailProps {
  loanId: number;
  onBack: () => void;
  onEdit: (loanId: number) => void;
}

export const LoanDetail: React.FC<LoanDetailProps> = ({ loanId, onBack, onEdit }) => {
  const { triggerRefresh, refreshTrigger } = useDatabase();
  const [loan, setLoan] = useState<any>(null);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'schedule' | 'foreclose' | 'prepay'>('schedule');
  const [expandedEmiId, setExpandedEmiId] = useState<number | null>(null);
  const [emiFilter, setEmiFilter] = useState<'all' | 'paid' | 'upcoming' | 'overdue'>('all');

  // Modal States
  const [showPartialModal, setShowPartialModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [activeEmiRow, setActiveEmiRow] = useState<any>(null);

  // Form states for modals
  const [partialAmount, setPartialAmount] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editStatus, setEditStatus] = useState('Paid');
  const [remarksText, setRemarksText] = useState('');

  // Advanced Calculator states
  const [foreclosureRate, setForeclosureRate] = useState('0');
  const [prepayAmount, setPrepayAmount] = useState('');
  const [prepayOption, setPrepayOption] = useState<'reduce_tenure' | 'reduce_emi'>('reduce_tenure');
  const [prepaySimulation, setPrepaySimulation] = useState<any>(null);

  useEffect(() => {
    loadLoanDetails();
  }, [loanId, refreshTrigger]);

  const loadLoanDetails = () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      
      // Auto-flag Overdue rows
      dbManager.runQuery(
        "UPDATE emi_schedule SET status = 'Overdue' WHERE loan_id = ? AND status = 'Pending' AND due_date < ?;",
        [loanId, todayStr]
      );
      // Auto-flag Pending if date is future but marked overdue (rare fallback)
      dbManager.runQuery(
        "UPDATE emi_schedule SET status = 'Pending' WHERE loan_id = ? AND status = 'Overdue' AND due_date >= ?;",
        [loanId, todayStr]
      );

      const loanData = dbManager.runQuery(`
        SELECT l.*, p.name as person_name 
        FROM loans l 
        LEFT JOIN persons p ON l.person_id = p.id 
        WHERE l.id = ?;
      `, [loanId]);

      if (loanData.length > 0) {
        setLoan(loanData[0]);
      }

      const scheduleData = dbManager.runQuery(
        'SELECT * FROM emi_schedule WHERE loan_id = ? ORDER BY emi_number ASC;',
        [loanId]
      );
      setSchedule(scheduleData);
    } catch (e) {
      console.error('Failed to load loan detail:', e);
    }
  };

  if (!loan) {
    return <div className="card">Loading loan details...</div>;
  }

  // Calculate high-level visual progress statistics
  const { notesText, currency, cardNickname, cardLast4 } = parseLoanNotes(loan.notes);
  const totalEmisCount = schedule.length;
  const paidEmis = schedule.filter(e => e.status === 'Paid');
  const paidEmisCount = paidEmis.length;
  
  const totalLoanAmount = loan.loan_amount;
  const downPayment = loan.down_payment || 0;
  const principalFinanced = totalLoanAmount - downPayment;
  
  const totalPrincipalPaid = paidEmis.reduce((sum, e) => sum + e.principal_component, 0);
  const remainingPrincipal = Math.max(0, principalFinanced - totalPrincipalPaid);

  // Total extra payable (interest + GST + processing fee) over entire schedule
  const totalScheduleInterest = schedule.reduce((sum, e) => sum + e.interest_component, 0);
  const totalScheduleGst = schedule.reduce((sum, e) => sum + e.gst_on_interest, 0);

  const emiProgressPct = totalEmisCount > 0 ? roundTo2((paidEmisCount / totalEmisCount) * 100) : 0;


  const nextEmi = schedule.find(e => e.status !== 'Paid');

  // Calculate processing fees
  const feeDetails = calculateProcessingFee(loan.loan_amount, loan.processing_fee, loan.gst_processing_fee_rate);

  // --- ROW ACTIONS ---

  const handleMarkAsPaid = async (emi: any) => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await dbManager.executeSql(
        "UPDATE emi_schedule SET status = 'Paid', amount_paid = ?, payment_date = ? WHERE id = ?;",
        [emi.total_installment, todayStr, emi.id]
      );
      checkAndCloseLoan();
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAsPartiallyPaid = (emi: any) => {
    setActiveEmiRow(emi);
    setPartialAmount('');
    setShowPartialModal(true);
  };

  const submitPartialPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const paid = parseFloat(partialAmount);
    if (isNaN(paid) || paid <= 0 || paid >= activeEmiRow.total_installment) {
      alert(`Please enter a valid amount between ₹0.01 and ₹${activeEmiRow.total_installment - 0.01}`);
      return;
    }

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await dbManager.executeSql(
        "UPDATE emi_schedule SET status = 'Partially Paid', amount_paid = ?, payment_date = ? WHERE id = ?;",
        [roundTo2(paid), todayStr, activeEmiRow.id]
      );
      setShowPartialModal(false);
      checkAndCloseLoan();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUndoPayment = async (emi: any) => {
    try {
      await dbManager.executeSql(
        "UPDATE emi_schedule SET status = 'Pending', amount_paid = 0, payment_date = NULL WHERE id = ?;",
        [emi.id]
      );
      // Re-evaluate if it should be overdue
      const todayStr = new Date().toISOString().split('T')[0];
      dbManager.runQuery(
        "UPDATE emi_schedule SET status = 'Overdue' WHERE id = ? AND due_date < ?;",
        [emi.id, todayStr]
      );
      // Set loan status back to Active if it was closed
      if (loan.status !== 'Active') {
        await dbManager.executeSql("UPDATE loans SET status = 'Active', closure_date = NULL WHERE id = ?;", [loanId]);
      }
      
      const activeLoans = dbManager.runQuery("SELECT * FROM loans WHERE status = 'Active';");
      const emiSchedules = dbManager.runQuery("SELECT * FROM emi_schedule;");
      await rescheduleAllEmiNotifications(activeLoans, emiSchedules);
      
      triggerRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditPayment = (emi: any) => {
    setActiveEmiRow(emi);
    setEditAmount(String(emi.amount_paid));
    setEditDate(emi.payment_date || new Date().toISOString().split('T')[0]);
    setEditStatus(emi.status);
    setShowEditModal(true);
  };

  const submitEditPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const paid = parseFloat(editAmount);
    if (isNaN(paid) || paid < 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    try {
      await dbManager.executeSql(
        "UPDATE emi_schedule SET status = ?, amount_paid = ?, payment_date = ? WHERE id = ?;",
        [editStatus, roundTo2(paid), editDate, activeEmiRow.id]
      );
      setShowEditModal(false);
      checkAndCloseLoan();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemarksModal = (emi: any) => {
    setActiveEmiRow(emi);
    setRemarksText(emi.remarks || '');
    setShowRemarksModal(true);
  };

  const submitRemarks = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await dbManager.executeSql("UPDATE emi_schedule SET remarks = ? WHERE id = ?;", [remarksText.trim() || null, activeEmiRow.id]);
      setShowRemarksModal(false);
      triggerRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const checkAndCloseLoan = async () => {
    try {
      const remainingUnpaid = dbManager.runQuery(
        "SELECT COUNT(*) as count FROM emi_schedule WHERE loan_id = ? AND status != 'Paid';",
        [loanId]
      );
      
      const unpaidCount = remainingUnpaid[0]?.count || 0;
      
      if (unpaidCount === 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        await dbManager.executeSql(
          "UPDATE loans SET status = 'Closed', closure_date = ? WHERE id = ?;",
          [todayStr, loanId]
        );
        alert('Congratulations! This loan has been completely closed!');
      } else {
        // If it was closed before and now has unpaid rows, revert to active
        await dbManager.executeSql(
          "UPDATE loans SET status = 'Active', closure_date = NULL WHERE id = ? AND status = 'Closed';",
          [loanId]
        );
      }
      
      const activeLoans = dbManager.runQuery("SELECT * FROM loans WHERE status = 'Active';");
      const emiSchedules = dbManager.runQuery("SELECT * FROM emi_schedule;");
      await rescheduleAllEmiNotifications(activeLoans, emiSchedules);

      triggerRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  // --- FORECLOSURE ---

  const getNextPendingEmiNum = () => {
    const nextPending = schedule.find(e => e.status !== 'Paid');
    return nextPending ? nextPending.emi_number : null;
  };

  const nextEmiNum = getNextPendingEmiNum();
  const foreclosureDetails = nextEmiNum !== null 
    ? calculateForeclosure(schedule, nextEmiNum, parseFloat(foreclosureRate || '0'))
    : null;

  const handleExecuteForeclosure = async () => {
    if (!foreclosureDetails || !nextEmiNum) return;
    
    const confirmText = `Are you sure you want to FORECLOSE this loan?\nYou will make a final payment of ${formatINR(foreclosureDetails.totalForeclosureAmount, currency)} instead of remaining EMIs.\nThis will save you ${formatINR(foreclosureDetails.totalSaved, currency)} in interest & GST!`;
    if (!window.confirm(confirmText)) return;

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      
      // 1. Mark next EMI as foreclosed/paid with final amount
      await dbManager.executeSql(
        "UPDATE emi_schedule SET status = 'Paid', amount_paid = ?, payment_date = ?, remarks = 'Foreclosure Payment' WHERE loan_id = ? AND emi_number = ?;",
        [foreclosureDetails.totalForeclosureAmount, todayStr, loanId, nextEmiNum]
      );

      // 2. Mark remaining EMIs (if any) as Skipped
      await dbManager.executeSql(
        "UPDATE emi_schedule SET status = 'Skipped', amount_paid = 0, payment_date = NULL, remarks = 'Skipped due to Foreclosure' WHERE loan_id = ? AND emi_number > ?;",
        [loanId, nextEmiNum]
      );

      // 3. Mark Loan as Foreclosed
      await dbManager.executeSql(
        "UPDATE loans SET status = 'Foreclosed', closure_date = ? WHERE id = ?;",
        [todayStr, loanId]
      );

      alert('Loan successfully foreclosed!');
      triggerRefresh();
    } catch (e) {
      console.error('Foreclosure error:', e);
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const { currency } = parseLoanNotes(loan.notes);
    
    // Header
    doc.setFontSize(18);
    doc.text('Repayment Schedule', 14, 20);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Loan: ${loan.purchase_name}`, 14, 30);
    doc.text(`Lender: ${loan.lender_name}`, 14, 36);
    doc.text(`For: ${loan.person_name || 'Self'}`, 14, 42);
    
    doc.text(`Financed: ${formatINR(loan.loan_amount - (loan.down_payment || 0), currency)}`, 120, 30);
    doc.text(`Interest Rate: ${loan.interest_rate}% p.a.`, 120, 36);
    doc.text(`Tenure: ${loan.period_months} Months`, 120, 42);

    // Table Data
    const body = schedule.map(e => [
      e.emi_number,
      e.due_date || '-',
      formatINR(e.total_installment, currency),
      formatINR(e.principal_component, currency),
      formatINR(e.interest_component, currency),
      formatINR(e.closing_balance, currency),
      e.status
    ]);

    (doc as any).autoTable({
      head: [['EMI No', 'Due Date', 'Installment', 'Principal', 'Interest', 'Balance', 'Status']],
      body,
      startY: 50,
      theme: 'striped',
      headStyles: { fillColor: [99, 102, 241] }, // Indigo-500
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 15 },
        6: { fontStyle: 'bold' }
      }
    });

    const safeName = loan.purchase_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`repayment_schedule_${safeName}.pdf`);
  };

  // --- PREPAYMENT ---

  const handleRunPrepaymentSim = () => {
    if (!prepayAmount || isNaN(parseFloat(prepayAmount))) return;
    const nextPendingRow = schedule.find(e => e.status !== 'Paid');
    if (!nextPendingRow) return;

    // Remaining Months count
    const remainingMonths = schedule.filter(e => e.status !== 'Paid').length;

    const sim = calculatePrepaymentImpact(
      nextPendingRow.opening_balance,
      loan.interest_rate,
      remainingMonths,
      parseFloat(prepayAmount),
      prepayOption
    );
    setPrepaySimulation(sim);
  };

  const filteredSchedule = schedule.filter(e => {
    if (emiFilter === 'all') return true;
    if (emiFilter === 'paid') return e.status === 'Paid';
    if (emiFilter === 'overdue') return e.status === 'Overdue';
    if (emiFilter === 'upcoming') return e.status === 'Pending';
    return true;
  });

  const paidCount = schedule.filter(e => e.status === 'Paid').length;
  const overdueCount = schedule.filter(e => e.status === 'Overdue').length;
  const upcomingCount = schedule.filter(e => e.status === 'Pending').length;

  const statusBadgeClass = (s: string) => {
    switch (s) {
      case 'Paid': return 'ld-badge-paid';
      case 'Overdue': return 'ld-badge-overdue';
      case 'Partially Paid': return 'ld-badge-partial';
      default: return 'ld-badge-pending';
    }
  };

  return (
    <div className="animate-fade ld-page">
      {/* ── PAGE HEADER ── */}
      <div className="ld-header">
        <button className="ld-back-btn" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>
        <h1 className="ld-header-title">Loan Details</h1>
        <div className="ld-header-actions">
          <button className="ld-edit-btn" onClick={handleExportPDF} style={{ marginRight: '0.5rem', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            <FileDown size={14} /> Export PDF
          </button>
          <button className="ld-edit-btn" onClick={() => onEdit(loan.id)}>
            <Edit2 size={14} /> Edit Loan
          </button>
          <button className="ld-menu-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
        </div>
      </div>

      {/* ── SINGLE SUMMARY CARD ── */}
      <div className="ld-summary-card">
        {/* Loan identity row */}
        <div className="ld-identity-row">
          <div className="ld-avatar">
            <Landmark size={20} />
          </div>
          <div className="ld-identity-info">
            <div className="ld-loan-name">{loan.purchase_name}</div>
            <div className="ld-loan-meta">
              <span>{loan.lender_name}</span>
              <span className="ld-dot">•</span>
              <User size={12} />
              <span>{loan.person_name || 'Self'}</span>
            </div>
          </div>
          <div className="ld-status-group">
            {loan.status === 'Active' && <span className="ld-status-badge ld-s-active">ACTIVE</span>}
            {loan.status === 'Closed' && <span className="ld-status-badge ld-s-closed">CLOSED</span>}
            {loan.status === 'Foreclosed' && <span className="ld-status-badge ld-s-foreclosed">FORECLOSED</span>}
          </div>
        </div>

        {/* 4-column stats grid */}
        <div className="ld-stats-grid">
          <div className="ld-stat">
            <span className="ld-stat-label">Next EMI Due</span>
            {nextEmi ? (
              <>
                <span className="ld-stat-value ld-val-primary" style={{ color: nextEmi.status === 'Overdue' ? 'var(--status-overdue)' : 'var(--primary)' }}>
                  {formatINR(nextEmi.total_installment, currency)}
                </span>
                <span className="ld-stat-sub">{nextEmi.due_date}</span>
              </>
            ) : (
              <span className="ld-stat-value" style={{ color: 'var(--status-closed)', fontSize: 16 }}>All Paid ✓</span>
            )}
          </div>
          <div className="ld-stat">
            <span className="ld-stat-label">Outstanding</span>
            <span className="ld-stat-value">{formatINR(remainingPrincipal, currency)}</span>
          </div>
          <div className="ld-stat">
            <span className="ld-stat-label">EMIs Paid</span>
            <span className="ld-stat-value">{paidEmisCount} / {totalEmisCount}</span>
            <span className="ld-stat-sub">{emiProgressPct}%</span>
          </div>
          <div className="ld-stat">
            <span className="ld-stat-label">Remaining</span>
            <span className="ld-stat-value">{totalEmisCount - paidEmisCount}</span>
            <span className="ld-stat-sub">Months</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="ld-progress-track">
          <div className="ld-progress-fill" style={{ width: `${emiProgressPct}%` }} />
        </div>
        <div className="ld-progress-pct">{emiProgressPct}%</div>

        {/* Action buttons */}
        {nextEmi && nextEmi.status !== 'Paid' && (
          <div className="ld-action-row">
            <button className="ld-btn-full" onClick={() => handleMarkAsPaid(nextEmi)}>
              <Check size={16} /> Pay Full
            </button>
            <button className="ld-btn-partial" onClick={() => handleMarkAsPartiallyPaid(nextEmi)}>
              <Clock size={16} /> Pay Partial
            </button>
          </div>
        )}
      </div>

      {/* ── LOAN DETAILS CARD ── */}
      <div className="ld-details-card">
        <div className="ld-details-header">
          <div className="ld-details-title">
            <Calendar size={15} />
            <span>Loan Details</span>
          </div>
          <span className="ld-lender-badge">
            <Landmark size={12} /> {loan.lender_name}
          </span>
        </div>

        <div className="ld-details-grid">
          <div className="ld-detail-item">
            <span className="ld-detail-label">Loan Amount</span>
            <span className="ld-detail-value">{formatINR(loan.loan_amount, currency)}</span>
          </div>
          <div className="ld-detail-item">
            <span className="ld-detail-label">Interest Rate</span>
            <span className="ld-detail-value">{loan.interest_rate}% p.a.</span>
          </div>
          <div className="ld-detail-item">
            <span className="ld-detail-label">Tenure</span>
            <span className="ld-detail-value">{loan.period_months} Months</span>
          </div>
          <div className="ld-detail-item">
            <span className="ld-detail-label">EMI Amount</span>
            <span className="ld-detail-value" style={{ color: 'var(--primary)' }}>
              {nextEmi ? formatINR(nextEmi.total_installment, currency) : '—'}
            </span>
          </div>
          <div className="ld-detail-item">
            <span className="ld-detail-label">Start Date</span>
            <span className="ld-detail-value">{loan.emi_start_date}</span>
          </div>
          <div className="ld-detail-item">
            <span className="ld-detail-label">Purchase Date</span>
            <span className="ld-detail-value">{loan.purchase_date}</span>
          </div>
          <div className="ld-detail-item">
            <span className="ld-detail-label">Down Payment</span>
            <span className="ld-detail-value">{formatINR(loan.down_payment || 0, currency)}</span>
          </div>
          <div className="ld-detail-item">
            <span className="ld-detail-label">Track For</span>
            <span className="ld-detail-value">{loan.person_name || 'Self'}</span>
          </div>
          <div className="ld-detail-item">
            <span className="ld-detail-label">Processing Fee</span>
            <span className="ld-detail-value">{formatINR(feeDetails.processingFee, currency)}</span>
          </div>
          <div className="ld-detail-item">
            <span className="ld-detail-label">GST on Fee ({loan.gst_processing_fee_rate}%)</span>
            <span className="ld-detail-value">{formatINR(feeDetails.gstOnFee, currency)}</span>
          </div>
          {/* Total Extra Payable — replaces old 'Total Charges' */}
          <div className="ld-detail-item" style={{ gridColumn: '1 / -1', borderTop: '1px dashed var(--border)', paddingTop: '0.5rem', marginTop: '0.1rem' }}>
            <span className="ld-detail-label" style={{ fontWeight: 600 }}>Total Extra Payable</span>
            <span className="ld-detail-value" style={{ color: 'var(--status-overdue)', fontWeight: 700 }}>
              {formatINR(totalScheduleInterest + totalScheduleGst + feeDetails.totalFeeCharges, currency)}
            </span>
          </div>
          <div className="ld-detail-item" style={{ gridColumn: '1 / -1', fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '-0.3rem' }}>
            <span>Interest {formatINR(totalScheduleInterest, currency)} + GST {formatINR(totalScheduleGst, currency)} + Processing {formatINR(feeDetails.totalFeeCharges, currency)}</span>
          </div>
          {/* Credit card details if available */}
          {cardNickname && (
            <div className="ld-detail-item">
              <span className="ld-detail-label">Card Used</span>
              <span className="ld-detail-value">{cardNickname}{cardLast4 ? ` ••••${cardLast4}` : ''}</span>
            </div>
          )}
        </div>

        {notesText && (
          <div className="ld-notes-row">
            <Info size={14} />
            <span>{notesText}</span>
          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div className="ld-tabs">
        <button
          className={`ld-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >Schedule</button>
        {loan.status === 'Active' && (
          <>
            <button
              className={`ld-tab-btn ${activeTab === 'foreclose' ? 'active' : ''}`}
              onClick={() => setActiveTab('foreclose')}
            >Foreclosure</button>
            <button
              className={`ld-tab-btn ${activeTab === 'prepay' ? 'active' : ''}`}
              onClick={() => setActiveTab('prepay')}
            >Prepayment</button>
          </>
        )}
      </div>

      {/* ── SCHEDULE TAB ── */}
      {activeTab === 'schedule' && (
        <div className="ld-schedule-card animate-fade">
          {/* Filter chips */}
          <div className="ld-filter-row">
            {([
              ['all', `All (${schedule.length})`],
              ['paid', `Paid (${paidCount})`],
              ['upcoming', `Upcoming (${upcomingCount})`],
              ['overdue', `Overdue (${overdueCount})`],
            ] as [typeof emiFilter, string][]).map(([key, label]) => (
              <button
                key={key}
                className={`ld-chip ${emiFilter === key ? 'active' : ''} ${key === 'overdue' && overdueCount > 0 ? 'ld-chip-danger' : ''}`}
                onClick={() => setEmiFilter(key)}
              >{label}</button>
            ))}
          </div>

          {/* Mobile-first EMI list — no table, no horizontal scroll */}
          <div className="emi-list">
            {/* Column header row */}
            <div className="emi-col-header">
              <span className="emih-num">#</span>
              <span className="emih-date">Due Date</span>
              <span className="emih-amount">EMI Amount</span>
              <span className="emih-status">Status</span>
              <span className="emih-arrow"></span>
            </div>

            {filteredSchedule.map((emi) => {
              const isExpanded = expandedEmiId === emi.id;
              return (
                <div
                  key={emi.id}
                  className={`emi-row-wrap ${emi.status === 'Overdue' ? 'emi-overdue' : emi.status === 'Partially Paid' ? 'emi-partial' : ''}`}
                >
                  {/* Collapsed row — 5 columns, fits screen */}
                  <div
                    className="emi-row"
                    onClick={() => setExpandedEmiId(isExpanded ? null : emi.id)}
                  >
                    <span className="emi-num">#{emi.emi_number}</span>
                    <span className="emi-date">{emi.due_date}</span>
                    <span className="emi-amount">{formatINR(emi.total_installment, currency)}</span>
                    <span className="emi-status-cell">
                      <span className={`ld-badge ${statusBadgeClass(emi.status)}`}>{emi.status}</span>
                    </span>
                    <span className={`ld-chevron ${isExpanded ? 'open' : ''} emi-row-arrow`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                    </span>
                  </div>

                  {/* Expanded section — vertical, 2-col grid */}
                  {isExpanded && (
                    <div className="emi-expand animate-fade">
                      <div className="emi-expand-grid">
                        <div className="emi-expand-cell">
                          <span className="emi-exp-label">Opening Balance</span>
                          <span className="emi-exp-value">{formatINR(emi.opening_balance, currency)}</span>
                        </div>
                        <div className="emi-expand-cell">
                          <span className="emi-exp-label">Principal Component</span>
                          <span className="emi-exp-value">{formatINR(emi.principal_component, currency)}</span>
                        </div>
                        <div className="emi-expand-cell">
                          <span className="emi-exp-label">Interest Component</span>
                          <span className="emi-exp-value">{formatINR(emi.interest_component, currency)}</span>
                        </div>
                        <div className="emi-expand-cell">
                          <span className="emi-exp-label">GST on Interest</span>
                          <span className="emi-exp-value">{formatINR(emi.gst_on_interest, currency)}</span>
                        </div>
                        <div className="emi-expand-cell">
                          <span className="emi-exp-label">Closing Balance</span>
                          <span className="emi-exp-value">{formatINR(emi.closing_balance, currency)}</span>
                        </div>
                        <div className="emi-expand-cell">
                          <span className="emi-exp-label">Payment Date</span>
                          <span className="emi-exp-value">{emi.payment_date || '—'}</span>
                        </div>
                        <div className="emi-expand-cell">
                          <span className="emi-exp-label">Amount Paid</span>
                          <span className="emi-exp-value" style={{ color: emi.amount_paid > 0 ? '#16A34A' : 'var(--text-primary)' }}>
                            {emi.amount_paid > 0 ? formatINR(emi.amount_paid, currency) : '—'}
                          </span>
                        </div>
                        <div className="emi-expand-cell">
                          <span className="emi-exp-label">Remarks</span>
                          <span className="emi-exp-value">{emi.remarks || '—'}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="emi-actions">
                        {emi.status !== 'Paid' && emi.status !== 'Skipped' && (
                          <>
                            <button
                              className="emi-act-btn emi-act-paid"
                              onClick={(ev) => { ev.stopPropagation(); handleMarkAsPaid(emi); }}
                            >
                              ✓ Mark Paid
                            </button>
                            <button
                              className="emi-act-btn emi-act-partial"
                              onClick={(ev) => { ev.stopPropagation(); handleMarkAsPartiallyPaid(emi); }}
                            >
                              % Part Pay
                            </button>
                          </>
                        )}
                        {(emi.status === 'Paid' || emi.status === 'Partially Paid') && (
                          <button
                            className="emi-act-btn emi-act-undo"
                            onClick={(ev) => { ev.stopPropagation(); handleUndoPayment(emi); }}
                          >
                            <RotateCcw size={14} /> Undo
                          </button>
                        )}
                        <button
                          className="emi-act-btn emi-act-note"
                          onClick={(ev) => { ev.stopPropagation(); handleRemarksModal(emi); }}
                        >
                          📝 Notes
                        </button>
                        <button
                          className="emi-act-btn emi-act-edit"
                          onClick={(ev) => { ev.stopPropagation(); handleEditPayment(emi); }}
                        >
                          ✏ Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="ld-table-footer">
            <Info size={13} />
            <span>Tap any row to expand details and actions.</span>
          </div>
        </div>
      )}

      {/* ── FORECLOSURE TAB ── */}
      {activeTab === 'foreclose' && (
        <div className="ld-details-card animate-fade">
          <div className="ld-details-header">
            <div className="ld-details-title"><ShieldAlert size={15} /><span>Foreclosure Calculator</span></div>
          </div>
          {foreclosureDetails ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem', backgroundColor: 'rgba(99,102,241,0.06)', borderRadius: 10, fontSize: 14 }}>
                <TrendingUp size={16} color="var(--primary)" />
                <span>Foreclosing at <strong>EMI #{nextEmiNum}</strong>. Remaining EMIs will be cancelled.</span>
              </div>
              <div className="form-group">
                <label>Foreclosure Penalty (%)</label>
                <input type="number" step="0.01" className="form-control" value={foreclosureRate} onChange={(e) => setForeclosureRate(e.target.value)} placeholder="e.g. 2" />
              </div>
              <div className="ld-details-grid">
                <div className="ld-detail-item">
                  <span className="ld-detail-label">Outstanding Principal</span>
                  <span className="ld-detail-value">{formatINR(foreclosureDetails.outstandingPrincipal, currency)}</span>
                </div>
                <div className="ld-detail-item">
                  <span className="ld-detail-label">Foreclosure Fee + GST</span>
                  <span className="ld-detail-value">{formatINR(foreclosureDetails.foreclosureCharges + foreclosureDetails.gstOnCharges, currency)}</span>
                </div>
                <div className="ld-detail-item">
                  <span className="ld-detail-label">Interest Saved</span>
                  <span className="ld-detail-value" style={{ color: '#10b981' }}>{formatINR(foreclosureDetails.interestSaved, currency)}</span>
                </div>
                <div className="ld-detail-item">
                  <span className="ld-detail-label">GST Saved</span>
                  <span className="ld-detail-value" style={{ color: '#10b981' }}>{formatINR(foreclosureDetails.gstSaved, currency)}</span>
                </div>
                <div className="ld-detail-item">
                  <span className="ld-detail-label">Net Savings</span>
                  <span className="ld-detail-value" style={{ color: '#10b981', fontWeight: 700 }}>{formatINR(foreclosureDetails.totalSaved, currency)}</span>
                </div>
                <div className="ld-detail-item">
                  <span className="ld-detail-label">Total Payoff Amount</span>
                  <span className="ld-detail-value" style={{ color: 'var(--primary)', fontWeight: 700 }}>{formatINR(foreclosureDetails.totalForeclosureAmount, currency)}</span>
                </div>
              </div>
              {foreclosureDetails.totalSaved <= 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', padding: '0.65rem', backgroundColor: 'var(--status-overdue-bg)', color: 'var(--status-overdue)', borderRadius: 8, fontSize: 14, alignItems: 'center' }}>
                  <ShieldAlert size={15} />
                  <span>Foreclosure penalty exceeds interest savings. Not recommended.</span>
                </div>
              )}
              <button className="btn btn-primary" onClick={handleExecuteForeclosure} style={{ width: '100%' }}>
                Execute Foreclosure &amp; Close Loan
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1.5rem', fontSize: 14 }}>
              All EMIs have been paid. Foreclosure not applicable.
            </div>
          )}
        </div>
      )}

      {/* ── PREPAYMENT TAB ── */}
      {activeTab === 'prepay' && (
        <div className="ld-details-card animate-fade">
          <div className="ld-details-header">
            <div className="ld-details-title"><TrendingUp size={15} /><span>Prepayment Simulator</span></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Part Payment Amount ({getCurrencySymbol(currency)})</label>
              <input type="number" className="form-control" placeholder="e.g. 50000" value={prepayAmount} onChange={(e) => setPrepayAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Impact Option</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: 14 }}>
                  <input type="radio" checked={prepayOption === 'reduce_tenure'} onChange={() => setPrepayOption('reduce_tenure')} />
                  Reduce Tenure (Keep EMI same)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: 14 }}>
                  <input type="radio" checked={prepayOption === 'reduce_emi'} onChange={() => setPrepayOption('reduce_emi')} />
                  Reduce EMI (Keep tenure same)
                </label>
              </div>
            </div>
            <button className="btn btn-secondary" onClick={handleRunPrepaymentSim}>Run Simulation</button>
            {prepaySimulation && (
              <div className="animate-fade ld-details-grid" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
                <div className="ld-detail-item">
                  <span className="ld-detail-label">Original Outflow</span>
                  <span className="ld-detail-value">{formatINR(prepaySimulation.originalTotalPayments, currency)}</span>
                </div>
                <div className="ld-detail-item">
                  <span className="ld-detail-label">New Outflow</span>
                  <span className="ld-detail-value" style={{ color: 'var(--primary)' }}>{formatINR(prepaySimulation.newTotalPayments, currency)}</span>
                </div>
                <div className="ld-detail-item">
                  <span className="ld-detail-label">Total Saved</span>
                  <span className="ld-detail-value" style={{ color: '#10b981', fontWeight: 700 }}>{formatINR(prepaySimulation.totalSaved, currency)}</span>
                </div>
                {prepayOption === 'reduce_tenure' ? (
                  <div className="ld-detail-item">
                    <span className="ld-detail-label">New Tenure</span>
                    <span className="ld-detail-value">{prepaySimulation.newTenureMonths} Months</span>
                  </div>
                ) : (
                  <div className="ld-detail-item">
                    <span className="ld-detail-label">New EMI</span>
                    <span className="ld-detail-value">{formatINR(prepaySimulation.newEmiAmount, currency)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODALS ─── */}

      {/* Partial Payment Modal */}
      {showPartialModal && activeEmiRow && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="card-title">Record Partial Payment (EMI #{activeEmiRow.emi_number})</h3>
              <button className="btn btn-secondary btn-circle" onClick={() => setShowPartialModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submitPartialPayment}>
              <div className="modal-body">
                <div style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                  Total Scheduled Installment Amount: <strong>{formatINR(activeEmiRow.total_installment, currency)}</strong>
                </div>
                <div className="form-group">
                  <label>Amount Paid ({getCurrencySymbol(currency)})*</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    placeholder="Enter amount less than installment"
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPartialModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Partial Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Edit Payment Details Modal */}
      {showEditModal && activeEmiRow && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="card-title">Edit Payment (EMI #{activeEmiRow.emi_number})</h3>
              <button className="btn btn-secondary btn-circle" onClick={() => setShowEditModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submitEditPayment}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Payment Status</label>
                  <select
                    className="form-control"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Overdue">Overdue</option>
                    <option value="Paid">Paid</option>
                    <option value="Partially Paid">Partially Paid</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount Paid ({getCurrencySymbol(currency)})*</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Payment Date*</label>
                  <input
                    type="date"
                    className="form-control"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Remarks Modal */}
      {showRemarksModal && activeEmiRow && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="card-title">Remarks for EMI #{activeEmiRow.emi_number}</h3>
              <button className="btn btn-secondary btn-circle" onClick={() => setShowRemarksModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={submitRemarks}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Remarks / Notes</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    placeholder="Enter any details (e.g. Paid using GPay, HDFC Debit card, transaction ID, delay reason...)"
                    value={remarksText}
                    onChange={(e) => setRemarksText(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowRemarksModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Remarks
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
