import { toHomeMinor } from "./money";
import type { ExpenseExportRow } from "./expenses";

const HEADERS = [
  "date",
  "time",
  "merchant",
  "note",
  "category",
  "paid_by",
  "amount",
  "currency",
  "fx_to_home",
  "home_amount",
  "home_currency",
  "source",
  "created_at",
  "expense_id",
] as const;

function textCell(value: string | null): string {
  const raw = value ?? "";
  const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function moneyCell(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function expensesToCsv(
  rows: ExpenseExportRow[],
  homeCurrency: string
): string {
  const lines = rows.map((row) =>
    [
      textCell(row.spent_on),
      textCell(row.spent_time),
      textCell(row.merchant),
      textCell(row.note),
      textCell(row.category_name),
      textCell(row.user_name),
      moneyCell(row.amount_minor),
      textCell(row.currency),
      row.fx_to_home.toString(),
      moneyCell(toHomeMinor(row.amount_minor, row.fx_to_home)),
      textCell(homeCurrency),
      textCell(row.source),
      textCell(new Date(row.created_at).toISOString()),
      textCell(row.id),
    ].join(",")
  );
  return `\uFEFF${HEADERS.join(",")}\r\n${lines.join("\r\n")}${lines.length ? "\r\n" : ""}`;
}

export function exportFilename(householdName: string, today: string): string {
  const slug = householdName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48) || "household";
  return `twocents-${slug}-${today}.csv`;
}
