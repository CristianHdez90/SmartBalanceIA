import type { DailyExpense } from './finance';
export function expenseBreakdown(expenses:DailyExpense[]) {
 const totals=new Map<string,number>();
 for(const expense of expenses)if(Number.isFinite(expense.amount)&&expense.amount>0)totals.set(expense.category,(totals.get(expense.category)||0)+expense.amount);
 const total=[...totals.values()].reduce((a,b)=>a+b,0);
 const rows=[...totals].map(([category,amount])=>({category,amount,percentage:total?amount/total*100:0})).sort((a,b)=>b.amount-a.amount||a.category.localeCompare(b.category));
 return {total,rows:rows.map(row=>({...row,highest:row.amount===rows[0]?.amount}))};
}
