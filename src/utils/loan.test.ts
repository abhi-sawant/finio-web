import { describe, expect, it } from 'vitest';
import {
  buildAmortizationSchedule,
  calculateEmi,
  loanStatus,
  simulatePrepaymentImpact,
  type LoanScheduleInput,
} from './loan';

describe('calculateEmi', () => {
  it('matches the standard EMI formula for a textbook example', () => {
    // ₹1,00,000 @ 12% p.a. for 12 months — the commonly-cited reference value.
    expect(calculateEmi(100000, 12, 12)).toBeCloseTo(8884.88, 1);
  });

  it('falls back to a flat split at 0% interest', () => {
    expect(calculateEmi(12000, 0, 12)).toBe(1000);
  });

  it('is 0 for a non-positive principal or tenure', () => {
    expect(calculateEmi(0, 10, 12)).toBe(0);
    expect(calculateEmi(10000, 10, 0)).toBe(0);
  });
});

describe('buildAmortizationSchedule', () => {
  const loan: LoanScheduleInput = {
    principal: 100000,
    interestRate: 12,
    tenureMonths: 12,
    startDate: '2026-01-05T00:00:00.000Z',
  };

  it('pays off exactly at the original tenure with no prepayments', () => {
    const schedule = buildAmortizationSchedule(loan);
    expect(schedule).toHaveLength(12);
    expect(schedule[schedule.length - 1].closingBalance).toBe(0);
  });

  it('the sum of every principal portion equals the original principal', () => {
    const schedule = buildAmortizationSchedule(loan);
    const totalPrincipal = schedule.reduce((sum, row) => sum + row.principal, 0);
    expect(Math.round(totalPrincipal)).toBe(loan.principal);
  });

  it('each row is internally consistent: opening - principal (- prepayment) = closing', () => {
    const schedule = buildAmortizationSchedule(loan);
    for (const row of schedule) {
      expect(row.closingBalance).toBeCloseTo(row.openingBalance - row.principal - row.prepayment, 2);
      expect(row.emi).toBeCloseTo(row.principal + row.interest, 2);
    }
  });

  it('a dated prepayment shortens the schedule and is applied on the right installment', () => {
    const withPrepayment = buildAmortizationSchedule({
      ...loan,
      // Third installment is 2026-03-05 — a prepayment on that date should land on month 3.
      prepayments: [{ amount: 20000, date: '2026-03-05T00:00:00.000Z' }],
    });
    expect(withPrepayment.length).toBeLessThan(12);
    expect(withPrepayment[2].prepayment).toBe(20000);
    expect(withPrepayment[withPrepayment.length - 1].closingBalance).toBe(0);
  });

  it('never applies more prepayment than the remaining balance', () => {
    const schedule = buildAmortizationSchedule({
      ...loan,
      prepayments: [{ amount: 10_000_000, date: '2026-02-05T00:00:00.000Z' }],
    });
    expect(schedule.every((row) => row.closingBalance >= 0)).toBe(true);
  });

  it('ignores a zero or negative prepayment', () => {
    const schedule = buildAmortizationSchedule({
      ...loan,
      prepayments: [{ amount: 0, date: '2026-02-05T00:00:00.000Z' }],
    });
    expect(schedule).toHaveLength(12);
  });
});

describe('loanStatus', () => {
  const loan: LoanScheduleInput = {
    principal: 100000,
    interestRate: 12,
    tenureMonths: 12,
    startDate: '2026-01-05T00:00:00.000Z',
  };

  it('reports nothing paid before the first installment is due', () => {
    const status = loanStatus(loan, new Date('2026-01-01T00:00:00.000Z'));
    expect(status.paidInstallments).toBe(0);
    expect(status.outstandingBalance).toBe(loan.principal);
    expect(status.isPaidOff).toBe(false);
  });

  it('tracks paid installments and outstanding balance partway through', () => {
    const status = loanStatus(loan, new Date('2026-04-06T00:00:00.000Z'));
    expect(status.paidInstallments).toBe(4);
    expect(status.outstandingBalance).toBeLessThan(loan.principal);
    expect(status.outstandingBalance).toBeGreaterThan(0);
  });

  it('is paid off once every installment is behind `now`', () => {
    const status = loanStatus(loan, new Date('2027-06-01T00:00:00.000Z'));
    expect(status.isPaidOff).toBe(true);
    expect(status.outstandingBalance).toBe(0);
    expect(status.nextDueDate).toBeNull();
  });
});

describe('simulatePrepaymentImpact', () => {
  const loan: LoanScheduleInput = {
    principal: 100000,
    interestRate: 12,
    tenureMonths: 12,
    startDate: '2026-01-05T00:00:00.000Z',
  };

  it('a meaningful lump sum saves months and interest', () => {
    const impact = simulatePrepaymentImpact(loan, {
      amount: 30000,
      date: '2026-02-05T00:00:00.000Z',
    });
    expect(impact.monthsSaved).toBeGreaterThan(0);
    expect(impact.interestSaved).toBeGreaterThan(0);
    expect(impact.newPayoffDate).not.toBeNull();
  });

  it('a zero prepayment changes nothing', () => {
    const impact = simulatePrepaymentImpact(loan, { amount: 0, date: '2026-02-05T00:00:00.000Z' });
    expect(impact.monthsSaved).toBe(0);
    expect(impact.interestSaved).toBe(0);
  });
});
