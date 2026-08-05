import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { formatINR, roundTo2, parseLoanNotes } from '../utils/calculator';
import { CreditCard, Plus, Trash2, ChevronRight, User } from 'lucide-react';

interface PersonProfileProps {
  onSelectLoan: (id: number) => void;
}

export const PersonProfile: React.FC<PersonProfileProps> = ({ onSelectLoan }) => {
  const { refreshTrigger, triggerRefresh } = useDatabase();
  const [persons, setPersons] = useState<any[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [personStats, setPersonStats] = useState<any>({
    activeCount: 0,
    closedCount: 0,
    monthlyEmi: 0,
    outstanding: 0,
    totalInterest: 0,
    totalGst: 0,
    totalPaid: 0,
    currency: 'INR'
  });
  const [personLoans, setPersonLoans] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');

  useEffect(() => {
    loadPersons();
  }, [refreshTrigger]);

  useEffect(() => {
    if (selectedPersonId !== null) {
      loadPersonStats(selectedPersonId);
    }
  }, [selectedPersonId, refreshTrigger]);

  const loadPersons = () => {
    try {
      const res = dbManager.runQuery('SELECT * FROM persons ORDER BY name ASC;');
      setPersons(res);
      if (res.length > 0 && selectedPersonId === null) {
        const self = res.find((p: any) => p.name.toLowerCase() === 'self');
        setSelectedPersonId(self ? self.id : res[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadPersonStats = (pId: number) => {
    try {
      const loans = dbManager.runQuery('SELECT * FROM loans WHERE person_id = ? ORDER BY created_at DESC;', [pId]);
      setPersonLoans(loans);

      let activeCount = 0, closedCount = 0, monthlyEmi = 0, outstanding = 0;
      let totalInterest = 0, totalGst = 0, totalPaid = 0;

      loans.forEach((loan: any) => {
        if (loan.status === 'Active') activeCount++; else closedCount++;
        const emis = dbManager.runQuery('SELECT * FROM emi_schedule WHERE loan_id = ?;', [loan.id]);
        if (loan.status === 'Active' && emis.length > 0) monthlyEmi += emis[0].total_installment;
        emis.forEach((emi: any) => {
          totalPaid += emi.amount_paid;
          if (loan.status === 'Active' && emi.status !== 'Paid') {
            outstanding += (emi.total_installment - emi.amount_paid);
            totalInterest += emi.interest_component;
            totalGst += emi.gst_on_interest;
          }
        });
      });

      const currencyCounts: { [key: string]: number } = {};
      loans.forEach((loan: any) => {
        if (loan.status === 'Active') {
          const { currency } = parseLoanNotes(loan.notes);
          currencyCounts[currency] = (currencyCounts[currency] || 0) + 1;
        }
      });
      let predominantCurrency = 'INR', maxCount = 0;
      Object.keys(currencyCounts).forEach((curr) => {
        if (currencyCounts[curr] > maxCount) { maxCount = currencyCounts[curr]; predominantCurrency = curr; }
      });

      setPersonStats({
        activeCount, closedCount,
        monthlyEmi: roundTo2(monthlyEmi),
        outstanding: roundTo2(outstanding),
        totalInterest: roundTo2(totalInterest),
        totalGst: roundTo2(totalGst),
        totalPaid: roundTo2(totalPaid),
        currency: predominantCurrency,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonName.trim()) return;
    try {
      const res = await dbManager.executeSql('INSERT INTO persons (name) VALUES (?);', [newPersonName.trim()]);
      setNewPersonName('');
      setShowAddModal(false);
      triggerRefresh();
      setSelectedPersonId(res.lastInsertRowid);
    } catch (err: any) {
      if (err.message && err.message.includes('UNIQUE')) {
        alert('This person name already exists!');
      } else {
        console.error(err);
      }
    }
  };

  const handleDeletePerson = async () => {
    if (!selectedPersonId) return;
    const person = persons.find(p => p.id === selectedPersonId);
    if (!person) return;
    if (person.name.toLowerCase() === 'self') {
      alert('The default profile "Self" cannot be deleted.');
      return;
    }
    if (personLoans.length > 0) {
      alert(`Cannot delete "${person.name}". This profile has ${personLoans.length} loan(s). Please delete or reassign loans first.`);
      return;
    }
    if (!window.confirm(`Delete profile "${person.name}"?`)) return;
    try {
      await dbManager.executeSql('DELETE FROM persons WHERE id = ?;', [selectedPersonId]);
      setSelectedPersonId(null);
      loadPersons();
      triggerRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const selectedPerson = persons.find(p => p.id === selectedPersonId);

  return (
    <div className="pp-page animate-fade">

      {/* ── Person Selector Strip ── */}
      <div className="pp-selector-strip">
        <div className="pp-selector-scroll no-swipe">
          {persons.map((p) => (
            <button
              key={p.id}
              className={`pp-person-pill ${selectedPersonId === p.id ? 'active' : ''}`}
              onClick={() => setSelectedPersonId(p.id)}
            >
              <span className="pp-pill-avatar">{p.name.charAt(0).toUpperCase()}</span>
              <span className="pp-pill-name">{p.name}</span>
            </button>
          ))}
          <button className="pp-add-pill" onClick={() => setShowAddModal(true)} title="Add Profile">
            <Plus size={14} />
            <span>Add</span>
          </button>
        </div>
      </div>

      {selectedPerson ? (
        <div className="pp-content">

          {/* ── Profile Header ── */}
          <div className="pp-profile-header">
            <div className="pp-profile-avatar-lg">
              {selectedPerson.name.charAt(0).toUpperCase()}
            </div>
            <div className="pp-profile-info">
              <div className="pp-profile-name">{selectedPerson.name}</div>
              <div className="pp-profile-meta">
                {personStats.activeCount} active · {personStats.closedCount} closed · since {new Date(selectedPerson.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
              </div>
            </div>
            {selectedPerson.name.toLowerCase() !== 'self' && (
              <button className="pp-delete-btn" onClick={handleDeletePerson} title="Delete Profile">
                <Trash2 size={15} />
              </button>
            )}
          </div>

          {/* ── Compact Stats Row ── */}
          <div className="pp-stats-row">
            <div className="pp-stat-item">
              <span className="pp-stat-label">Monthly EMI</span>
              <span className="pp-stat-value">{formatINR(personStats.monthlyEmi, personStats.currency)}</span>
            </div>
            <div className="pp-stat-divider" />
            <div className="pp-stat-item">
              <span className="pp-stat-label">Outstanding</span>
              <span className="pp-stat-value pp-stat-alert">{formatINR(personStats.outstanding, personStats.currency)}</span>
            </div>
            <div className="pp-stat-divider" />
            <div className="pp-stat-item">
              <span className="pp-stat-label">Total Paid</span>
              <span className="pp-stat-value pp-stat-green">{formatINR(personStats.totalPaid, personStats.currency)}</span>
            </div>
          </div>

          {/* ── Loans List ── */}
          <div className="pp-loans-section">
            <div className="pp-loans-header">
              <span className="pp-loans-title">Loans & EMI Purchases</span>
              {personLoans.length > 0 && <span className="pp-loans-count">{personLoans.length}</span>}
            </div>

            {personLoans.length === 0 ? (
              <div className="pp-empty">
                <CreditCard size={28} />
                <span>No loans tracked for this person</span>
              </div>
            ) : (
              <div className="pp-loan-list">
                {personLoans.map((loan) => {
                  const { currency } = parseLoanNotes(loan.notes);
                  return (
                    <div key={loan.id} className="pp-loan-row" onClick={() => onSelectLoan(loan.id)}>
                      <div className="pp-loan-left">
                        <div className="pp-loan-name">{loan.purchase_name}</div>
                        <div className="pp-loan-meta">{loan.lender_name} · {loan.interest_rate}% p.a. · {loan.period_months} mo</div>
                      </div>
                      <div className="pp-loan-right">
                        <div className="pp-loan-amount">{formatINR(loan.loan_amount - (loan.down_payment || 0), currency)}</div>
                        <span className={`pp-loan-badge pp-badge-${loan.status.toLowerCase()}`}>{loan.status}</span>
                      </div>
                      <ChevronRight size={14} className="pp-loan-chevron" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="pp-empty pp-empty-full">
          <User size={32} />
          <span>Select a profile to view details</span>
        </div>
      )}

      {/* ── Add Profile Modal ── */}
      {showAddModal && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content animate-scale" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="card-title">Add Person Profile</h3>
              <button className="btn btn-secondary btn-circle" onClick={() => setShowAddModal(false)}>
                <XIcon size={16} />
              </button>
            </div>
            <form onSubmit={handleAddPerson}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Person Name*</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Vishnu, Pranav, Family Member"
                    value={newPersonName}
                    onChange={(e) => setNewPersonName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Profile</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const XIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
