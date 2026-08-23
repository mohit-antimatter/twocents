import { db, isUniqueViolation, uid } from "./db";
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

export async function getHousehold(householdId: string): Promise<Household> {
  const household = (
    await db().query<Household>(
      "SELECT id, name, home_currency, invite_code FROM households WHERE id = $1",
      [householdId]
    )
  ).rows[0];
  if (!household) throw new Error("Household not found.");
  return household;
}

export async function getMembers(
  householdId: string
): Promise<{ id: string; name: string }[]> {
  return (
    await db().query<{ id: string; name: string }>(
      `SELECT u.id, u.name FROM household_members m JOIN users u ON u.id = m.user_id
       WHERE m.household_id = $1 ORDER BY m.joined_at`,
      [householdId]
    )
  ).rows;
}

export async function createExpenseFromParsed(opts: {
  householdId: string;
  userId: string;
  parsed: ParsedExpense;
  source: string;
  rawInput: string | null;
  requestId?: string | null;
}): Promise<{ id: string; summary: string; created: boolean }> {
  const [hh, cats] = await Promise.all([
    getHousehold(opts.householdId),
    listCategories(opts.householdId),
  ]);
  const currency = opts.parsed.currency ?? hh.home_currency;
  const amountMinor = Math.round(opts.parsed.amount * 100);
  const fx = fxRate(currency, hh.home_currency);

  const cat = opts.parsed.category
    ? cats.find((c) => c.name === opts.parsed.category) ?? null
    : null;
  const fallbackCat = cat ?? cats.find((c) => c.name === "Other") ?? null;

  if (opts.requestId) {
    const existing = await expenseByRequestId(opts.householdId, opts.userId, opts.requestId);
    if (existing) return { ...existing, created: false };
  }

  const id = uid();
  // Time of spend: when logging for today, stamp the current time; a
  // backdated entry's time is unknown and stays editable-but-empty.
  const spentTime = opts.parsed.spent_on === todayISO() ? nowHHMM() : null;
  try {
    await db().query(
        `INSERT INTO expenses
         (id, household_id, user_id, amount_minor, currency, fx_to_home, category_id,
          merchant, note, spent_on, spent_time, source, raw_input, request_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
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
        Date.now(),
      ]
    );
  } catch (error) {
    // Two concurrent retries can both pass the lookup above. The unique index
    // lets one win; the loser returns the already-created expense.
    if (opts.requestId && isUniqueViolation(error, "idx_expenses_user_request")) {
      const existing = await expenseByRequestId(
        opts.householdId,
        opts.userId,
        opts.requestId
      );
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

async function expenseByRequestId(
  householdId: string,
  userId: string,
  requestId: string
): Promise<{ id: string; summary: string } | null> {
  const row = (
    await db().query<{
      id: string;
      amount_minor: number;
      currency: string;
      merchant: string | null;
      category_name: string | null;
      category_emoji: string | null;
    }>(
      `SELECT e.id, e.amount_minor, e.currency, e.merchant,
              c.name AS category_name, c.emoji AS category_emoji
       FROM expenses e
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.household_id = $1 AND e.user_id = $2 AND e.request_id = $3`,
      [householdId, userId, requestId]
    )
  ).rows[0];
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

export async function listRecentExpenses(
  householdId: string,
  limit = 30
): Promise<ExpenseRow[]> {
  return (
    await db().query<ExpenseRow>(
      `SELECT e.*, u.name AS user_name,
              c.name AS category_name, c.emoji AS category_emoji, c.color AS category_color
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.household_id = $1
       ORDER BY e.spent_on DESC, e.created_at DESC
       LIMIT $2`,
      [householdId, limit]
    )
  ).rows;
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

export async function listExpensesForExport(
  householdId: string
): Promise<ExpenseExportRow[]> {
  return (
    await db().query<ExpenseExportRow>(
      `SELECT e.id, e.amount_minor, e.currency, e.fx_to_home, e.merchant, e.note,
              e.spent_on, e.spent_time, e.source, e.created_at,
              u.name AS user_name, c.name AS category_name
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.household_id = $1
       ORDER BY e.spent_on, COALESCE(e.spent_time, ''), e.created_at, e.id`,
      [householdId]
    )
  ).rows;
}

// Only the person who logged an expense may delete or edit it.
export async function deleteExpense(
  id: string,
  householdId: string,
  userId: string
): Promise<"ok" | "not_found" | "forbidden"> {
  const row = (
    await db().query<{ user_id: string }>(
      "SELECT user_id FROM expenses WHERE id = $1 AND household_id = $2",
      [id, householdId]
    )
  ).rows[0];
  if (!row) return "not_found";
  if (row.user_id !== userId) return "forbidden";
  await db().query("DELETE FROM expenses WHERE id = $1 AND user_id = $2", [id, userId]);
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

export async function updateExpense(
  id: string,
  householdId: string,
  userId: string,
  edit: ExpenseEdit
): Promise<"ok" | "not_found" | "forbidden"> {
  const row = (
    await db().query<{ user_id: string }>(
      "SELECT user_id FROM expenses WHERE id = $1 AND household_id = $2",
      [id, householdId]
    )
  ).rows[0];
  if (!row) return "not_found";
  if (row.user_id !== userId) return "forbidden";

  const hh = await getHousehold(householdId);
  const fx = fxRate(edit.currency, hh.home_currency);
  await db().query(
    `UPDATE expenses SET amount_minor = $1, currency = $2, fx_to_home = $3,
     category_id = $4, merchant = $5, note = $6, spent_on = $7, spent_time = $8
     WHERE id = $9`,
    [
      Math.round(edit.amount * 100),
      edit.currency,
      fx,
      edit.categoryId,
      edit.merchant,
      edit.note,
      edit.spentOn,
      edit.spentTime,
      id,
    ]
  );
  return "ok";
}

// ---------------------------------------------------------------------------
// Summaries (all in the household home currency, minor units)

export type MonthSummary = {
  month: string; // YYYY-MM
  totalMinor: number;
  prevTotalMinor: number;
  byCategory: {
    name: string;
    emoji: string;
    color: string;
    totalMinor: number;
    titles: { title: string; totalMinor: number; count: number }[];
  }[];
  byPerson: { id: string; name: string; totalMinor: number }[];
  byDay: { day: string; totalMinor: number }[];
  count: number;
};

async function monthTotal(householdId: string, month: string): Promise<number> {
  const rows = (
    await db().query<{ amount_minor: number; fx_to_home: number }>(
      `SELECT amount_minor, fx_to_home FROM expenses
       WHERE household_id = $1 AND spent_on >= $2 AND spent_on < $3`,
      [householdId, `${month}-01`, `${nextMonth(month)}-01`]
    )
  ).rows;
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

export async function getMonthSummary(
  householdId: string,
  month: string
): Promise<MonthSummary> {
  const rows = (
    await db().query<{
      amount_minor: number;
      fx_to_home: number;
      spent_on: string;
      user_id: string;
      user_name: string;
      merchant: string | null;
      note: string | null;
      category_name: string | null;
      category_emoji: string | null;
      category_color: string | null;
    }>(
      `SELECT e.amount_minor, e.fx_to_home, e.spent_on, e.user_id, e.merchant, e.note,
              u.name AS user_name,
              c.name AS category_name, c.emoji AS category_emoji, c.color AS category_color
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN categories c ON c.id = e.category_id
       WHERE e.household_id = $1 AND e.spent_on >= $2 AND e.spent_on < $3`,
      [householdId, `${month}-01`, `${nextMonth(month)}-01`]
    )
  ).rows;

  let total = 0;
  const cats = new Map<
    string,
    {
      name: string;
      emoji: string;
      color: string;
      totalMinor: number;
      titles: Map<string, { title: string; totalMinor: number; count: number }>;
    }
  >();
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
      titles: new Map(),
    };
    c.totalMinor += home;
    const title = r.merchant?.trim() || r.note?.trim() || "Other expenses";
    const titleKey = title.toLocaleLowerCase("en");
    const titleGroup = c.titles.get(titleKey) ?? { title, totalMinor: 0, count: 0 };
    titleGroup.totalMinor += home;
    titleGroup.count += 1;
    c.titles.set(titleKey, titleGroup);
    cats.set(cname, c);

    const p = people.get(r.user_id) ?? { id: r.user_id, name: r.user_name, totalMinor: 0 };
    p.totalMinor += home;
    people.set(r.user_id, p);

    days.set(r.spent_on, (days.get(r.spent_on) ?? 0) + home);
  }

  return {
    month,
    totalMinor: total,
    prevTotalMinor: await monthTotal(householdId, prevMonth(month)),
    byCategory: [...cats.values()]
      .map(({ titles, ...category }) => ({
        ...category,
        titles: [...titles.values()].sort(
          (a, b) => b.totalMinor - a.totalMinor || a.title.localeCompare(b.title)
        ),
      }))
      .sort((a, b) => b.totalMinor - a.totalMinor),
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

export async function getSpendingPace(
  householdId: string,
  asOfDate: string
): Promise<SpendingPace | null> {
  const currentMonth = asOfDate.slice(0, 7);
  const asOfDay = Number(asOfDate.slice(8, 10));
  const comparisonMonths = [
    prevMonth(prevMonth(prevMonth(currentMonth))),
    prevMonth(prevMonth(currentMonth)),
    prevMonth(currentMonth),
  ];
  const earliestDate = comparisonMonths[0] + "-01";
  const nextMonthDate = nextMonth(currentMonth) + "-01";
  const rows = (
    await db().query<{
      amount_minor: number;
      fx_to_home: number;
      spent_on: string;
    }>(
      `SELECT amount_minor, fx_to_home, spent_on
       FROM expenses
       WHERE household_id = $1 AND spent_on >= $2 AND spent_on < $3`,
      [householdId, earliestDate, nextMonthDate]
    )
  ).rows;

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

export async function listPresets(householdId: string): Promise<Preset[]> {
  return (
    await db().query<Preset>(
      "SELECT * FROM presets WHERE household_id = $1 ORDER BY sort, id",
      [householdId]
    )
  ).rows;
}

export async function createPreset(opts: {
  householdId: string;
  label: string;
  emoji: string;
  amountMinor: number;
  currency: string;
  categoryId: string | null;
}): Promise<Preset> {
  const id = uid();
  await db().query(
      `INSERT INTO presets (id, household_id, label, emoji, amount_minor, currency, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, opts.householdId, opts.label, opts.emoji, opts.amountMinor, opts.currency, opts.categoryId]
  );
  return (await db().query<Preset>("SELECT * FROM presets WHERE id = $1", [id])).rows[0];
}

export async function deletePreset(id: string, householdId: string): Promise<boolean> {
  const result = await db().query(
    "DELETE FROM presets WHERE id = $1 AND household_id = $2",
    [id, householdId]
  );
  return result.rowCount > 0;
}

export async function logPreset(presetId: string, householdId: string, userId: string) {
  const p = (
    await db().query<Preset>(
      "SELECT * FROM presets WHERE id = $1 AND household_id = $2",
      [presetId, householdId]
    )
  ).rows[0];
  if (!p) return null;
  const hh = await getHousehold(householdId);
  const fx = fxRate(p.currency, hh.home_currency);
  const cat = p.category_id
    ? (
        await db().query<{ name: string; emoji: string }>(
          "SELECT name, emoji FROM categories WHERE id = $1 AND household_id = $2",
          [p.category_id, householdId]
        )
      ).rows[0]
    : undefined;
  const id = uid();
  await db().query(
      `INSERT INTO expenses
       (id, household_id, user_id, amount_minor, currency, fx_to_home, category_id,
        merchant, note, spent_on, spent_time, source, raw_input, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'preset', $12, $13)`,
    [
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
      Date.now(),
    ]
  );
  return {
    id,
    summary: `${formatMinor(p.amount_minor, p.currency)} · ${cat ? cat.emoji + " " + cat.name : p.label} ✓`,
  };
}
