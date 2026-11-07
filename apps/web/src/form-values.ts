import type { Window } from "@rescuerelay/shared";
/** HTML datetime-local omits seconds by default. Preserve the source precision when untouched. */
export const localDate = (value: string) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export const iso = (value: string) => new Date(value).toISOString();
/** Sending unchanged constraint fields can invalidate active commitments. Only submit actual edits. */
export function changedFields(
  original: object,
  next: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(next).filter(
      ([key, value]) =>
        JSON.stringify((original as Record<string, unknown>)[key]) !==
        JSON.stringify(value),
    ),
  );
}
export function editedWindow(
  form: FormData,
  prefix: string,
  original: Window,
): Window {
  const start = String(form.get(`${prefix}Start`) || ""),
    end = String(form.get(`${prefix}End`) || "");
  return {
    start: start === localDate(original.start) ? original.start : iso(start),
    end: end === localDate(original.end) ? original.end : iso(end),
  };
}
