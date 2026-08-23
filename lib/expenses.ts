import { db, uid } from "./db";
import { fxRate, toHomeMinor, formatMinor } from "./money";
import { listCategories } from "./categories";
import type { ParsedExpense } from "./parse";

export type ExpenseRow = {
  id: string;
  household_id: string;
  user_id: string;
  user_name: string;
  amount_minor: number;
  currency: string;
  fx_to_home: number;
  category_id: string | null;
  category_name: string | null;
  category_emoji: string | null;
  category_color: string | null;
  merchant: string | null;
  note: string | null;
  spent_on: string;
  spent_time: string | null; // HH:MM, 24h
  source: string;
  created_at: number;
};

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export type Household = {
  id: string;
  name: string;
  home_currency: string;
  invite_code: string;
};

export function getHousehold(householdId: string): Household {
  return db()
    .prepare("SELECT id, name, home_currency, invite_code FROM households WHERE id = ?")
    .get(householdId) as Household;
}

export function getMembers(householdId: string): { id: string; name: string }[] {
  return db()
    .prepare(
      `SELECT u.id, u.name FROM household_members m JOIN users u ON u.id = m.user_id
       WHERE m.household_id = ? ORDER BY m.joined_at`
    )
    .all(householdId) as { id: string; name: string }[];
}

export function createExpenseFromParsed(opts: {
  householdId: string;
  userId: string;
  parsed: ParsedExpense;
  source: string;
  rawInput: string | null;
  requestId?: string | null;
}): { id: string; summary: string; created: boolean } {
  const hh = getHousehold(opts.householdId);
  const currency = opts.parsed.currency ?? hh.home_currency;
  const amountMinor = Math.round(opts.parsed.amount * 100);
  const fx = fxRate(currency, hh.home_currency);

  const cats = listCategories(opts.householdId);
  const cat = opts.parsed.category
    ? cats.find((c) => c.name === opts.parsed.category) ?? null
    : null;
  const fallbackCat = cat ?? cats.find((c) => c.name === "Other") ?? null;

  if (opts.requestId) {
    const existing = expenseByRequestId(opts.householdId, opts.userId, opts.requestId);
    if (existing) return { ...existing, created: false };
  }

  const id = uid();
  // Time of spend: when logging for today, stamp the current time; a
  // backdated entry's time is unknown and stays editable-but-empty.
  const spentTime = opts.parsed.spent_on === todayISO() ? nowHHMM() : null;
  try {
    db()
      .prepare(
        `INSERT INTO expenses
         (id, household_id, user_id, amount_minor, currency, fx_to_home, category_id,
          merchant, note, spent_on, spent_time, source, raw_input, request_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        opts.householdId,
        opts.userId,
        amountMinor,
        currency,
        fx,
        fallbackCat?.id ?? null,
        opts.parsed.merchant,
        opts.parsed.note,
        opts.parsed.spent_on,
        spentTime,
        opts.source,
        opts.rawInput,
        opts.requestId ?? null,
        Date.now()
      );
  } catch (error) {
    // Two concurrent retries can both pass the lookup above. The unique index
    // lets one win; the loser returns the already-created expense.
    if (opts.requestId) {
      const existing = expenseByRequestId(opts.householdId, opts.userId, opts.requestId);
      if (existing) return { ...existing, created: false };
    }
    throw error;
  }

  const label = fallbackCat ? `${fallbackCat.emoji} ${fallbackCat.name}` : "Uncategorized";
  const who = opts.parsed.merchant ? ` · ${opts.parsed.merchant}` : "";
  return {
    id,
    summary: `${formatMinor(amountMinor, currency)} · ${label}${who} ✓`,
    created: true,
  };
}

function expenseByRequestId(
  householdId: string,
  userId: string,
  requestId: string
): { id: string; summary: string } | null {
  const row = db()
    .prepare(
      `SELECT e.id, e.amount_minor, e.currency, e.merchant,
              c.name AS category_name, c.emoji AS category_emoji
       FROM expenses e
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.household_id = ? AND e.user_id = ? AND e.request_id = ?`
    )
    .get(householdId, userId, requestId) as
    | {
        id: string;
        amount_minor: number;
        currency: string;
        merchant: string | null;
        category_name: string | null;
        category_emoji: string | null;
      }
    | undefined;
  if (!row) return null;

  const label = row.category_name
    ? `${row.category_emoji ?? "🧾"} ${row.category_name}`
    : "Uncategorized";
  const who = row.merchant ? ` · ${row.merchant}` : "";
  return {
    id: row.id,
    summary: `${formatMinor(row.amount_minor, row.currency)} · ${label}${who} ✓`,
  };
}

export function listRecentExpenses(householdId: string, limit = 30): ExpenseRow[] {
  return db()
    .prepare(
      `SELECT e.*, u.name AS user_name,
              c.name AS category_name, c.emoji AS category_emoji, c.color AS category_color
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.household_id = ?
       ORDER BY e.spent_on DESC, e.created_at DESC
       LIMIT ?`
    )
    .all(householdId, limit) as ExpenseRow[];
}

export type ExpenseExportRow = Pick<
  ExpenseRow,
  | "id"
  | "amount_minor"
  | "currency"
  | "fx_to_home"
  | "merchant"
  | "note"
  | "spent_on"
  | "spent_time"
  | "source"
  | "created_at"
  | "user_name"
  | "category_name"
>;

export function listExpensesForExport(householdId: string): ExpenseExportRow[] {
  return db()
    .prepare(
      `SELECT e.id, e.amount_minor, e.currency, e.fx_to_home, e.merchant, e.note,
              e.spent_on, e.spent_time, e.source, e.created_at,
              u.name AS user_name, c.name AS category_name
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.household_id = ?
       ORDER BY e.spent_on, COALESCE(e.spent_time, ''), e.created_at, e.id`
    )
    .all(householdId) as ExpenseExportRow[];
}

// Only the person who logged an expense may delete or edit it.
export function deleteExpense(
  id: string,
  householdId: string,
  userId: string
): "ok" | "not_found" | "forbidden" {
  const row = db()
    .prepare("SELECT user_id FROM expenses WHERE id = ? AND household_id = ?")
    .get(id, householdId) as { user_id: string } | undefined;
  if (!row) return "not_found";
  if (row.user_id !== userId) return "forbidden";
  db().prepare("DELETE FROM expenses WHERE id = ?").run(id);
  return "ok";
}

export type ExpenseEdit = {
  amount: number; // major units
  currency: string;
  categoryId: string | null;
  merchant: string | null;
  note: string | null;
  spentOn: string; // YYYY-MM-DD
  spentTime: string | null; // HH:MM or null
};

export function updateExpense(
  id: string,
  householdId: string,
  userId: string,
  edit: ExpenseEdit
): "ok" | "not_found" | "forbidden" {
  const row = db()
    .prepare("SELECT user_id FROM expenses WHERE id = ? AND household_id = ?")
    .get(id, householdId) as { user_id: string } | undefined;
  if (!row) return "not_found";
  if (row.user_id !== userId) return "forbidden";

  const hh = getHousehold(householdId);
  const fx = fxRate(edit.currency, hh.home_currency);
  db()
    .prepare(
      `UPDATE expenses SET amount_minor = ?, currency = ?, fx_to_home = ?,
       category_id = ?, merchant = ?, note = ?, spent_on = ?, spent_time = ?
       WHERE id = ?`
    )
    .run(
      Math.round(edit.amount * 100),
      edit.currency,
      fx,
      edit.categoryId,
      edit.merchant,
      edit.note,
      edit.spentOn,
      edit.spentTime,
      id
    );
  return "ok";
}

// ---------------------------------------------------------------------------
// Summaries (all in the household home currency, minor units)

export type MonthSummary = {
  month: string; // YYYY-MM
  totalMinor: number;
  prevTotalMinor: number;
  byCategory: { name: string; emoji: string; color: string; totalMinor: number }[];
  byPerson: { id: string; name: string; totalMinor: number }[];
  byDay: { day: string; totalMinor: number }[];
  count: number;
};

function monthTotal(householdId: string, month: string): number {
  const rows = db()
    .prepare(
      `SELECT amount_minor, fx_to_home FROM expenses
       WHERE household_id = ? AND spent_on LIKE ?`
    )
    .all(householdId, month + "%") as { amount_minor: number; fx_to_home: number }[];
  return rows.reduce((s, r) => s + toHomeMinor(r.amount_minor, r.fx_to_home), 0);
}

export function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthSummary(householdId: string, month: string): MonthSummary {
  const rows = db()
    .prepare(
      `SELECT e.amount_minor, e.fx_to_home, e.spent_on, e.user_id, u.name AS user_name,
              c.name AS category_name, c.emoji AS category_emoji, c.color AS category_color
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.household_id = ? AND e.spent_on LIKE ?`
    )
    .all(householdId, month + "%") as {
    amount_minor: number;
    fx_to_home: number;
    spent_on: string;
    user_id: string;
    user_name: string;
    category_name: string | null;
    category_emoji: string | null;
    category_color: string | null;
  }[];

  let total = 0;
  const cats = new Map<string, { name: string; emoji: string; color: string; totalMinor: number }>();
  const people = new Map<string, { id: string; name: string; totalMinor: number }>();
  const days = new Map<string, number>();

  for (const r of rows) {
    const home = toHomeMinor(r.amount_minor, r.fx_to_home);
    total += home;

    const cname = r.category_name ?? "Uncategorized";
    const c = cats.get(cname) ?? {
      name: cname,
      emoji: r.category_emoji ?? "🧾",
      color: r.category_color ?? "#6B7A70",
      totalMinor: 0,
    };
    c.totalMinor += home;
    cats.set(cname, c);

    const p = people.get(r.user_id) ?? { id: r.user_id, name: r.user_name, totalMinor: 0 };
    p.totalMinor += home;
    people.set(r.user_id, p);

    days.set(r.spent_on, (days.get(r.spent_on) ?? 0) + home);
  }

  return {
    month,
    totalMinor: total,
    prevTotalMinor: monthTotal(householdId, prevMonth(month)),
    byCategory: [...cats.values()].sort((a, b) => b.totalMinor - a.totalMinor),
    byPerson: [...people.values()].sort((a, b) => b.totalMinor - a.totalMinor),
    byDay: [...days.entries()]
      .map(([day, totalMinor]) => ({ day, totalMinor }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    count: rows.length,
  };
}

export type SpendingPace = {
  asOfDay: number;
  currentMinor: number;
  typicalMinor: number;
  differenceMinor: number;
  differencePct: number;
  direction: "above" | "below" | "near";
  comparisonMonths: string[];
};

export function calculateSpendingPace(
  asOfDay: number,
  currentMinor: number,
  comparableMonths: { month: string; totalMinor: number }[]
): SpendingPace | null {
  if (comparableMonths.length < 2) return null;

  const totals = comparableMonths
    .map((item) => item.totalMinor)
    .sort((a, b) => a - b);
  const middle = Math.floor(totals.length / 2);
  const typicalMinor =
    totals.length % 2 === 0
      ? Math.round((totals[middle - 1] + totals[middle]) / 2)
      : totals[middle];
  if (typicalMinor <= 0) return null;

  const differenceMinor = currentMinor - typicalMinor;
  const differencePct = Math.round((differenceMinor / typicalMinor) * 100);
  const direction =
    Math.abs(differencePct) <= 5 ? "near" : differenceMinor > 0 ? "above" : "below";

  return {
    asOfDay,
    currentMinor,
    typicalMinor,
    differenceMinor,
    differencePct,
    direction,
    comparisonMonths: comparableMonths.map((item) => item.month),
  };
}

export function getSpendingPace(
  householdId: string,
  asOfDate: string
): SpendingPace | null {
  const currentMonth = asOfDate.slice(0, 7);
  const asOfDay = Number(asOfDate.slice(8, 10));
  const comparisonMonths = [
    prevMonth(prevMonth(prevMonth(currentMonth))),
    prevMonth(prevMonth(currentMonth)),
    prevMonth(currentMonth),
  ];
  const earliestDate = comparisonMonths[0] + "-01";
  const nextMonthDate = nextMonth(currentMonth) + "-01";
  const rows = db()
    .prepare(
      `SELECT amount_minor, fx_to_home, spent_on
       FROM expenses
       WHERE household_id = ? AND spent_on >= ? AND spent_on < ?`
    )
    .all(householdId, earliestDate, nextMonthDate) as {
    amount_minor: number;
    fx_to_home: number;
    spent_on: string;
  }[];

  let currentMinor = 0;
  const historical = new Map<string, { totalMinor: number; count: number }>(
    comparisonMonths.map((month) => [month, { totalMinor: 0, count: 0 }])
  );

  for (const row of rows) {
    const month = row.spent_on.slice(0, 7);
    const day = Number(row.spent_on.slice(8, 10));
    const homeMinor = toHomeMinor(row.amount_minor, row.fx_to_home);
    if (month === currentMonth) {
      if (row.spent_on <= asOfDate) currentMinor += homeMinor;
      continue;
    }
    const bucket = historical.get(month);
    if (bucket && day <= asOfDay) {
      bucket.totalMinor += homeMinor;
      bucket.count += 1;
    }
  }

  return calculateSpendingPace(
    asOfDay,
    currentMinor,
    comparisonMonths
      .map((month) => ({ month, ...historical.get(month)! }))
      .filter((item) => item.count > 0)
      .map(({ month, totalMinor }) => ({ month, totalMinor }))
  );
}

// ---------------------------------------------------------------------------
// Presets

export type Preset = {
  id: string;
  household_id: string;
  label: string;
  emoji: string;
  amount_minor: number;
  currency: string;
  category_id: string | null;
  sort: number;
};

export function listPresets(householdId: string): Preset[] {
  return db()
    .prepare("SELECT * FROM presets WHERE household_id = ? ORDER BY sort, rowid")
    .all(householdId) as Preset[];
}

export function createPreset(opts: {
  householdId: string;
  label: string;
  emoji: string;
  amountMinor: number;
  currency: string;
  categoryId: string | null;
}): Preset {
  const id = uid();
  db()
    .prepare(
      `INSERT INTO presets (id, household_id, label, emoji, amount_minor, currency, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, opts.householdId, opts.label, opts.emoji, opts.amountMinor, opts.currency, opts.categoryId);
  return db().prepare("SELECT * FROM presets WHERE id = ?").get(id) as Preset;
}

export function deletePreset(id: string, householdId: string): boolean {
  const res = db()
    .prepare("DELETE FROM presets WHERE id = ? AND household_id = ?")
    .run(id, householdId);
  return res.changes > 0;
}

export function logPreset(presetId: string, householdId: string, userId: string) {
  const p = db()
    .prepare("SELECT * FROM presets WHERE id = ? AND household_id = ?")
    .get(presetId, householdId) as Preset | undefined;
  if (!p) return null;
  const hh = getHousehold(householdId);
  const fx = fxRate(p.currency, hh.home_currency);
  const cat = p.category_id
    ? (db().prepare("SELECT name, emoji FROM categories WHERE id = ?").get(p.category_id) as
        | { name: string; emoji: string }
        | undefined)
    : undefined;
  const id = uid();
  db()
    .prepare(
      `INSERT INTO expenses
       (id, household_id, user_id, amount_minor, currency, fx_to_home, category_id,
        merchant, note, spent_on, spent_time, source, raw_input, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'preset', ?, ?)`
    )
    .run(
      id,
      householdId,
      userId,
      p.amount_minor,
      p.currency,
      fx,
      p.category_id,
      null,
      p.label,
      todayISO(),
      nowHHMM(),
      p.label,
      Date.now()
    );
  return {
    id,
    summary: `${formatMinor(p.amount_minor, p.currency)} · ${cat ? cat.emoji + " " + cat.name : p.label} ✓`,
  };
}
