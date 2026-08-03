import { addMonths, parseISO } from 'date-fns';
import { roundMoney } from '@/store/balance';

/**
 * Loan amortization — pure, so the EMI math and the "what if I prepay" calculator are testable
 * without a store or a browser. Nothing here reads or writes real transactions; it is purely a
 * plan derived from principal/rate/tenure plus whatever prepayments actually happened.
 */

export interface LoanPrepaymentInput {
  amount: number;
  /** ISO date the extra payment landed. */
  date: string;
}

export interface LoanScheduleInput {
  principal: number;
  /** Annual interest rate as a percent, e.g. 8.5 for 8.5%. */
  interestRate: number;
  /** Number of EMIs at origination. */
  tenureMonths: number;
  /** ISO date of the first EMI. */
  startDate: string;
  prepayments?: LoanPrepaymentInput[];
}

export interface AmortizationRow {
  /** 1-based installment number. */
  month: number;
  /** ISO date this installment is due. */
  date: string;
  openingBalance: number;
  interest: number;
  principal: number;
  /** `principal + interest` for this row — equal to the fixed EMI except possibly the last row. */
  emi: number;
  /** Extra principal applied this month from a dated prepayment, on top of the EMI. */
  prepayment: number;
  closingBalance: number;
}

export interface LoanStatus {
  emi: number;
  /** Interest over the full schedule, including any prepayments already on record. */
  totalInterest: number;
  /** Length of the schedule — at or below `tenureMonths`; prepayments only shorten it. */
  totalMonths: number;
  /** Balance right now, i.e. after every installment on or before `now`. */
  outstandingBalance: number;
  paidInstallments: number;
  totalInterestPaid: number;
  nextDueDate: string | null;
  /** Due date of the schedule's last installment. */
  payoffDate: string | null;
  isPaidOff: boolean;
}

export interface PrepaymentImpact {
  /** How many fewer installments the loan would take, this one included. */
  monthsSaved: number;
  interestSaved: number;
  newPayoffDate: string | null;
}

export function monthlyRate(annualRatePercent: number): number {
  return annualRatePercent / 12 / 100;
}

/** Standard EMI formula. Falls back to a flat split when the rate is 0. */
export function calculateEmi(
  principal: number,
  annualRatePercent: number,
  tenureMonths: number,
): number {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  const r = monthlyRate(annualRatePercent);
  if (r === 0) return roundMoney(principal / tenureMonths);
  const factor = Math.pow(1 + r, tenureMonths);
  return roundMoney((principal * r * factor) / (factor - 1));
}

/** Whole calendar months from `startDate` to `date`, floored — which installment a date falls on. */
function monthsBetween(startDate: string, date: string): number {
  const start = parseISO(startDate);
  const target = parseISO(date);
  return (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
}

/**
 * Month-by-month amortization at a fixed EMI (computed once from the original principal, rate
 * and tenure — it never changes). Prepayments are applied as extra principal on the installment
 * they fall on or after, and the loan simply finishes early rather than the EMI shrinking. That
 * keeps `tenureMonths` a safe upper bound on the schedule's length in every case.
 */
export function buildAmortizationSchedule(loan: LoanScheduleInput): AmortizationRow[] {
  const emi = calculateEmi(loan.principal, loan.interestRate, loan.tenureMonths);
  const r = monthlyRate(loan.interestRate);

  const prepaymentsByMonth = new Map<number, number>();
  for (const p of loan.prepayments ?? []) {
    if (p.amount <= 0) continue;
    const month = Math.max(1, monthsBetween(loan.startDate, p.date) + 1);
    prepaymentsByMonth.set(month, roundMoney((prepaymentsByMonth.get(month) ?? 0) + p.amount));
  }

  const rows: AmortizationRow[] = [];
  let balance = loan.principal;
  let month = 0;

  while (balance > 0.005 && month < loan.tenureMonths) {
    month += 1;
    const openingBalance = balance;
    const interest = roundMoney(openingBalance * r);
    const principal = roundMoney(Math.min(emi - interest, openingBalance));
    let closingBalance = roundMoney(openingBalance - principal);

    const extra = Math.min(prepaymentsByMonth.get(month) ?? 0, closingBalance);
    closingBalance = roundMoney(closingBalance - extra);

    rows.push({
      month,
      date: addMonths(parseISO(loan.startDate), month - 1).toISOString(),
      openingBalance,
      interest,
      principal,
      emi: roundMoney(principal + interest),
      prepayment: extra,
      closingBalance,
    });

    balance = closingBalance;
  }

  return rows;
}

/** Where the loan actually stands `now`, from its schedule (including any real prepayments). */
export function loanStatus(loan: LoanScheduleInput, now = new Date()): LoanStatus {
  const schedule = buildAmortizationSchedule(loan);
  const emi = calculateEmi(loan.principal, loan.interestRate, loan.tenureMonths);
  const totalInterest = roundMoney(schedule.reduce((sum, row) => sum + row.interest, 0));

  const paidRows = schedule.filter((row) => parseISO(row.date) <= now);
  const remainingRows = schedule.slice(paidRows.length);
  const totalInterestPaid = roundMoney(paidRows.reduce((sum, row) => sum + row.interest, 0));
  const outstandingBalance =
    paidRows.length > 0
      ? paidRows[paidRows.length - 1].closingBalance
      : (schedule[0]?.openingBalance ?? 0);

  return {
    emi,
    totalInterest,
    totalMonths: schedule.length,
    outstandingBalance,
    paidInstallments: paidRows.length,
    totalInterestPaid,
    nextDueDate: remainingRows[0]?.date ?? null,
    payoffDate: schedule[schedule.length - 1]?.date ?? null,
    isPaidOff: schedule.length > 0 && remainingRows.length === 0,
  };
}

/**
 * "What if I paid an extra ₹X on this date?" — compares the schedule with and without one more
 * prepayment on top of whatever the loan already has on record.
 */
export function simulatePrepaymentImpact(
  loan: LoanScheduleInput,
  extra: LoanPrepaymentInput,
): PrepaymentImpact {
  const baseline = buildAmortizationSchedule(loan);
  const withExtra = buildAmortizationSchedule({
    ...loan,
    prepayments: [...(loan.prepayments ?? []), extra],
  });

  const interestOf = (schedule: AmortizationRow[]) =>
    roundMoney(schedule.reduce((sum, row) => sum + row.interest, 0));

  return {
    monthsSaved: baseline.length - withExtra.length,
    interestSaved: roundMoney(interestOf(baseline) - interestOf(withExtra)),
    newPayoffDate: withExtra[withExtra.length - 1]?.date ?? null,
  };
}
