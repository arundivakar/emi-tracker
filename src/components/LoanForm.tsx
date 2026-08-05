import React, { useState, useEffect } from 'react';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { generateAmortizationSchedule, parseLoanNotes, serializeLoanNotes } from '../utils/calculator';
import { Plus, X, AlertCircle, Landmark, CreditCard, FileText, Calendar, Coins, Keyboard, Info, Check } from 'lucide-react';
import { rescheduleAllEmiNotifications } from '../utils/notifications';

interface LoanFormProps {
  onSuccess: (loanId: number) => void;
  onCancel: () => void;
  editLoanId?: number;
}

const getCurrencySymbol = (currency: string) => {
  switch (currency) {
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'AED': return 'د.إ';
    default: return '₹';
  }
};

export const LoanForm: React.FC<LoanFormProps> = ({ onSuccess, onCancel, editLoanId }) => {
  const { triggerRefresh } = useDatabase();
  const [persons, setPersons] = useState<any[]>([]);
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Form Fields & States
  const [loanCategoryTab, setLoanCategoryTab] = useState<'indian' | 'creditcard' | 'other'>('indian');
  const [purchaseName, setPurchaseName] = useState('');
  const [personId, setPersonId] = useState<number>(1);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState('INR');
  const [loanType, setLoanType] = useState('fixed');
  const [loanAmount, setLoanAmount] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [periodMonths, setPeriodMonths] = useState('');
  const [processingFee, setProcessingFee] = useState('');
  const [gstProcessingFeeRate, setGstProcessingFeeRate] = useState('18');
  const [notes, setNotes] = useState('');
  const [emiStartDate, setEmiStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  
  const [lenderName, setLenderName] = useState('HDFC Bank');
  const [customLenderName, setCustomLenderName] = useState('');
  const [cardNickname, setCardNickname] = useState('');
  const [cardLast4, setCardLast4] = useState('');

  const lenders = [
    'HDFC Bank',
    'SBI',
    'ICICI Bank',
    'Axis Bank',
    'Kotak Bank',
    'Bajaj Finance',
    'Credit Card EMI',
    'Other'
  ];

  useEffect(() => {
    loadPersons();
  }, []);

  useEffect(() => {
    if (editLoanId) {
      loadLoanForEditing();
    }
  }, [editLoanId]);

  const loadLoanForEditing = () => {
    try {
      const res = dbManager.runQuery('SELECT * FROM loans WHERE id = ?;', [editLoanId]);
      if (res.length > 0) {
        const loan = res[0];
        setPurchaseName(loan.purchase_name);
        setPersonId(loan.person_id);
        setPurchaseDate(loan.purchase_date);
        setLoanAmount(String(loan.loan_amount));
        setInterestRate(String(loan.interest_rate));
        setPeriodMonths(String(loan.period_months));
        setProcessingFee(String(loan.processing_fee || ''));
        setGstProcessingFeeRate(String(loan.gst_processing_fee_rate || '18'));
        setDownPayment(String(loan.down_payment || ''));
        setEmiStartDate(loan.emi_start_date);
        
        if (lenders.includes(loan.lender_name)) {
          setLenderName(loan.lender_name);
          if (loan.lender_name === 'Credit Card EMI') {
            setLoanCategoryTab('creditcard');
          } else {
            setLoanCategoryTab('indian');
          }
        } else {
          setLenderName('Other');
          setCustomLenderName(loan.lender_name);
          setLoanCategoryTab('other');
        }
        
        // Parse metadata (notes & currency)
        const parsed = parseLoanNotes(loan.notes);
        setNotes(parsed.notesText);
        setCurrency(parsed.currency);
        setCardNickname(parsed.cardNickname || '');
        setCardLast4(parsed.cardLast4 || '');
      }
    } catch (e) {
      console.error('Failed to load loan for editing:', e);
    }
  };

  const loadPersons = () => {
    try {
      const res = dbManager.runQuery('SELECT * FROM persons ORDER BY name ASC;');
      setPersons(res);
      const selfPerson = res.find((p: any) => p.name.toLowerCase() === 'self');
      if (selfPerson) {
        setPersonId(selfPerson.id);
      } else if (res.length > 0) {
        setPersonId(res[0].id);
      }
    } catch (e) {
      console.error('Failed to load persons:', e);
    }
  };

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonName.trim()) return;

    try {
      const res = await dbManager.executeSql('INSERT INTO persons (name) VALUES (?);', [newPersonName.trim()]);
      setNewPersonName('');
      setShowPersonModal(false);
      loadPersons();
      setPersonId(res.lastInsertRowid);
      triggerRefresh();
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE')) {
        alert('This person name already exists!');
      } else {
        console.error('Failed to insert person:', err);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const pv = parseFloat(loanAmount);
    const rate = parseFloat(interestRate);
    const period = parseInt(periodMonths);
    const down = parseFloat(downPayment || '0');
    const fee = parseFloat(processingFee || '0');
    const feeGst = parseFloat(gstProcessingFeeRate || '18');

    if (!purchaseName.trim()) {
      setError('Purchase Name is required.');
      return;
    }
    if (isNaN(pv) || pv <= 0) {
      setError('Loan Amount must be a positive number.');
      return;
    }
    if (isNaN(rate) || rate < 0) {
      setError('Interest Rate must be 0 or positive.');
      return;
    }
    if (isNaN(period) || period <= 0) {
      setError('Repayment Period must be 1 month or more.');
      return;
    }
    if (down >= pv) {
      setError('Down Payment cannot be greater than or equal to the Loan Amount.');
      return;
    }

    const lender = lenderName === 'Other' ? customLenderName.trim() : lenderName;
    if (!lender) {
      setError('Please specify the Lender Name.');
      return;
    }

    const serializedNotes = serializeLoanNotes(
      notes.trim(),
      currency,
      loanCategoryTab === 'creditcard' ? cardNickname.trim() : undefined,
      loanCategoryTab === 'creditcard' ? cardLast4.trim() : undefined
    );

    try {
      if (editLoanId) {
        // 1. Update Loan row
        const updateLoanSql = `
          UPDATE loans SET
            purchase_name = ?, person_id = ?, purchase_date = ?, loan_amount = ?, 
            interest_rate = ?, period_months = ?, processing_fee = ?, 
            gst_processing_fee_rate = ?, down_payment = ?, emi_start_date = ?, 
            lender_name = ?, notes = ?
          WHERE id = ?;
        `;
        await dbManager.executeSql(updateLoanSql, [
          purchaseName.trim(),
          personId,
          purchaseDate,
          pv,
          rate,
          period,
          fee,
          feeGst,
          down,
          emiStartDate,
          lender,
          serializedNotes,
          editLoanId
        ]);

        // 2. Retrieve old schedule to preserve statuses
        const oldSchedule = dbManager.runQuery(
          'SELECT emi_number, status, payment_date, amount_paid, remarks FROM emi_schedule WHERE loan_id = ?;',
          [editLoanId]
        );

        // Delete existing schedule
        await dbManager.executeSql('DELETE FROM emi_schedule WHERE loan_id = ?;', [editLoanId]);

        // Generate new schedule
        const schedule = generateAmortizationSchedule(pv, down, rate, period, emiStartDate);

        // Re-insert new schedule rows, carrying over matches
        for (const row of schedule) {
          const oldEmi = oldSchedule.find((o: any) => o.emi_number === row.emi_number);
          let status = 'Pending';
          let amountPaid = 0;
          let paymentDate = null;
          let remarks = null;

          if (oldEmi) {
            status = oldEmi.status;
            paymentDate = oldEmi.payment_date;
            remarks = oldEmi.remarks;
            if (oldEmi.status === 'Paid') {
              amountPaid = row.total_installment;
            } else if (oldEmi.status === 'Partially Paid') {
              amountPaid = oldEmi.amount_paid;
            } else if (oldEmi.status === 'Overdue') {
              const todayStr = new Date().toISOString().split('T')[0];
              status = row.due_date < todayStr ? 'Overdue' : 'Pending';
            }
          } else {
            const todayStr = new Date().toISOString().split('T')[0];
            if (row.due_date < todayStr) {
              status = 'Overdue';
            }
          }

          const insertEmiSql = `
            INSERT INTO emi_schedule (
              loan_id, emi_number, due_date, opening_balance, principal_component,
              interest_component, gst_on_interest, total_installment, closing_balance,
              status, amount_paid, payment_date, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
          `;
          await dbManager.executeSql(insertEmiSql, [
            editLoanId,
            row.emi_number,
            row.due_date,
            row.opening_balance,
            row.principal_component,
            row.interest_component,
            row.gst_on_interest,
            row.total_installment,
            row.closing_balance,
            status,
            amountPaid,
            paymentDate,
            remarks
          ]);
        }

        // 3. Reschedule active local notifications
        const activeLoans = dbManager.runQuery("SELECT * FROM loans WHERE status = 'Active';");
        const emiSchedules = dbManager.runQuery("SELECT * FROM emi_schedule;");
        await rescheduleAllEmiNotifications(activeLoans, emiSchedules);

        triggerRefresh();
        onSuccess(editLoanId);
        return;
      }

      // 1. Insert Loan row
      const insertLoanSql = `
        INSERT INTO loans (
          purchase_name, person_id, purchase_date, loan_amount, interest_rate, 
          period_months, processing_fee, gst_processing_fee_rate, down_payment, 
          emi_start_date, lender_name, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active');
      `;

      const loanResult = await dbManager.executeSql(insertLoanSql, [
        purchaseName.trim(),
        personId,
        purchaseDate,
        pv,
        rate,
        period,
        fee,
        feeGst,
        down,
        emiStartDate,
        lender,
        serializedNotes
      ]);

      const newLoanId = loanResult.lastInsertRowid;

      // 2. Generate Schedule & Insert Rows
      const schedule = generateAmortizationSchedule(pv, down, rate, period, emiStartDate);

      for (const row of schedule) {
        const insertEmiSql = `
          INSERT INTO emi_schedule (
            loan_id, emi_number, due_date, opening_balance, principal_component,
            interest_component, gst_on_interest, total_installment, closing_balance,
            status, amount_paid
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0);
        `;
        await dbManager.executeSql(insertEmiSql, [
          newLoanId,
          row.emi_number,
          row.due_date,
          row.opening_balance,
          row.principal_component,
          row.interest_component,
          row.gst_on_interest,
          row.total_installment,
          row.closing_balance
        ]);
      }

      // 3. Reschedule active local notifications
      const activeLoans = dbManager.runQuery("SELECT * FROM loans WHERE status = 'Active';");
      const emiSchedules = dbManager.runQuery("SELECT * FROM emi_schedule;");
      await rescheduleAllEmiNotifications(activeLoans, emiSchedules);

      triggerRefresh();
      onSuccess(newLoanId);
    } catch (err) {
      console.error('Failed to create loan and schedule:', err);
      setError('An error occurred while saving the loan. Please try again.');
    }
  };

  return (
    <div className="card animate-scale fintech-form-card" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="fintech-form-header">
        <div>
          <h2 className="fintech-form-title">{editLoanId ? 'Edit Loan / EMI Purchase' : 'Add New Loan / EMI Purchase'}</h2>
          <p className="fintech-form-subtext">Track your loan or EMI purchase details</p>
        </div>
        <button className="btn-close-circle" type="button" onClick={onCancel} title="Close Form">
          <X size={18} />
        </button>
      </div>

      {error && (
        <div className="fintech-error-banner">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Styled Tabs */}
      <div className="fintech-tabs-selectors">
        <button
          type="button"
          className={`tab-selector-btn ${loanCategoryTab === 'indian' ? 'active' : ''}`}
          onClick={() => {
            setLoanCategoryTab('indian');
            setLenderName('HDFC Bank');
          }}
        >
          <Landmark size={16} />
          <span>Indian Loan</span>
        </button>
        <button
          type="button"
          className={`tab-selector-btn ${loanCategoryTab === 'creditcard' ? 'active' : ''}`}
          onClick={() => {
            setLoanCategoryTab('creditcard');
            setLenderName('Credit Card EMI');
          }}
        >
          <CreditCard size={16} />
          <span>Credit Card</span>
        </button>
        <button
          type="button"
          className={`tab-selector-btn ${loanCategoryTab === 'other' ? 'active' : ''}`}
          onClick={() => {
            setLoanCategoryTab('other');
            setLenderName('Other');
          }}
        >
          <FileText size={16} />
          <span>Other Loan</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="fintech-styled-form">
        {/* Section 1: Basic Information */}
        <div className="fintech-form-section">
          <div className="fintech-section-title">
            <span className="section-icon-badge"><FileText size={14} /></span>
            <span>Basic Information</span>
          </div>

          <div className="form-group">
            <label>Purchase Name / Loan Purpose*</label>
            <div className="fintech-input-wrapper suffix">
              <input
                type="text"
                className="form-control"
                placeholder="e.g. iPhone 16 Pro, MacBook Pro, Car, Bike, TV..."
                value={purchaseName}
                onChange={(e) => setPurchaseName(e.target.value)}
                required
              />
              <span className="input-suffix-icon"><Keyboard size={16} /></span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Lender / Bank Name*</label>
              {loanCategoryTab === 'creditcard' ? (
                <div className="fintech-input-wrapper">
                  <input
                    type="text"
                    className="form-control"
                    value="Credit Card EMI"
                    disabled
                  />
                </div>
              ) : loanCategoryTab === 'other' ? (
                <div className="fintech-input-wrapper">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Enter custom lender name"
                    value={customLenderName}
                    onChange={(e) => setCustomLenderName(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <div className="fintech-input-wrapper">
                  <select
                    className="form-control"
                    value={lenderName}
                    onChange={(e) => setLenderName(e.target.value)}
                  >
                    {lenders.filter(l => l !== 'Credit Card EMI').map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Track For (Person)*</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div className="fintech-input-wrapper" style={{ flex: 1 }}>
                  <select
                    className="form-control"
                    value={personId}
                    onChange={(e) => setPersonId(Number(e.target.value))}
                  >
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-plus-square"
                  style={{ height: '44px', width: '44px' }}
                  onClick={() => setShowPersonModal(true)}
                  title="Add New Profile"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Credit Card Details — shown only in credit card tab */}
          {loanCategoryTab === 'creditcard' && (
            <div className="form-row">
              <div className="form-group">
                <label>Card Nickname</label>
                <div className="fintech-input-wrapper suffix">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. HDFC Millennia, Axis Flipkart..."
                    value={cardNickname}
                    onChange={(e) => setCardNickname(e.target.value)}
                    maxLength={40}
                  />
                  <span className="input-suffix-icon"><CreditCard size={15} /></span>
                </div>
              </div>
              <div className="form-group">
                <label>Card Last 4 Digits</label>
                <div className="fintech-input-wrapper suffix">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 4242"
                    value={cardLast4}
                    onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    maxLength={4}
                    inputMode="numeric"
                  />
                  <span className="input-suffix-icon" style={{ fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>****</span>
                </div>
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Purchase Date*</label>
              <div className="fintech-input-wrapper prefix">
                <input
                  type="date"
                  className="form-control"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Currency*</label>
              <div className="fintech-input-wrapper">
                <select
                  className="form-control"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="INR">INR - Indian Rupee</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="AED">AED - UAE Dirham</option>
                </select>
              </div>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Loan Type*</label>
              <div className="fintech-input-wrapper">
                <select
                  className="form-control"
                  value={loanType}
                  onChange={(e) => setLoanType(e.target.value)}
                >
                  <option value="fixed">Fixed EMI Loan</option>
                  <option value="flexible">Flexible Loan</option>
                </select>
              </div>
            </div>
            
            <div className="form-group"></div>
          </div>
        </div>

        {/* Section 2: Loan Details */}
        <div className="fintech-form-section">
          <div className="fintech-section-title">
            <span className="section-icon-badge"><Coins size={14} /></span>
            <span>Loan Details</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Loan Amount (PV)*</label>
              <div className="fintech-input-wrapper prefix suffix">
                <span className="input-prefix-label">{getCurrencySymbol(currency)}</span>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  placeholder="e.g. 150000"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="input-suffix-btn"
                  onClick={() => setLoanAmount('500000')}
                >
                  Max
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Down Payment (If any)</label>
              <div className="fintech-input-wrapper prefix">
                <span className="input-prefix-label">{getCurrencySymbol(currency)}</span>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  placeholder="e.g. 20000"
                  value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Annual Interest Rate (%)*</label>
              <div className="fintech-input-wrapper prefix">
                <span className="input-prefix-label">%</span>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  placeholder="e.g. 13.5"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Repayment Period (Months)*</label>
              <div className="fintech-input-wrapper prefix suffix">
                <span className="input-prefix-icon" style={{ padding: '0 0.5rem 0 0.85rem' }}><Calendar size={15} /></span>
                <input
                  type="number"
                  className="form-control"
                  placeholder="e.g. 12"
                  value={periodMonths}
                  onChange={(e) => setPeriodMonths(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="input-suffix-btn"
                  onClick={() => setPeriodMonths('120')}
                >
                  Max
                </button>
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Processing Fee (If any)</label>
              <div className="fintech-input-wrapper prefix">
                <span className="input-prefix-label">{getCurrencySymbol(currency)}</span>
                <input
                  type="number"
                  step="0.01"
                  className="form-control"
                  placeholder="e.g. 999"
                  value={processingFee}
                  onChange={(e) => setProcessingFee(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>EMI Start Date*</label>
              <div className="fintech-input-wrapper prefix">
                <input
                  type="date"
                  className="form-control"
                  value={emiStartDate}
                  onChange={(e) => setEmiStartDate(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <div className="fintech-info-banner">
          <Info size={16} />
          <span>All fields marked with * are required.</span>
        </div>

        <div className="fintech-form-footer">
          <button type="button" className="btn btn-secondary fintech-footer-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary fintech-footer-btn" style={{ gap: '0.4rem' }}>
            <Check size={18} />
            <span>Save Loan</span>
          </button>
        </div>
      </form>

      {/* Add Person Modal */}
      {showPersonModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-scale">
            <div className="modal-header">
              <h3 className="card-title">Create Person Profile</h3>
              <button className="btn btn-secondary btn-circle" onClick={() => setShowPersonModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddPerson}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Person Name*</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Pranav, Vishnu, Family Member, etc..."
                    value={newPersonName}
                    onChange={(e) => setNewPersonName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPersonModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
