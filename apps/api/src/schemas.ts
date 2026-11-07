import { z } from "zod";
export const text = (max = 200) => z.string().trim().min(1).max(max);
export const iso = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
export const window = z
  .object({ start: iso, end: iso })
  .strict()
  .refine(
    (v) => Date.parse(v.start) < Date.parse(v.end),
    "Window end must be after start.",
  );
export const location = z
  .object({
    label: text(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();
export const version = { expectedVersion: z.number().int().positive() };
export const category = z.enum([
  "shelf_stable",
  "chilled",
  "frozen",
  "prepared",
]);
export const donorFields = {
  name: text(),
  location,
  contact: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(1000).default(""),
};
export const recipientFields = {
  ...donorFields,
  acceptedCategories: z.array(category).min(1).max(4),
  capacityKg: z.number().positive().max(100000),
  openingWindow: window,
};
export const volunteerFields = {
  name: text(),
  vehicle: text(),
  capacityKg: z.number().positive().max(10000),
  available: z.boolean(),
  availability: window,
  location,
  trained: z.boolean(),
  notes: z.string().trim().max(1000).default(""),
};
export const donationFields = {
  donorId: text(),
  description: text(500),
  category,
  weightKg: z.number().positive().max(10000),
  servings: z.number().int().positive().max(100000),
  sealed: z.boolean(),
  handlingNotes: z.string().trim().max(1000).default(""),
  pickupWindow: window,
};
export const accountFields = {
  name: text(100),
  email: z
    .email()
    .max(254)
    .transform((x) => x.toLowerCase()),
  password: z.string().min(12).max(128),
};
export function parse<T extends z.ZodType>(
  schema: T,
  data: unknown,
): z.infer<T> {
  return schema.parse(data);
}
