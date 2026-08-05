export interface EmiRow {
  emi_number: number;
  due_date: string;
  opening_balance: number;
  principal_component: number;
  interest_component: number;
  gst_on_interest: number;
  total_installment: number;
  closing_balance: number;
}

export interface ProcessingFeeDetails {
  processingFee: number;
  gstOnFee: number;
  totalFeeCharges: number;
}

export function formatINR(val: any, currencyCode: string = 'INR'): string {
  const num = Number(val);
  const safeCurrency = (currencyCode && typeof currencyCode === 'string') ? currencyCode.toUpperCase().trim() : 'INR';
  
  if (isNaN(num)) {
    if (safeCurrency === 'USD') return '$0.00';
    if (safeCurrency === 'EUR') return '€0.00';
    if (safeCurrency === 'GBP') return '£0.00';
    if (safeCurrency === 'AED') return 'AED 0.00';
    return '₹0.00';
  }
  
  const locale = safeCurrency === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch (e) {
    console.error('formatINR formatting failed for currency:', currencyCode, e);
    const symbol = getCurrencySymbol(safeCurrency);
    return `${symbol}${num.toFixed(2)}`;
  }
}

// Clean helper to round to 2 decimal places
export function roundTo2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// Add months to a Date string (YYYY-MM-DD)
export function addMonths(dateStr: string, monthsToAdd: number): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  const d = date.getDate();
  date.setMonth(date.getMonth() + monthsToAdd);
  
  // Check for month end overflow (e.g. 31st Jan + 1 month -> 3rd March, adjust to 28th Feb)
  if (date.getDate() !== d) {
    date.setDate(0);
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

// Calculate standard EMI using reducing balance method
export function calculateEmi(principal: number, annualRate: number, periodMonths: number): number {
  if (principal <= 0 || periodMonths <= 0) return 0;
  if (annualRate === 0) return roundTo2(principal / periodMonths);
  
  const r = annualRate / 12 / 100;
  const n = periodMonths;
  
  const emi = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return roundTo2(emi);
}

// Calculate processing fee charges
export function calculateProcessingFee(_loanAmount: number, fee: number, gstRate = 18): ProcessingFeeDetails {
  const processingFee = roundTo2(fee);
  const gstOnFee = roundTo2((processingFee * gstRate) / 100);
  const totalFeeCharges = roundTo2(processingFee + gstOnFee);
  
  return {
    processingFee,
    gstOnFee,
    totalFeeCharges,
  };
}

// Generate the complete amortization schedule
export function generateAmortizationSchedule(
  loanAmount: number,
  downPayment: number,
  annualRate: number,
  periodMonths: number,
  emiStartDateStr: string
): EmiRow[] {
  const principal = loanAmount - downPayment;
  if (principal <= 0 || periodMonths <= 0) return [];
  
  const emi = calculateEmi(principal, annualRate, periodMonths);
  const r = annualRate / 12 / 100;
  const schedule: EmiRow[] = [];
  
  let currentBalance = principal;
  
  for (let i = 1; i <= periodMonths; i++) {
    const opening_balance = currentBalance;
    const due_date = addMonths(emiStartDateStr, i - 1);
    
    let interest_component = 0;
    let principal_component = 0;
    
    if (annualRate > 0) {
      interest_component = roundTo2(opening_balance * r);
    }
    
    if (i === periodMonths) {
      // Last month: adjust principal to exactly close the loan
      principal_component = opening_balance;
    } else {
      principal_component = roundTo2(emi - interest_component);
    }
    
    const closing_balance = roundTo2(opening_balance - principal_component);
    const gst_on_interest = roundTo2(interest_component * 0.18);
    const total_installment = roundTo2((i === periodMonths ? (principal_component + interest_component) : emi) + gst_on_interest);
    
    schedule.push({
      emi_number: i,
      due_date,
      opening_balance,
      principal_component,
      interest_component,
      gst_on_interest,
      total_installment,
      closing_balance,
    });
    
    currentBalance = closing_balance;
  }
  
  return schedule;
}

// Prepayment Impact Calculator
export interface PrepaymentImpact {
  originalTotalInterest: number;
  originalTotalGst: number;
  originalTotalPayments: number;
  
  newTotalInterest: number;
  newTotalGst: number;
  newTotalPayments: number;
  
  interestSaved: number;
  gstSaved: number;
  totalSaved: number;
  
  newTenureMonths?: number;
  newEmiAmount?: number;
}

export function calculatePrepaymentImpact(
  outstandingPrincipal: number,
  annualRate: number,
  remainingMonths: number,
  prepaymentAmount: number,
  option: 'reduce_tenure' | 'reduce_emi'
): PrepaymentImpact {
  const r = annualRate / 12 / 100;
  const originalEmi = calculateEmi(outstandingPrincipal, annualRate, remainingMonths);
  
  // Original schedule totals for remaining period
  let tempBalOrig = outstandingPrincipal;
  let originalInterest = 0;
  for (let i = 0; i < remainingMonths; i++) {
    const interest = roundTo2(tempBalOrig * r);
    const principal = i === remainingMonths - 1 ? tempBalOrig : roundTo2(originalEmi - interest);
    originalInterest += interest;
    tempBalOrig = roundTo2(tempBalOrig - principal);
  }
  const originalGst = roundTo2(originalInterest * 0.18);
  const originalPayments = roundTo2(originalEmi * remainingMonths + originalGst);
  
  // New outstanding principal after prepayment
  const newPrincipal = Math.max(0, outstandingPrincipal - prepaymentAmount);
  if (newPrincipal <= 0) {
    return {
      originalTotalInterest: roundTo2(originalInterest),
      originalTotalGst: originalGst,
      originalTotalPayments: originalPayments,
      newTotalInterest: 0,
      newTotalGst: 0,
      newTotalPayments: 0,
      interestSaved: roundTo2(originalInterest),
      gstSaved: originalGst,
      totalSaved: originalPayments,
      newTenureMonths: 0,
    };
  }
  
  let newInterest = 0;
  let newPayments = 0;
  
  if (option === 'reduce_tenure') {
    // Keep same EMI, reduce period
    let tempBal = newPrincipal;
    let months = 0;
    while (tempBal > 0.01 && months < 360) { // Safety cap of 30 years
      const interest = roundTo2(tempBal * r);
      let principal = roundTo2(originalEmi - interest);
      if (principal >= tempBal) {
        principal = tempBal;
      }
      newInterest += interest;
      tempBal = roundTo2(tempBal - principal);
      months++;
    }
    const newGst = roundTo2(newInterest * 0.18);
    newPayments = roundTo2(originalEmi * months + newGst); // Simplified total
    
    return {
      originalTotalInterest: roundTo2(originalInterest),
      originalTotalGst: originalGst,
      originalTotalPayments: originalPayments,
      newTotalInterest: roundTo2(newInterest),
      newTotalGst: newGst,
      newTotalPayments: roundTo2(newPayments),
      interestSaved: roundTo2(originalInterest - newInterest),
      gstSaved: roundTo2(originalGst - newGst),
      totalSaved: roundTo2(originalPayments - newPayments),
      newTenureMonths: months,
    };
  } else {
    // Keep same tenure, reduce EMI
    const newEmi = calculateEmi(newPrincipal, annualRate, remainingMonths);
    let tempBal = newPrincipal;
    for (let i = 0; i < remainingMonths; i++) {
      const interest = roundTo2(tempBal * r);
      const principal = i === remainingMonths - 1 ? tempBal : roundTo2(newEmi - interest);
      newInterest += interest;
      tempBal = roundTo2(tempBal - principal);
    }
    const newGst = roundTo2(newInterest * 0.18);
    newPayments = roundTo2(newEmi * remainingMonths + newGst);
    
    return {
      originalTotalInterest: roundTo2(originalInterest),
      originalTotalGst: originalGst,
      originalTotalPayments: originalPayments,
      newTotalInterest: roundTo2(newInterest),
      newTotalGst: newGst,
      newTotalPayments: roundTo2(newPayments),
      interestSaved: roundTo2(originalInterest - newInterest),
      gstSaved: roundTo2(originalGst - newGst),
      totalSaved: roundTo2(originalPayments - newPayments),
      newEmiAmount: newEmi,
    };
  }
}

// Foreclosure calculation
export interface ForeclosureDetails {
  outstandingPrincipal: number;
  foreclosureCharges: number;
  gstOnCharges: number;
  totalForeclosureAmount: number;
  interestSaved: number;
  gstSaved: number;
  totalSaved: number;
}

export function calculateForeclosure(
  emiSchedule: EmiRow[],
  currentEmiNum: number,
  foreclosureChargePercent = 0
): ForeclosureDetails {
  // We foreclose at the end of currentEmiNum-1 (i.e. before currentEmiNum due date)
  // Or equivalently, the opening balance of currentEmiNum is the outstanding principal.
  const targetRow = emiSchedule.find(r => r.emi_number === currentEmiNum);
  
  if (!targetRow) {
    return {
      outstandingPrincipal: 0,
      foreclosureCharges: 0,
      gstOnCharges: 0,
      totalForeclosureAmount: 0,
      interestSaved: 0,
      gstSaved: 0,
      totalSaved: 0,
    };
  }
  
  const outstandingPrincipal = targetRow.opening_balance;
  const foreclosureCharges = roundTo2((outstandingPrincipal * foreclosureChargePercent) / 100);
  const gstOnCharges = roundTo2(foreclosureCharges * 0.18);
  const totalForeclosureAmount = roundTo2(outstandingPrincipal + foreclosureCharges + gstOnCharges);
  
  // Calculate interest and GST saved from remaining EMIs (from currentEmiNum to end)
  let interestSaved = 0;
  let gstSaved = 0;
  
  const remainingRows = emiSchedule.filter(r => r.emi_number >= currentEmiNum);
  remainingRows.forEach(r => {
    interestSaved += r.interest_component;
    gstSaved += r.gst_on_interest;
  });
  
  interestSaved = roundTo2(interestSaved);
  gstSaved = roundTo2(gstSaved);
  
  // Total saved is the interest + GST saved, minus foreclosure charges paid
  const totalSaved = roundTo2(interestSaved + gstSaved - foreclosureCharges - gstOnCharges);
  
  return {
    outstandingPrincipal,
    foreclosureCharges,
    gstOnCharges,
    totalForeclosureAmount,
    interestSaved,
    gstSaved,
    totalSaved,
  };
}

export interface LoanNotesMetadata {
  notesText: string;
  currency: string;
  cardNickname?: string;
  cardLast4?: string;
}

export function parseLoanNotes(notesField: string | null): LoanNotesMetadata {
  if (!notesField) {
    return { notesText: '', currency: 'INR' };
  }
  
  const trimmed = notesField.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return {
          notesText: parsed.notesText !== undefined ? parsed.notesText : '',
          currency: parsed.currency !== undefined ? parsed.currency : 'INR',
          cardNickname: parsed.cardNickname || '',
          cardLast4: parsed.cardLast4 || '',
        };
      }
    } catch (e) {
      // Ignore JSON parse error and fallback to text
    }
  }
  
  return { notesText: notesField, currency: 'INR' };
}

export function serializeLoanNotes(notesText: string, currency: string, cardNickname?: string, cardLast4?: string): string {
  const obj: any = { notesText, currency };
  if (cardNickname) obj.cardNickname = cardNickname;
  if (cardLast4) obj.cardLast4 = cardLast4;
  return JSON.stringify(obj);
}

export function getCurrencySymbol(currency: string): string {
  if (!currency || typeof currency !== 'string') return '₹';
  const clean = currency.toUpperCase().trim();
  switch (clean) {
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'AED': return 'د.إ';
    default: return '₹';
  }
}

