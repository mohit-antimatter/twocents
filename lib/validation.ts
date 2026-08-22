import type { ExpenseEdit } from "./expenses";
import { CURRENCIES } from "./money";

type ValidationResult =
  | { ok: true; value: ExpenseEdit }
  | { ok: false; error: string };

export function isValidISODate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validateExpenseEdit(
  body: Record<string, unknown>,
  validCategoryIds: readonly string[]
): ValidationResult {
  const amount = Number(body.amount);
  const amountMinor = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amountMinor)) {
    return { ok: false, error: "Amount must be a positive number we can store safely." };
  }

  const currency = typeof body.currency === "string" ? body.currency : "";
  if (!CURRENCIES[currency]) return { ok: false, error: "Unknown currency." };

  const spentOn = typeof body.spentOn === "string" ? body.spentOn : "";
  if (!isValidISODate(spentOn)) {
    return { ok: false, error: "Choose a real calendar date." };
  }

  const rawTime = body.spentTime;
  const spentTime = rawTime === null || rawTime === undefined || rawTime === "" ? null : rawTime;
  if (typeof spentTime !== "string" && spentTime !== null) {
    return { ok: false, error: "Time must be HH:MM." };
  }
  if (spentTime && !isValidTime(spentTime)) {
    return { ok: false, error: "Choose a valid time." };
  }

  const rawCategoryId = body.categoryId;
  const categoryId =
    rawCategoryId === null || rawCategoryId === undefined || rawCategoryId === ""
      ? null
      : rawCategoryId;
  if (typeof categoryId !== "string" && categoryId !== null) {
    return { ok: false, error: "Unknown category." };
  }
  if (categoryId && !validCategoryIds.includes(categoryId)) {
    return { ok: false, error: "That category doesn't belong to this household." };
  }

  const merchant = optionalText(body.merchant, 120, "Merchant");
  if (!merchant.ok) return merchant;
  const note = optionalText(body.note, 500, "Note");
  if (!note.ok) return note;

  return {
    ok: true,
    value: {
      amount,
      currency,
      categoryId,
      merchant: merchant.value,
      note: note.value,
      spentOn,
      spentTime,
    },
  };
}

function optionalText(
  input: unknown,
  maxLength: number,
  label: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (input !== null && input !== undefined && typeof input !== "string") {
    return { ok: false, error: `${label} must be text.` };
  }
  const value = typeof input === "string" ? input.trim() : "";
  if (value.length > maxLength) {
    return { ok: false, error: `${label} must be ${maxLength} characters or fewer.` };
  }
  return { ok: true, value: value || null };
}
