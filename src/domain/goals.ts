import { z } from 'zod';

export const goalIcons = { travel: '✈️', emergency: '🏦', car: '🚗', home: '🏠', education: '🎓', savings: '💰' } as const;
export const goalColors = { indigo: '#818cf8', cyan: '#22d3ee', orange: '#fb923c', green: '#34d399' } as const;
export type FinancialGoal = {
  id: string; name: string; target: number; saved: number; dueDate: string;
  icon: keyof typeof goalIcons; color: keyof typeof goalColors; version: number; archived: number;
};
const amount = z.number().int().min(0).max(999999999999);
const date = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
export const goalFields = z.object({
  name: z.string().trim().min(2).max(100), target: amount.positive(), saved: amount,
  dueDate: date, icon: z.enum(['travel', 'emergency', 'car', 'home', 'education', 'savings']),
  color: z.enum(['indigo', 'cyan', 'orange', 'green']),
}).strict();
export const goalCommand = z.discriminatedUnion('action', [
  goalFields.extend({ action: z.literal('create'), id: z.string().uuid() }).strict(),
  goalFields.extend({ action: z.literal('update'), id: z.string().uuid(), version: z.number().int().positive() }).strict(),
  z.object({ action: z.literal('archive'), id: z.string().uuid(), version: z.number().int().positive(), archived: z.boolean() }).strict(),
]);
export type GoalCommand = z.infer<typeof goalCommand>;
export class GoalConflictError extends Error {
  constructor() { super('La meta cambió o ya no está disponible. Recarga las metas antes de guardar otra vez.'); }
}
export function goalProgress(goal: Pick<FinancialGoal, 'saved' | 'target'>) {
  return { percent: Math.min(100, Math.floor(goal.saved / goal.target * 100)), remaining: Math.max(0, goal.target - goal.saved), complete: goal.saved >= goal.target };
}
