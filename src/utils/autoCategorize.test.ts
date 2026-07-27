import { describe, expect, it } from 'vitest';
import {
  findMatchingRule,
  isValidPattern,
  mergeLabels,
  planRuleApplication,
  ruleMatches,
} from './autoCategorize';
import type { CategoryRule, Transaction } from '@/types';

function rule(partial: Partial<CategoryRule> & Pick<CategoryRule, 'id' | 'pattern'>): CategoryRule {
  return {
    matchType: 'contains',
    scope: 'any',
    categoryId: 'cat-transport',
    labelIds: [],
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

function tx(partial: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction {
  return {
    type: 'expense',
    amount: 100,
    accountId: 'acc-1',
    categoryId: 'cat-misc',
    date: '2026-06-01T00:00:00.000Z',
    note: '',
    labels: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    ...partial,
  };
}

describe('isValidPattern', () => {
  it('rejects a blank pattern regardless of match type', () => {
    expect(isValidPattern('   ', 'contains')).toBe(false);
    expect(isValidPattern('', 'regex')).toBe(false);
  });

  it('accepts any non-blank literal pattern', () => {
    expect(isValidPattern('Uber', 'contains')).toBe(true);
    expect(isValidPattern('([', 'contains')).toBe(true);
  });

  it('rejects an unparseable regex instead of throwing', () => {
    expect(isValidPattern('uber|ola', 'regex')).toBe(true);
    expect(isValidPattern('([', 'regex')).toBe(false);
  });
});

describe('ruleMatches', () => {
  it('matches case-insensitively across every match type', () => {
    expect(ruleMatches(rule({ id: 'r', pattern: 'uber' }), 'UBER trip home', 'expense')).toBe(true);
    expect(
      ruleMatches(
        rule({ id: 'r', pattern: 'UBER', matchType: 'startsWith' }),
        'uber trip',
        'expense',
      ),
    ).toBe(true);
    expect(
      ruleMatches(
        rule({ id: 'r', pattern: 'trip', matchType: 'endsWith' }),
        'Uber TRIP',
        'expense',
      ),
    ).toBe(true);
    expect(
      ruleMatches(
        rule({ id: 'r', pattern: 'uber trip', matchType: 'equals' }),
        ' Uber Trip ',
        'expense',
      ),
    ).toBe(true);
    expect(
      ruleMatches(
        rule({ id: 'r', pattern: '^ub(er|ur)', matchType: 'regex' }),
        'Ubur ride',
        'expense',
      ),
    ).toBe(true);
  });

  it('never fires on a transfer, whatever the scope', () => {
    expect(ruleMatches(rule({ id: 'r', pattern: 'uber', scope: 'any' }), 'uber', 'transfer')).toBe(
      false,
    );
  });

  it('honours the expense/income scope', () => {
    const expenseOnly = rule({ id: 'r', pattern: 'salary', scope: 'expense' });
    expect(ruleMatches(expenseOnly, 'salary', 'income')).toBe(false);
    expect(ruleMatches(expenseOnly, 'salary', 'expense')).toBe(true);
  });

  it('skips a disabled rule', () => {
    expect(ruleMatches(rule({ id: 'r', pattern: 'uber', enabled: false }), 'uber', 'expense')).toBe(
      false,
    );
  });

  it('treats an invalid regex as matching nothing', () => {
    expect(ruleMatches(rule({ id: 'r', pattern: '([', matchType: 'regex' }), '([', 'expense')).toBe(
      false,
    );
  });
});

describe('findMatchingRule', () => {
  const rules = [
    rule({ id: 'r1', pattern: 'uber eats', categoryId: 'cat-food' }),
    rule({ id: 'r2', pattern: 'uber', categoryId: 'cat-transport' }),
  ];

  it('returns the first rule in array order, not the most specific', () => {
    expect(findMatchingRule(rules, 'Uber Eats order', 'expense')?.id).toBe('r1');
    expect(findMatchingRule(rules, 'Uber ride', 'expense')?.id).toBe('r2');
  });

  it('returns undefined for a blank note', () => {
    expect(findMatchingRule(rules, '   ', 'expense')).toBeUndefined();
  });

  it('skips a disabled rule and falls through to the next match', () => {
    const withDisabled = [{ ...rules[0], enabled: false }, rules[1]];
    expect(findMatchingRule(withDisabled, 'Uber Eats order', 'expense')?.id).toBe('r2');
  });
});

describe('mergeLabels', () => {
  it('adds without duplicating what is already there', () => {
    expect(mergeLabels(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('leaves the existing list untouched when the rule has no labels', () => {
    expect(mergeLabels(['a'], [])).toEqual(['a']);
  });
});

describe('planRuleApplication', () => {
  const rules = [
    rule({ id: 'r1', pattern: 'uber', categoryId: 'cat-transport', labelIds: ['lbl-essential'] }),
  ];

  it('plans a category and label change for a matching transaction', () => {
    const transactions = [tx({ id: 't1', note: 'Uber to office' })];
    const plan = planRuleApplication(transactions, rules);

    expect(plan).toHaveLength(1);
    expect(plan[0].before).toMatchObject({ categoryId: 'cat-misc', labels: [] });
    expect(plan[0].after).toMatchObject({
      categoryId: 'cat-transport',
      labels: ['lbl-essential'],
    });
  });

  it('skips rows the rule already agrees with, so the count is honest', () => {
    const transactions = [
      tx({ id: 't1', note: 'Uber', categoryId: 'cat-transport', labels: ['lbl-essential'] }),
    ];
    expect(planRuleApplication(transactions, rules)).toEqual([]);
  });

  it('still plans a labels-only change when the category already matches', () => {
    const transactions = [tx({ id: 't1', note: 'Uber', categoryId: 'cat-transport' })];
    const plan = planRuleApplication(transactions, rules);
    expect(plan).toHaveLength(1);
    expect(plan[0].after.labels).toEqual(['lbl-essential']);
  });

  it('never touches transfers or split transactions', () => {
    const transactions = [
      tx({ id: 't1', note: 'Uber', type: 'transfer', toAccountId: 'acc-2' }),
      tx({
        id: 't2',
        note: 'Uber',
        categoryId: '',
        splits: [
          { categoryId: 'cat-food', amount: 60 },
          { categoryId: 'cat-transport', amount: 40 },
        ],
      }),
    ];
    expect(planRuleApplication(transactions, rules)).toEqual([]);
  });

  it('ignores transactions with a blank note', () => {
    expect(planRuleApplication([tx({ id: 't1', note: '  ' })], rules)).toEqual([]);
  });

  it('restricts to one category when asked', () => {
    const transactions = [
      tx({ id: 't1', note: 'Uber', categoryId: 'cat-misc' }),
      tx({ id: 't2', note: 'Uber', categoryId: 'cat-shopping' }),
    ];
    const plan = planRuleApplication(transactions, rules, { restrictToCategoryId: 'cat-misc' });
    expect(plan.map((p) => p.transactionId)).toEqual(['t1']);
  });

  it('skips disabled and invalid-regex rules entirely', () => {
    const broken = [
      rule({ id: 'r1', pattern: 'uber', enabled: false }),
      rule({ id: 'r2', pattern: '([', matchType: 'regex' }),
    ];
    expect(planRuleApplication([tx({ id: 't1', note: 'Uber' })], broken)).toEqual([]);
  });
});
