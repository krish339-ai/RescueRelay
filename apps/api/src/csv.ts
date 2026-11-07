import type { CsvValidation } from "@rescuerelay/shared";
import type { OrgState } from "./state.js";
import { iso as strictIso } from "./schemas.js";
const headers = [
  "donorId",
  "description",
  "weightKg",
  "servings",
  "pickupStart",
  "pickupEnd",
];
/** RFC 4180-style quoted fields; rejects unterminated quotes, bounded by API input limit. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    afterQuote = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else field += c;
      continue;
    }
    if (c === '"') {
      if (field || afterQuote)
        throw new Error("Unexpected quote in unquoted field.");
      quoted = true;
      continue;
    }
    if (c === "," || c === "\n" || c === "\r") {
      row.push(field);
      field = "";
      afterQuote = false;
      if (c !== ",") {
        if (c === "\r" && input[i + 1] === "\n") i++;
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
      }
      continue;
    }
    if (afterQuote) throw new Error("Unexpected text after quoted field.");
    field += c;
  }
  if (quoted) throw new Error("Unterminated quoted field.");
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}
export function validateCsv(s: OrgState, csv: string): CsvValidation {
  const result: CsvValidation = {
    valid: false,
    rows: 0,
    errors: [],
    preview: [],
  };
  let rows: string[][];
  try {
    rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  } catch (e) {
    result.errors.push({
      row: 1,
      field: "csv",
      message: String((e as Error).message),
    });
    return result;
  }
  if (!rows.length || rows[0]!.join(",") !== headers.join(",")) {
    result.errors.push({
      row: 1,
      field: "headers",
      message: `Expected exactly: ${headers.join(",")}`,
    });
    return result;
  }
  result.rows = rows.length - 1;
  if (result.rows < 1 || result.rows > 200) {
    result.errors.push({
      row: 1,
      field: "rows",
      message: "Provide between 1 and 200 data rows.",
    });
    return result;
  }
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const error = (field: string, message: string) =>
      result.errors.push({ row: i + 1, field, message });
    if (r.length !== 6) {
      error("row", "Expected six columns.");
      continue;
    }
    const [donorId, description, kg, serv, start, end] = r as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const weightKg = Number(kg),
      servings = Number(serv);
    if (!s.donors.some((d) => d.id === donorId))
      error("donorId", "Donor does not exist in your organization.");
    if (!description.trim() || description.length > 500)
      error("description", "Use a description of 1–500 characters.");
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 10000)
      error("weightKg", "Weight must be > 0 and <= 10000.");
    if (!Number.isInteger(servings) || servings <= 0 || servings > 100000)
      error("servings", "Servings must be a positive whole number <= 100000.");
    const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
    if (
      !iso.test(start) ||
      !iso.test(end) ||
      !strictIso.safeParse(start).success ||
      !strictIso.safeParse(end).success ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      Date.parse(start) >= Date.parse(end)
    )
      error("pickupWindow", "Use valid ISO timestamps with start before end.");
    result.preview.push({
      donorId,
      description: description.trim(),
      weightKg,
      servings,
      pickupStart: strictIso.safeParse(start).success
        ? new Date(start).toISOString()
        : start,
      pickupEnd: strictIso.safeParse(end).success
        ? new Date(end).toISOString()
        : end,
    });
  }
  result.valid = result.errors.length === 0;
  return result;
}
export function encodeCsv(rows: unknown[][]): string {
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            let cell = String(value ?? "");
            if (/^[\s]*[=+\-@]/.test(cell) || /^[\t\r]/.test(cell))
              cell = "'" + cell;
            return `"${cell.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n") + "\r\n"
  );
}
export function donationCsv(s: OrgState) {
  return encodeCsv([
    headers,
    ...s.donations.map((d) => [
      d.donorId,
      d.description,
      d.weightKg,
      d.servings,
      d.pickupWindow.start,
      d.pickupWindow.end,
    ]),
  ]);
}
