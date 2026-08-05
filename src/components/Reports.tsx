import React, { useState, useEffect } from 'react';
import { dbManager } from '../db/db';
import { useDatabase } from '../db/DatabaseContext';
import { formatINR, roundTo2, generateAmortizationSchedule, parseLoanNotes } from '../utils/calculator';
import { Download, Upload, FileText, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export const Reports: React.FC = () => {
  const { refreshTrigger, triggerRefresh } = useDatabase();
  const [reportType, setReportType] = useState<'monthly' | 'yearly' | 'person' | 'closure'>('monthly');
  const [currency, setCurrency] = useState('INR');

  // Report Data States
  const [monthlyRows, setMonthlyRows] = useState<any[]>([]);
  const [yearlyRows, setYearlyRows] = useState<any[]>([]);
  const [personRows, setPersonRows] = useState<any[]>([]);
  const [closureRows, setClosureRows] = useState<any[]>([]);

  // Import States
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importDataRows, setImportDataRows] = useState<any[]>([]);
  const [mappings, setMappings] = useState<{ [key: string]: string }>({
    purchase_name: '',
    person_name: '',
    loan_amount: '',
    interest_rate: '',
    period_months: '',
    emi_start_date: '',
    lender_name: ''
  });
  const [showImportWizard, setShowImportWizard] = useState(false);

  useEffect(() => {
    loadReportsData();
  }, [refreshTrigger, reportType]);

  const loadReportsData = () => {
    try {
      // Determine predominant currency of active loans
      const activeLoans = dbManager.runQuery("SELECT notes FROM loans WHERE status = 'Active';");
      const currencyCounts: { [key: string]: number } = {};
      activeLoans.forEach((loan: any) => {
        const { currency: curr } = parseLoanNotes(loan.notes);
        currencyCounts[curr] = (currencyCounts[curr] || 0) + 1;
      });
      let predominantCurrency = 'INR';
      let maxCount = 0;
      Object.keys(currencyCounts).forEach((curr) => {
        if (currencyCounts[curr] > maxCount) {
          maxCount = currencyCounts[curr];
          predominantCurrency = curr;
        }
      });
      setCurrency(predominantCurrency);

      if (reportType === 'monthly') {
        // Aggregate payment records by month
        const res = dbManager.runQuery(`
          SELECT SUBSTR(payment_date, 1, 7) as month_key,
                 SUM(principal_component * (amount_paid/total_installment)) as principal_paid,
                 SUM(interest_component * (amount_paid/total_installment)) as interest_paid,
                 SUM(gst_on_interest * (amount_paid/total_installment)) as gst_paid,
                 SUM(amount_paid) as total_paid
          FROM emi_schedule
          WHERE status IN ('Paid', 'Partially Paid')
          GROUP BY month_key
          ORDER BY month_key DESC;
        `);
        setMonthlyRows(res.filter((r: any) => r.month_key !== null));
      } else if (reportType === 'yearly') {
        // Aggregate payment records by year (including processing fees)
        const res = dbManager.runQuery(`
          SELECT SUBSTR(payment_date, 1, 4) as year_key,
                 SUM(principal_component * (amount_paid/total_installment)) as principal_paid,
                 SUM(interest_component * (amount_paid/total_installment)) as interest_paid,
                 SUM(gst_on_interest * (amount_paid/total_installment)) as gst_paid,
                 SUM(amount_paid) as total_paid
          FROM emi_schedule
          WHERE status IN ('Paid', 'Partially Paid')
          GROUP BY year_key
          ORDER BY year_key DESC;
        `);
        
        // Load processing fees separately
        const feesRes = dbManager.runQuery(`
          SELECT SUBSTR(purchase_date, 1, 4) as year_key,
                 SUM(processing_fee) as base_fee,
                 SUM(processing_fee * (gst_processing_fee_rate / 100)) as gst_fee
          FROM loans
          GROUP BY year_key;
        `);

        const formattedYearly = res.filter((r: any) => r.year_key !== null).map((r: any) => {
          const matchingFee = feesRes.find((f: any) => f.year_key === r.year_key);
          const baseFee = matchingFee?.base_fee || 0;
          const gstFee = matchingFee?.gst_fee || 0;
          return {
            ...r,
            processing_fees: baseFee + gstFee,
            total_outflow: r.total_paid + baseFee + gstFee
          };
        });
        setYearlyRows(formattedYearly);
      } else if (reportType === 'person') {
        // Aggregate active stats per person
        const res = dbManager.runQuery(`
          SELECT p.name as person_name,
                 COUNT(l.id) as total_loans,
                 SUM(CASE WHEN l.status = 'Active' THEN 1 ELSE 0 END) as active_loans,
                 SUM(CASE WHEN l.status = 'Active' THEN l.loan_amount - l.down_payment ELSE 0 END) as active_principal,
                 SUM(l.processing_fee + (l.processing_fee * l.gst_processing_fee_rate / 100)) as processing_fees
          FROM persons p
          LEFT JOIN loans l ON p.id = l.person_id
          GROUP BY p.id;
        `);
        
        const detailedPersonRows = res.map((person: any) => {
          // Fetch EMI payments/outstanding
          const emiRes = dbManager.runQuery(`
            SELECT SUM(e.amount_paid) as paid,
                   SUM(CASE WHEN l.status = 'Active' AND e.status != 'Paid' THEN (e.total_installment - e.amount_paid) ELSE 0 END) as outstanding
            FROM emi_schedule e
            JOIN loans l ON e.loan_id = l.id
            JOIN persons p ON l.person_id = p.id
            WHERE p.name = ?;
          `, [person.person_name]);

          return {
            ...person,
            paid_amount: emiRes[0]?.paid || 0,
            outstanding_amount: emiRes[0]?.outstanding || 0
          };
        });
        setPersonRows(detailedPersonRows);
      } else if (reportType === 'closure') {
        // Show loans closed and upcoming closures
        const closedRes = dbManager.runQuery(`
          SELECT purchase_name, lender_name, loan_amount, status, closure_date
          FROM loans
          WHERE status IN ('Closed', 'Foreclosed')
          ORDER BY closure_date DESC;
        `);

        const activeRes = dbManager.runQuery(`
          SELECT l.id, l.purchase_name, l.lender_name, l.loan_amount, l.emi_start_date, l.period_months
          FROM loans l
          WHERE l.status = 'Active';
        `);

        const closures = [...closedRes];

        activeRes.forEach((loan: any) => {
          // Find the last EMI due date
          const emis = dbManager.runQuery(
            'SELECT due_date FROM emi_schedule WHERE loan_id = ? ORDER BY emi_number DESC LIMIT 1;',
            [loan.id]
          );
          if (emis.length > 0) {
            closures.push({
              purchase_name: loan.purchase_name,
              lender_name: loan.lender_name,
              loan_amount: loan.loan_amount,
              status: 'Active',
              closure_date: emis[0].due_date // Projected closure date
            });
          }
        });

        setClosureRows(closures);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- EXPORTS ---

  const exportExcel = () => {
    let dataToExport: any[] = [];
    let title = 'EMI_Tracker_Report';

    if (reportType === 'monthly') {
      title = 'Monthly_Outflow_Report';
      dataToExport = monthlyRows.map(r => ({
        'Month': r.month_key,
        [`Principal Paid (${currency})`]: roundTo2(r.principal_paid),
        [`Interest Paid (${currency})`]: roundTo2(r.interest_paid),
        [`GST Paid (${currency})`]: roundTo2(r.gst_paid),
        [`Total Paid (${currency})`]: roundTo2(r.total_paid)
      }));
    } else if (reportType === 'yearly') {
      title = 'Yearly_Outflow_Report';
      dataToExport = yearlyRows.map(r => ({
        'Year': r.year_key,
        [`Principal Paid (${currency})`]: roundTo2(r.principal_paid),
        [`Interest Paid (${currency})`]: roundTo2(r.interest_paid),
        [`GST Paid (${currency})`]: roundTo2(r.gst_paid),
        [`Processing Fees Paid (${currency})`]: roundTo2(r.processing_fees),
        [`Total Outflow (${currency})`]: roundTo2(r.total_outflow)
      }));
    } else if (reportType === 'person') {
      title = 'Person_Wise_Report';
      dataToExport = personRows.map(r => ({
        'Person Name': r.person_name,
        'Total Loans': r.total_loans,
        'Active Loans': r.active_loans,
        [`Outstanding Balance (${currency})`]: roundTo2(r.outstanding_amount),
        [`Paid Amount (${currency})`]: roundTo2(r.paid_amount),
        [`Processing Charges (${currency})`]: roundTo2(r.processing_fees)
      }));
    } else if (reportType === 'closure') {
      title = 'Loan_Closure_Report';
      dataToExport = closureRows.map(r => ({
        'Purchase Name': r.purchase_name,
        'Lender Name': r.lender_name,
        [`Loan Amount (${currency})`]: r.loan_amount,
        'Status': r.status,
        'Closure Date': r.closure_date
      }));
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${title}.xlsx`);
  };

  const exportCSV = () => {
    let dataToExport: any[] = [];
    let title = 'EMI_Tracker_Report';

    if (reportType === 'monthly') {
      title = 'Monthly_Outflow_Report';
      dataToExport = monthlyRows.map(r => ({
        'Month': r.month_key,
        'Principal Paid': roundTo2(r.principal_paid),
        'Interest Paid': roundTo2(r.interest_paid),
        'GST Paid': roundTo2(r.gst_paid),
        'Total Paid': roundTo2(r.total_paid)
      }));
    } else if (reportType === 'yearly') {
      title = 'Yearly_Outflow_Report';
      dataToExport = yearlyRows.map(r => ({
        'Year': r.year_key,
        'Principal Paid': roundTo2(r.principal_paid),
        'Interest Paid': roundTo2(r.interest_paid),
        'GST Paid': roundTo2(r.gst_paid),
        'Processing Fees': roundTo2(r.processing_fees),
        'Total Outflow': roundTo2(r.total_outflow)
      }));
    } else if (reportType === 'person') {
      title = 'Person_Wise_Report';
      dataToExport = personRows.map(r => ({
        'Person Name': r.person_name,
        'Total Loans': r.total_loans,
        'Active Loans': r.active_loans,
        'Outstanding Balance': roundTo2(r.outstanding_amount),
        'Paid Amount': roundTo2(r.paid_amount),
        'Processing Charges': roundTo2(r.processing_fees)
      }));
    } else if (reportType === 'closure') {
      title = 'Loan_Closure_Report';
      dataToExport = closureRows.map(r => ({
        'Purchase Name': r.purchase_name,
        'Lender Name': r.lender_name,
        'Loan Amount': r.loan_amount,
        'Status': r.status,
        'Closure Date': r.closure_date
      }));
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const csv = XLSX.utils.sheet_to_csv(ws);
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${title}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    let title = 'EMI Tracker India - Report';
    let headers: string[][] = [];
    let body: any[][] = [];

    if (reportType === 'monthly') {
      title = 'Monthly Outflow Breakdown';
      headers = [['Month', 'Principal Paid', 'Interest Paid', 'GST Paid', 'Total Outflow']];
      body = monthlyRows.map(r => [
        r.month_key,
        formatINR(r.principal_paid, currency),
        formatINR(r.interest_paid, currency),
        formatINR(r.gst_paid, currency),
        formatINR(r.total_paid, currency)
      ]);
    } else if (reportType === 'yearly') {
      title = 'Yearly Outflow Breakdown';
      headers = [['Year', 'Principal Paid', 'Interest Paid', 'GST Paid', 'Processing Fees', 'Total Outflow']];
      body = yearlyRows.map(r => [
        r.year_key,
        formatINR(r.principal_paid, currency),
        formatINR(r.interest_paid, currency),
        formatINR(r.gst_paid, currency),
        formatINR(r.processing_fees, currency),
        formatINR(r.total_outflow, currency)
      ]);
    } else if (reportType === 'person') {
      title = 'Person-Wise Outflow Summary';
      headers = [['Person Profile', 'Total Loans', 'Active Loans', 'Outstanding Bal', 'Paid Amount', 'Proc. Charges']];
      body = personRows.map(r => [
        r.person_name,
        r.total_loans,
        r.active_loans,
        formatINR(r.outstanding_amount, currency),
        formatINR(r.paid_amount, currency),
        formatINR(r.processing_fees, currency)
      ]);
    } else if (reportType === 'closure') {
      title = 'Loan Closures & Projected Closures';
      headers = [['Purchase Name', 'Lender Name', 'Loan Amount', 'Status', 'Closure / Projected Date']];
      body = closureRows.map(r => [
        r.purchase_name,
        r.lender_name,
        formatINR(r.loan_amount, currency),
        r.status,
        r.closure_date
      ]);
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 21);

    (doc as any).autoTable({
      head: headers,
      body: body,
      startY: 25,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 9 }
    });

    doc.save(`${title.toLowerCase().replace(/ /g, '_')}.pdf`);
  };

  // --- IMPORTS ---

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setImportFile(file);

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
          
          if (data.length > 0) {
            const headers = data[0].map(h => String(h).trim());
            setImportHeaders(headers);
            
            // Map data rows as objects
            const rows = data.slice(1).map(row => {
              const obj: any = {};
              headers.forEach((h, i) => {
                obj[h] = row[i];
              });
              return obj;
            });
            setImportDataRows(rows);

            // Auto mapping search
            const autoMap = { ...mappings };
            headers.forEach(h => {
              const lower = h.toLowerCase();
              if (lower.includes('purchase') || lower.includes('item') || lower.includes('name')) {
                autoMap.purchase_name = h;
              } else if (lower.includes('person') || lower.includes('user') || lower.includes('name')) {
                autoMap.person_name = h;
              } else if (lower.includes('amount') || lower.includes('principal') || lower.includes('pv')) {
                autoMap.loan_amount = h;
              } else if (lower.includes('rate') || lower.includes('interest') || lower.includes('rate%')) {
                autoMap.interest_rate = h;
              } else if (lower.includes('months') || lower.includes('tenure') || lower.includes('period')) {
                autoMap.period_months = h;
              } else if (lower.includes('start') || lower.includes('first') || lower.includes('date')) {
                autoMap.emi_start_date = h;
              } else if (lower.includes('lender') || lower.includes('bank') || lower.includes('creditor')) {
                autoMap.lender_name = h;
              }
            });
            setMappings(autoMap);
            setShowImportWizard(true);
          }
        } catch (err) {
          console.error(err);
          alert('Failed to parse file. Make sure it is a valid Excel or CSV.');
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  const handleExecuteImport = async () => {
    // Validate mapping
    if (!mappings.purchase_name || !mappings.loan_amount || !mappings.interest_rate || !mappings.period_months || !mappings.emi_start_date || !mappings.lender_name) {
      alert('Please map all required fields marked with *');
      return;
    }

    try {
      let importCount = 0;

      for (const row of importDataRows) {
        const pName = String(row[mappings.purchase_name] || '').trim();
        const persName = String(row[mappings.person_name] || 'Self').trim();
        const pAmount = parseFloat(row[mappings.loan_amount]);
        const pRate = parseFloat(row[mappings.interest_rate]);
        const pPeriod = parseInt(row[mappings.period_months]);
        const pStartDate = String(row[mappings.emi_start_date] || '').trim();
        const pLender = String(row[mappings.lender_name] || 'Credit Card EMI').trim();

        if (!pName || isNaN(pAmount) || isNaN(pRate) || isNaN(pPeriod) || !pStartDate) {
          continue; // skip malformed row
        }

        // 1. Resolve Person ID
        let pId = 1; // default Self
        const checkPerson = dbManager.runQuery('SELECT id FROM persons WHERE name = ?;', [persName]);
        if (checkPerson.length > 0) {
          pId = checkPerson[0].id;
        } else {
          const newPerson = await dbManager.executeSql('INSERT INTO persons (name) VALUES (?);', [persName]);
          pId = newPerson.lastInsertRowid;
        }

        // 2. Insert Loan
        const loanRes = await dbManager.executeSql(`
          INSERT INTO loans (
            purchase_name, person_id, purchase_date, loan_amount, interest_rate,
            period_months, processing_fee, gst_processing_fee_rate, down_payment,
            emi_start_date, lender_name, notes, status
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 18, 0, ?, ?, 'Imported Data', 'Active');
        `, [
          pName,
          pId,
          new Date().toISOString().split('T')[0], // default purchase date to today
          pAmount,
          pRate,
          pPeriod,
          pStartDate,
          pLender
        ]);

        const newLoanId = loanRes.lastInsertRowid;

        // 3. Generate schedule
        const schedule = generateAmortizationSchedule(pAmount, 0, pRate, pPeriod, pStartDate);
        for (const erow of schedule) {
          await dbManager.executeSql(`
            INSERT INTO emi_schedule (
              loan_id, emi_number, due_date, opening_balance, principal_component,
              interest_component, gst_on_interest, total_installment, closing_balance,
              status, amount_paid
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0);
          `, [
            newLoanId,
            erow.emi_number,
            erow.due_date,
            erow.opening_balance,
            erow.principal_component,
            erow.interest_component,
            erow.gst_on_interest,
            erow.total_installment,
            erow.closing_balance
          ]);
        }

        importCount++;
      }

      alert(`Successfully imported ${importCount} loans!`);
      setShowImportWizard(false);
      setImportFile(null);
      triggerRefresh();
    } catch (err) {
      console.error(err);
      alert('Error during import execution. Check logs.');
    }
  };

  return (
    <div className="animate-fade">
      {/* Reports Navigation Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="navigation-bar" style={{ marginBottom: 0 }}>
          <button className={`nav-item ${reportType === 'monthly' ? 'active' : ''}`} onClick={() => setReportType('monthly')}>
            Monthly Cash Outflow
          </button>
          <button className={`nav-item ${reportType === 'yearly' ? 'active' : ''}`} onClick={() => setReportType('yearly')}>
            Yearly Tax & Cost Report
          </button>
          <button className={`nav-item ${reportType === 'person' ? 'active' : ''}`} onClick={() => setReportType('person')}>
            Person Wise Report
          </button>
          <button className={`nav-item ${reportType === 'closure' ? 'active' : ''}`} onClick={() => setReportType('closure')}>
            Loan Closure Forecast
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {/* Import file selector wrapper */}
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            <Upload size={16} /> Import Excel/CSV
            <input
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={handleImportFileChange}
              style={{ display: 'none' }}
            />
          </label>

          <button className="btn btn-primary" onClick={exportExcel} title="Export Excel">
            <Download size={16} /> Excel
          </button>
          <button className="btn btn-secondary" onClick={exportCSV} title="Export CSV">
            CSV
          </button>
          <button className="btn btn-secondary" onClick={exportPDF} title="Export PDF">
            <FileText size={16} /> PDF
          </button>
        </div>
      </div>

      {/* Monthly Outflow table */}
      {reportType === 'monthly' && (
        <div className="card animate-fade">
          <div className="card-header">
            <h3 className="card-title">Monthly Cash Outflows (Actually Paid)</h3>
          </div>
          {monthlyRows.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No recorded payments yet to compile monthly report.
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Principal component</th>
                    <th>Interest Paid</th>
                    <th>GST Paid</th>
                    <th>Total Outflow (Installments)</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map((row) => (
                    <tr key={row.month_key}>
                      <td>{row.month_key}</td>
                      <td>{formatINR(row.principal_paid, currency)}</td>
                      <td>{formatINR(row.interest_paid, currency)}</td>
                      <td>{formatINR(row.gst_paid, currency)}</td>
                      <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatINR(row.total_paid, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Yearly Report Table */}
      {reportType === 'yearly' && (
        <div className="card animate-fade">
          <div className="card-header">
            <h3 className="card-title">Yearly Costs & Interest Outlays</h3>
          </div>
          {yearlyRows.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No recorded payments yet to compile yearly report.
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Principal Paid</th>
                    <th>Interest Component</th>
                    <th>GST Component</th>
                    <th>Processing Charges Paid</th>
                    <th>Total Capital Outflow</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyRows.map((row) => (
                    <tr key={row.year_key}>
                      <td>{row.year_key}</td>
                      <td>{formatINR(row.principal_paid, currency)}</td>
                      <td>{formatINR(row.interest_paid, currency)}</td>
                      <td>{formatINR(row.gst_paid, currency)}</td>
                      <td>{formatINR(row.processing_fees, currency)}</td>
                      <td style={{ fontWeight: 700, color: '#10b981' }}>{formatINR(row.total_outflow, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Person Wise Report Table */}
      {reportType === 'person' && (
        <div className="card animate-fade">
          <div className="card-header">
            <h3 className="card-title">Person Wise Outstandings & Totals</h3>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Person Name</th>
                  <th>Total Loans</th>
                  <th>Active Loans</th>
                  <th>Outstanding Balance</th>
                  <th>Paid Amount</th>
                  <th>Processing Charges Paid</th>
                </tr>
              </thead>
              <tbody>
                {personRows.map((row) => (
                  <tr key={row.person_name}>
                    <td><strong>{row.person_name}</strong></td>
                    <td>{row.total_loans}</td>
                    <td>{row.active_loans}</td>
                    <td style={{ color: 'var(--status-overdue)', fontWeight: 600 }}>{formatINR(row.outstanding_amount, currency)}</td>
                    <td style={{ color: 'var(--status-paid)', fontWeight: 600 }}>{formatINR(row.paid_amount, currency)}</td>
                    <td>{formatINR(row.processing_fees, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closure Report Table */}
      {reportType === 'closure' && (
        <div className="card animate-fade">
          <div className="card-header">
            <h3 className="card-title">Completed & Upcoming Closure Timeline</h3>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Purchase Name</th>
                  <th>Lender</th>
                  <th>Loan Amount</th>
                  <th>Status</th>
                  <th>Closure / Projected Date</th>
                </tr>
              </thead>
              <tbody>
                {closureRows.map((row, idx) => (
                  <tr key={idx}>
                    <td><strong>{row.purchase_name}</strong></td>
                    <td>{row.lender_name}</td>
                    <td>{formatINR(row.loan_amount, currency)}</td>
                    <td>
                      {row.status === 'Active' ? (
                        <span className="badge badge-active">Projected Active</span>
                      ) : (
                        <span className="badge badge-closed">{row.status}</span>
                      )}
                    </td>
                    <td>{row.closure_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Columns Mapper Wizard Modal */}
      {showImportWizard && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 650 }}>
            <div className="modal-header">
              <h3 className="card-title">Map Imported File Columns</h3>
              <button className="btn btn-secondary btn-circle" onClick={() => setShowImportWizard(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem', backgroundColor: 'var(--input-bg)', padding: '0.8rem', borderRadius: 8, fontSize: '0.8rem' }}>
                <Info size={16} style={{ color: 'var(--primary)' }} />
                <span>
                  Match columns from your uploaded file ({importFile?.name}) to the fields needed by the calculator.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Purchase Name*</label>
                  <select
                    className="form-control"
                    value={mappings.purchase_name}
                    onChange={(e) => setMappings({ ...mappings, purchase_name: e.target.value })}
                  >
                    <option value="">-- Choose Column --</option>
                    {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Track for (Person Profile)</label>
                  <select
                    className="form-control"
                    value={mappings.person_name}
                    onChange={(e) => setMappings({ ...mappings, person_name: e.target.value })}
                  >
                    <option value="">-- Default (Self) --</option>
                    {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Loan Amount (PV)*</label>
                  <select
                    className="form-control"
                    value={mappings.loan_amount}
                    onChange={(e) => setMappings({ ...mappings, loan_amount: e.target.value })}
                  >
                    <option value="">-- Choose Column --</option>
                    {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Interest Rate (%)*</label>
                  <select
                    className="form-control"
                    value={mappings.interest_rate}
                    onChange={(e) => setMappings({ ...mappings, interest_rate: e.target.value })}
                  >
                    <option value="">-- Choose Column --</option>
                    {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Repayment Tenure (Months)*</label>
                  <select
                    className="form-control"
                    value={mappings.period_months}
                    onChange={(e) => setMappings({ ...mappings, period_months: e.target.value })}
                  >
                    <option value="">-- Choose Column --</option>
                    {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>EMI Start Date*</label>
                  <select
                    className="form-control"
                    value={mappings.emi_start_date}
                    onChange={(e) => setMappings({ ...mappings, emi_start_date: e.target.value })}
                  >
                    <option value="">-- Choose Column --</option>
                    {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Lender Name*</label>
                  <select
                    className="form-control"
                    value={mappings.lender_name}
                    onChange={(e) => setMappings({ ...mappings, lender_name: e.target.value })}
                  >
                    <option value="">-- Choose Column --</option>
                    {importHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowImportWizard(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleExecuteImport}>
                Import Data Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
