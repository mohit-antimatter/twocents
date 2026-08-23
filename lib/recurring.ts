import { listCategories } from "./categories";
import { db, uid } from "./db";
import { CURRENCIES, fxRate } from "./money";
import { isValidISODate } from "./validation";

export type RecurringFrequency = "weekly" | "monthly";

export type RecurringRule = {
  id: string;
  household_id: string;
  user_id: string;
  user_name: string;
  label: string;
  amount_minor: number;
  currency: string;
  category_id: string | null;
  category_name: string | null;
  category_emoji: string | null;
  frequency: RecurringFrequency;
  anchor_day: number;
  next_due_on: string;
  active: number;
  created_at: number;
};

type RecurringInput = {
  label: string;
  amountMinor: number;
  currency: string;
  categoryId: string | null;
  frequency: RecurringFrequency;
  nextDueOn: string;
};

type ValidationResult =
  | { ok: true; value: RecurringInput }
  | { ok: false; error: string };

const MAX_LABEL_LENGTH = 120;

function addYears(iso: string, years: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year + years, month - 1, day));
  return date.toISOString().slice(0, 10);
}

export function validateRecurringInput(
  body: Record<string, unknown>,
  today: string,
  validCategoryIds: readonly string[]
): ValidationResult {
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || label.length > MAX_LABEL_LENGTH) {
    return { ok: false, error: `Name must be between 1 and ${MAX_LABEL_LENGTH} characters.` };
  }

  const amount = Number(body.amount);
  const amountMinor = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amountMinor)) {
    return { ok: false, error: "Amount must be a positive number we can store safely." };
  }

  const currency = typeof body.currency === "string" ? body.currency : "";
  if (!CURRENCIES[currency]) return { ok: false, error: "Unknown currency." };

  const frequency = body.frequency;
  if (frequency !== "weekly" && frequency !== "monthly") {
    return { ok: false, error: "Choose weekly or monthly." };
  }

  const nextDueOn = typeof body.nextDueOn === "string" ? body.nextDueOn : "";
  if (!isValidISODate(nextDueOn) || nextDueOn < today || nextDueOn > addYears(today, 2)) {
    return { ok: false, error: "Choose a next date within the next two years." };
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

  return {
    ok: true,
    value: { label, amountMinor, currency, categoryId, frequency, nextDueOn },
  };
}

export function nextRecurringDate(
  currentDate: string,
  frequency: RecurringFrequency,
  anchorDay: number
): string {
  const [year, month, day] = currentDate.split("-").map(Number);
  if (frequency === "weekly") {
    const date = new Date(Date.UTC(year, month - 1, day + 7));
    return date.toISOString().slice(0, 10);
  }

  const nextMonthIndex = month;
  const lastDay = new Date(Date.UTC(year, nextMonthIndex + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, nextMonthIndex, Math.min(anchorDay, lastDay)));
  return date.toISOString().slice(0, 10);
}

function recurringDateOnOrAfter(
  nextDueOn: string,
  today: string,
  frequency: RecurringFrequency,
  anchorDay: number
): string {
  let candidate = nextDueOn;
  while (candidate < today) candidate = nextRecurringDate(candidate, frequency, anchorDay);
  return candidate;
}

export async function listRecurringRules(householdId: string): Promise<RecurringRule[]> {
  return (
    await db().query<RecurringRule>(
      `SELECT r.*, u.name AS user_name,
              c.name AS category_name, c.emoji AS category_emoji
       FROM recurring_expenses r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE r.household_id = $1
       ORDER BY r.active DESC, r.next_due_on, r.created_at`,
      [householdId]
    )
  ).rows;
}

export async function createRecurringRule(
  householdId: string,
  userId: string,
  body: Record<string, unknown>,
  today: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const validation = validateRecurringInput(
    body,
    today,
    (await listCategories(householdId)).map((category) => category.id)
  );
  if (!validation.ok) return validation;

  const value = validation.value;
  const id = uid();
  await db().query(
      `INSERT INTO recurring_expenses
       (id, household_id, user_id, label, amount_minor, currency, category_id,
        frequency, anchor_day, next_due_on, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11)`,
    [
      id,
      householdId,
      userId,
      value.label,
      value.amountMinor,
      value.currency,
      value.categoryId,
      value.frequency,
      Number(value.nextDueOn.slice(8, 10)),
      value.nextDueOn,
      Date.now(),
    ]
  );
  return { ok: true, id };
}

export async function setRecurringActive(
  id: string,
  householdId: string,
  userId: string,
  active: boolean,
  today: string
): Promise<"ok" | "not_found" | "forbidden"> {
  const rule = (
    await db().query<{
      user_id: string;
      frequency: RecurringFrequency;
      anchor_day: number;
      next_due_on: string;
    }>(
      `SELECT user_id, frequency, anchor_day, next_due_on
       FROM recurring_expenses WHERE id = $1 AND household_id = $2`,
      [id, householdId]
    )
  ).rows[0];
  if (!rule) return "not_found";
  if (rule.user_id !== userId) return "forbidden";

  const nextDueOn = active
    ? recurringDateOnOrAfter(rule.next_due_on, today, rule.frequency, rule.anchor_day)
    : rule.next_due_on;
  await db().query(
    "UPDATE recurring_expenses SET active = $1, next_due_on = $2 WHERE id = $3",
    [active ? 1 : 0, nextDueOn, id]
  );
  return "ok";
}

export async function deleteRecurringRule(
  id: string,
  householdId: string,
  userId: string
): Promise<"ok" | "not_found" | "forbidden"> {
  const rule = (
    await db().query<{ user_id: string }>(
      "SELECT user_id FROM recurring_expenses WHERE id = $1 AND household_id = $2",
      [id, householdId]
    )
  ).rows[0];
  if (!rule) return "not_found";
  if (rule.user_id !== userId) return "forbidden";
  await db().query("DELETE FROM recurring_expenses WHERE id = $1 AND user_id = $2", [
    id,
    userId,
  ]);
  return "ok";
}

export async function materializeDueRecurring(
  householdId: string,
  today: string
): Promise<number> {
  const database = db();
  return database.transaction(async (client) => {
    const rules = (
      await client.query<Omit<RecurringRule, "user_name" | "category_name" | "category_emoji">>(
        `SELECT * FROM recurring_expenses
         WHERE household_id = $1 AND active = 1 AND next_due_on <= $2
         ORDER BY next_due_on, created_at
         FOR UPDATE`,
        [householdId, today]
      )
    ).rows;
    if (rules.length === 0) return 0;
    const household = (
      await client.query<{ home_currency: string }>(
        "SELECT home_currency FROM households WHERE id = $1",
        [householdId]
      )
    ).rows[0];
    if (!household) throw new Error("Household not found.");
    let created = 0;

    for (const rule of rules) {
      let dueOn = rule.next_due_on;
      while (dueOn <= today) {
        const result = await client.query<{ id: string }>(
          `INSERT INTO expenses
           (id, household_id, user_id, amount_minor, currency, fx_to_home, category_id,
            merchant, note, spent_on, spent_time, source, raw_input, request_id,
            recurring_rule_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, NULL,
                   'recurring', NULL, NULL, $10, $11)
           ON CONFLICT (recurring_rule_id, spent_on) DO NOTHING
           RETURNING id`,
          [
            uid(),
            householdId,
            rule.user_id,
            rule.amount_minor,
            rule.currency,
            fxRate(rule.currency, household.home_currency),
            rule.category_id,
            rule.label,
            dueOn,
            rule.id,
            Date.now(),
          ]
        );
        created += result.rowCount;
        dueOn = nextRecurringDate(dueOn, rule.frequency, rule.anchor_day);
      }
      await client.query(
        "UPDATE recurring_expenses SET next_due_on = $1 WHERE id = $2",
        [dueOn, rule.id]
      );
    }
    return created;
  });
}
