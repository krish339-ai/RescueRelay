import type { RecoveryPlan, Rescue, Role } from '@rescuerelay/shared';
export function formatTime(value?: string): string {
  if (!value) return 'Not estimated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
export function formatWindow(window: { start: string; end: string }): string {
  const start = new Date(window.start); const end = new Date(window.end);
  const dateLabel = (date: Date) => date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (start.toDateString() !== end.toDateString()) return `${dateLabel(start)}, ${formatTime(window.start)} – ${dateLabel(end)}, ${formatTime(window.end)}`;
  const prefix = start.toDateString() === new Date().toDateString() ? '' : `${dateLabel(start)} · `;
  return `${prefix}${formatTime(window.start)} – ${formatTime(window.end)}`;
}
export function actionForRescue(rescue: Rescue, role: Role): 'accept' | 'pickup' | 'deliver' | 'confirm' | null {
  if (role === 'recipient') return rescue.status === 'delivered' && !rescue.recipientConfirmedAt ? 'confirm' : null;
  if (rescue.status === 'assigned') return rescue.acceptedAt ? 'pickup' : 'accept';
  if (rescue.status === 'picked_up') return 'deliver';
  if (role === 'coordinator' && rescue.status === 'delivered' && !rescue.recipientConfirmedAt) return 'confirm';
  return null;
}
export function canApprove(plan: RecoveryPlan, version: number, now = Date.now()): boolean {
  return plan.status === 'ready' && plan.baseVersion === version && Date.parse(plan.expiresAt) > now && plan.replacements.length > 0;
}
export function createIdempotencyKey(): string {
  // Uniqueness marker, not an authentication or cryptographic secret.
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
