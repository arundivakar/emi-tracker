import React, { useState, useEffect } from 'react';
import { calculateEmi, generateAmortizationSchedule, calculatePrepaymentImpact, formatINR, roundTo2 } from '../utils/calculator';
import { Info, Calculator, Sparkles } from 'lucide-react';

interface CalculatorsProps {
  defaultType?: 'emi' | 'prepay';
}

export const Calculators: React.FC<CalculatorsProps> = ({ defaultType = 'emi' }) => {
  const [calculatorType, setCalculatorType] = useState<'emi' | 'prepay'>(defaultType);

  useEffect(() => {
    setCalculatorType(defaultType);
  }, [defaultType]);

  // Standalone EMI Calculator states
  const [principal, setPrincipal] = useState('100000');
  const [rate, setRate] = useState('12');
  const [tenure, setTenure] = useState('24');
  const [emiResult, setEmiResult] = useState(0);
  const [totalInterest, setTotalInterest] = useState(0);
  const [totalGst, setTotalGst] = useState(0);
  const [totalOutflow, setTotalOutflow] = useState(0);

  // Standalone Prepayment states
  const [prepayPrincipal, setPrepayPrincipal] = useState('500000');
  const [prepayRate, setPrepayRate] = useState('10.5');
  const [prepayTenure, setPrepayTenure] = useState('120'); // 10 years
  const [prepayAmt, setPrepayAmt] = useState('100000');
  const [prepayMonth, setPrepayMonth] = useState('12'); // After 1st year
  const [prepayOption, setPrepayOption] = useState<'reduce_tenure' | 'reduce_emi'>('reduce_tenure');
  const [prepayResult, setPrepayResult] = useState<any>(null);

  useEffect(() => {
    runEmiCalculation();
  }, [principal, rate, tenure]);

  useEffect(() => {
    runPrepaymentCalculation();
  }, [prepayPrincipal, prepayRate, prepayTenure, prepayAmt, prepayMonth, prepayOption]);

  const runEmiCalculation = () => {
    const p = parseFloat(principal);
    const r = parseFloat(rate);
    const n = parseInt(tenure);

    if (isNaN(p) || isNaN(r) || isNaN(n) || p <= 0 || r < 0 || n <= 0) {
      setEmiResult(0);
      setTotalInterest(0);
      setTotalGst(0);
      setTotalOutflow(0);
      return;
    }

    const emi = calculateEmi(p, r, n);
    const schedule = generateAmortizationSchedule(p, 0, r, n, '2026-06-01');
    
    let interestSum = 0;
    let gstSum = 0;
    let outflowSum = 0;

    schedule.forEach(row => {
      interestSum += row.interest_component;
      gstSum += row.gst_on_interest;
      outflowSum += row.total_installment;
    });

    setEmiResult(emi);
    setTotalInterest(roundTo2(interestSum));
    setTotalGst(roundTo2(gstSum));
    setTotalOutflow(roundTo2(outflowSum));
  };

  const runPrepaymentCalculation = () => {
    const p = parseFloat(prepayPrincipal);
    const r = parseFloat(prepayRate);
    const n = parseInt(prepayTenure);
    const pAmt = parseFloat(prepayAmt);
    const pMonth = parseInt(prepayMonth);

    if (
      isNaN(p) || isNaN(r) || isNaN(n) || isNaN(pAmt) || isNaN(pMonth) ||
      p <= 0 || r < 0 || n <= 0 || pAmt <= 0 || pMonth <= 0 || pMonth >= n
    ) {
      setPrepayResult(null);
      return;
    }

    const originalSchedule = generateAmortizationSchedule(p, 0, r, n, '2026-06-01');
    
    // Find opening balance of the targeted month for prepayment
    const targetRow = originalSchedule.find(row => row.emi_number === pMonth);
    if (!targetRow) {
      setPrepayResult(null);
      return;
    }

    // Outstanding principal at the start of that month
    const outstanding = targetRow.opening_balance;
    const remainingTenure = n - pMonth + 1;

    if (pAmt >= outstanding) {
      // Prepayment closes the loan
      const origRemainingInterest = originalSchedule
        .filter(row => row.emi_number >= pMonth)
        .reduce((sum, row) => sum + row.interest_component, 0);
      const origRemainingGst = origRemainingInterest * 0.18;

      setPrepayResult({
        originalTotalPayments: originalSchedule.reduce((sum, row) => sum + row.total_installment, 0),
        originalTotalInterest: originalSchedule.reduce((sum, row) => sum + row.interest_component, 0),
        originalTotalGst: originalSchedule.reduce((sum, row) => sum + row.gst_on_interest, 0),
        newTotalPayments: originalSchedule.filter(row => row.emi_number < pMonth).reduce((sum, row) => sum + row.total_installment, 0) + outstanding + (outstanding * 0.18 * 0), // Simplistic close
        newTotalInterest: originalSchedule.filter(row => row.emi_number < pMonth).reduce((sum, row) => sum + row.interest_component, 0),
        newTotalGst: originalSchedule.filter(row => row.emi_number < pMonth).reduce((sum, row) => sum + row.gst_on_interest, 0),
        interestSaved: roundTo2(origRemainingInterest),
        gstSaved: roundTo2(origRemainingGst),
        totalSaved: roundTo2(origRemainingInterest + origRemainingGst),
        newTenureMonths: 0,
      });
      return;
    }

    const impact = calculatePrepaymentImpact(outstanding, r, remainingTenure, pAmt, prepayOption);
    setPrepayResult(impact);
  };

  return (
    <div className="animate-fade">
      {/* Tab Selector */}
      <div className="navigation-bar" style={{ marginBottom: '1.5rem' }}>
        <button
          className={`nav-item ${calculatorType === 'emi' ? 'active' : ''}`}
          onClick={() => setCalculatorType('emi')}
        >
          Standard EMI Calculator (with GST)
        </button>
        <button
          className={`nav-item ${calculatorType === 'prepay' ? 'active' : ''}`}
          onClick={() => setCalculatorType('prepay')}
        >
          Part Payment & Prepayment Simulator
        </button>
      </div>

      {/* 1. Standard EMI Calculator */}
      {calculatorType === 'emi' && (
        <div className="grid-cols-12">
          {/* Inputs Panel */}
          <div className="col-span-6 card">
            <div className="card-header" style={{ marginBottom: '1.25rem' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Calculator size={20} color="var(--primary)" /> Input Loan Parameters
              </h3>
            </div>
            
            <div className="form-group">
              <label>Loan Principal Amount (₹)</label>
              <input
                type="number"
                className="form-control"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                {['50k', '1L', '5L', '10L', '50L'].map((lbl) => {
                  const val = lbl.includes('k') 
                    ? 50000 
                    : parseFloat(lbl) * (lbl.includes('Cr') ? 10000000 : 100000);
                  return (
                    <button
                      key={lbl}
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: 4 }}
                      onClick={() => setPrincipal(String(val))}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label>Annual Interest Rate (%)</label>
              <input
                type="number"
                step="0.05"
                className="form-control"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                {['8%', '10%', '12%', '14%', '16%'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: 4 }}
                    onClick={() => setRate(val.replace('%', ''))}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Repayment Tenure (Months)</label>
              <input
                type="number"
                className="form-control"
                value={tenure}
                onChange={(e) => setTenure(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem' }}>
                {['6m', '12m', '24m', '36m', '60m', '120m'].map((lbl) => (
                  <button
                    key={lbl}
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', borderRadius: 4 }}
                    onClick={() => setTenure(lbl.replace('m', ''))}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Summary Card */}
          <div className="col-span-6 card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="card-header" style={{ marginBottom: '1.25rem' }}>
                <h3 className="card-title">EMI & Outflow Breakdown</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '1rem', backgroundColor: 'rgba(99, 102, 241, 0.08)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Monthly Base EMI:</span>
                    <strong style={{ fontSize: '1.4rem', color: 'var(--primary)', fontFamily: 'var(--font-display)', display: 'block' }}>
                      {formatINR(emiResult)}
                    </strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Interest + 18% GST:</span>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--status-partial)', display: 'block' }}>
                      +{formatINR(roundTo2(emiResult * 0.18))} (Max GST)
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Principal Financed:</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 700 }}>{formatINR(parseFloat(principal) || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Interest Payable:</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--status-partial)' }}>{formatINR(totalInterest)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Interest GST (18%):</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#8b5cf6' }}>{formatINR(totalGst)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Repayment Outflow:</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#10b981' }}>{formatINR(totalOutflow)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: 'var(--input-bg)', padding: '0.8rem', borderRadius: 10, fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '1.5rem' }}>
              <Info size={18} style={{ flexShrink: 0, color: 'var(--primary)' }} />
              <span>
                Calculated using reducing balance method. Standard GST of 18% is calculated monthly on the interest component, increasing your monthly outflow slightly.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Standalone Prepayment Simulator */}
      {calculatorType === 'prepay' && (
        <div className="grid-cols-12">
          {/* Inputs Panel */}
          <div className="col-span-5 card">
            <div className="card-header" style={{ marginBottom: '1.25rem' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={20} color="var(--primary)" /> Prepayment Parameters
              </h3>
            </div>

            <div className="form-group">
              <label>Original Loan Amount (₹)</label>
              <input
                type="number"
                className="form-control"
                value={prepayPrincipal}
                onChange={(e) => setPrepayPrincipal(e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Interest Rate (%)</label>
                <input
                  type="number"
                  step="0.05"
                  className="form-control"
                  value={prepayRate}
                  onChange={(e) => setPrepayRate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Tenure (Months)</label>
                <input
                  type="number"
                  className="form-control"
                  value={prepayTenure}
                  onChange={(e) => setPrepayTenure(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Prepayment Amount (₹)</label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="Lump sum amount"
                  value={prepayAmt}
                  onChange={(e) => setPrepayAmt(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Pay After (EMI Month)</label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="e.g. Month 12"
                  value={prepayMonth}
                  onChange={(e) => setPrepayMonth(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Prepayment Action Option</label>
              <select
                className="form-control"
                value={prepayOption}
                onChange={(e: any) => setPrepayOption(e.target.value)}
              >
                <option value="reduce_tenure">Reduce Tenure Period (Keep EMI Same)</option>
                <option value="reduce_emi">Reduce Monthly EMI (Keep Tenure Same)</option>
              </select>
            </div>
          </div>

          {/* Results Summary Card */}
          <div className="col-span-7 card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {prepayResult ? (
              <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
                <div className="card-header" style={{ padding: 0, marginBottom: '0.5rem' }}>
                  <h3 className="card-title">Savings & Impact Projections</h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ backgroundColor: 'var(--input-bg)', padding: '0.8rem', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Original Outflow:</span>
                    <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>{formatINR(prepayResult.originalTotalPayments)}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Interest: {formatINR(prepayResult.originalTotalInterest)} | GST: {formatINR(prepayResult.originalTotalGst)}
                    </span>
                  </div>

                  <div style={{ backgroundColor: 'rgba(99, 102, 241, 0.05)', padding: '0.8rem', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>New Outflow:</span>
                    <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary)' }}>
                      {formatINR(prepayResult.newTotalPayments)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Interest: {formatINR(prepayResult.newTotalInterest)} | GST: {formatINR(prepayResult.newTotalGst)}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: 10, alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block' }}>TOTAL INTEREST & GST SAVED:</span>
                    <strong style={{ fontSize: '1.4rem', color: '#10b981', fontFamily: 'var(--font-display)' }}>
                      {formatINR(prepayResult.totalSaved)}
                    </strong>
                  </div>
                  {prepayOption === 'reduce_tenure' ? (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block' }}>REDUCED TENURE TO:</span>
                      <strong style={{ fontSize: '1.2rem' }}>{prepayResult.newTenureMonths} Months</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>
                        (Saved {parseInt(prepayTenure) - parseInt(prepayMonth) - prepayResult.newTenureMonths + 1} Months)
                      </span>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block' }}>REDUCED MONTHLY EMI TO:</span>
                      <strong style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>{formatINR(prepayResult.newEmiAmount)}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>
                        (Earlier EMI: {formatINR(calculateEmi(parseFloat(prepayPrincipal), parseFloat(prepayRate), parseInt(prepayTenure)))})
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', backgroundColor: 'rgba(245, 158, 11, 0.05)', padding: '0.75rem', borderRadius: 8, fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 'auto' }}>
                  <Info size={16} style={{ flexShrink: 0, color: 'var(--status-partial)' }} />
                  <span>
                    GST on interest is calculated dynamically. When you prepay, the outstanding principal falls, which exponentially reduces interest and subsequently GST outflows!
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', padding: '2rem', textAlign: 'center' }}>
                Please enter valid prepayment details to view savings simulations.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
