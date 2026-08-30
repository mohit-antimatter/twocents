import { db, uid, type AppDatabase, type Queryable } from "./db";
import { CURRENCIES } from "./money";
import { isValidISODate, isValidTime } from "./validation";

// Persisted identifier: backups made before the OurPool rebrand remain compatible.
const BACKUP_FORMAT = "twocents-household-backup";
const BACKUP_VERSION = 1;

type BackupCategory = {
  name: string;
  emoji: string;
  color: string;
  sort: number;
  budget_minor: number | null;
};

type BackupRecurring = {
  id: string;
  user_email: string;
  label: string;
  amount_minor: number;
  currency: string;
  category_name: string | null;
  frequency: "weekly" | "monthly";
  anchor_day: number;
  next_due_on: string;
  active: boolean;
  created_at: number;
};

type BackupExpense = {
  user_email: string;
  amount_minor: number;
  currency: string;
  fx_to_home: number;
  category_name: string | null;
  merchant: string | null;
  note: string | null;
  spent_on: string;
  spent_time: string | null;
  source: string;
  raw_input: string | null;
  recurring_rule_id: string | null;
  created_at: number;
};

type BackupPreset = {
  label: string;
  emoji: string;
  amount_minor: number;
  currency: string;
  category_name: string | null;
  sort: number;
};

export type HouseholdBackup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exported_at: string;
  household: { name: string; home_currency: string };
  members: { name: string; email: string }[];
  categories: BackupCategory[];
  recurring: BackupRecurring[];
  expenses: BackupExpense[];
  presets: BackupPreset[];
};

export type DataCounts = {
  expenses: number;
  recurring: number;
  presets: number;
  categoryGuides: number;
};

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupValidationError";
  }
}

export async function createHouseholdBackup(
  householdId: string,
  database: AppDatabase = db()
): Promise<HouseholdBackup> {
  const [householdResult, members, categories, recurring, expenses, presets] =
    await Promise.all([
      database.query<{ name: string; home_currency: string }>(
        "SELECT name, home_currency FROM households WHERE id = $1",
        [householdId]
      ),
      database.query<{ name: string; email: string }>(
        `SELECT u.name, u.email
         FROM household_members m JOIN users u ON u.id = m.user_id
         WHERE m.household_id = $1 ORDER BY m.joined_at`,
        [householdId]
      ),
      database.query<BackupCategory>(
        `SELECT name, emoji, color, sort, budget_minor
         FROM categories WHERE household_id = $1 ORDER BY sort, name`,
        [householdId]
      ),
      database.query<Omit<BackupRecurring, "active"> & { active: number }>(
        `SELECT r.id, u.email AS user_email, r.label, r.amount_minor, r.currency,
                c.name AS category_name, r.frequency, r.anchor_day, r.next_due_on,
                r.active, r.created_at
         FROM recurring_expenses r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN categories c ON c.id = r.category_id
         WHERE r.household_id = $1 ORDER BY r.created_at, r.id`,
        [householdId]
      ),
      database.query<BackupExpense>(
        `SELECT u.email AS user_email, e.amount_minor, e.currency, e.fx_to_home,
                c.name AS category_name, e.merchant, e.note, e.spent_on, e.spent_time,
                e.source, e.raw_input, e.recurring_rule_id, e.created_at
         FROM expenses e
         JOIN users u ON u.id = e.user_id
         LEFT JOIN categories c ON c.id = e.category_id
         WHERE e.household_id = $1
         ORDER BY e.spent_on, COALESCE(e.spent_time, ''), e.created_at, e.id`,
        [householdId]
      ),
      database.query<BackupPreset>(
        `SELECT p.label, p.emoji, p.amount_minor, p.currency,
                c.name AS category_name, p.sort
         FROM presets p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.household_id = $1 ORDER BY p.sort, p.label`,
        [householdId]
      ),
    ]);
  const household = householdResult.rows[0];
  if (!household) throw new Error("Household not found.");

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    household,
    members: members.rows,
    categories: categories.rows,
    recurring: recurring.rows.map((row) => ({ ...row, active: Boolean(row.active) })),
    expenses: expenses.rows,
    presets: presets.rows,
  };
}

export function backupFilename(householdName: string, today: string): string {
  const slug = householdName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48) || "household";
  return `ourpool-${slug}-${today}.backup.json`;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BackupValidationError(`${label} is missing or invalid.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new BackupValidationError(`${label} is missing, invalid, or too large.`);
  }
  return value;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new BackupValidationError(`${label} is missing or invalid.`);
  }
  return value.trim();
}

function nullableText(value: unknown, label: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > max) {
    throw new BackupValidationError(`${label} is invalid.`);
  }
  return value;
}

function safeInteger(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new BackupValidationError(`${label} is invalid.`);
  }
  return value as number;
}

function currency(value: unknown, label: string): string {
  const result = text(value, label, 3).toUpperCase();
  if (!CURRENCIES[result]) throw new BackupValidationError(`${label} is not supported.`);
  return result;
}

function email(value: unknown, label: string): string {
  const result = text(value, label, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new BackupValidationError(`${label} is invalid.`);
  }
  return result;
}

function date(value: unknown, label: string): string {
  const result = text(value, label, 10);
  if (!isValidISODate(result)) throw new BackupValidationError(`${label} is invalid.`);
  return result;
}

function time(value: unknown, label: string): string | null {
  const result = nullableText(value, label, 5);
  if (result && !isValidTime(result)) throw new BackupValidationError(`${label} is invalid.`);
  return result;
}

export function validateHouseholdBackup(value: unknown): HouseholdBackup {
  const root = record(value, "Backup");
  if (root.format !== BACKUP_FORMAT || root.version !== BACKUP_VERSION) {
    throw new BackupValidationError("This is not a supported OurPool backup.");
  }
  const householdInput = record(root.household, "Household");
  const homeCurrency = currency(householdInput.home_currency, "Household currency");
  const exportedAt = text(root.exported_at, "Export time", 40);
  if (!Number.isFinite(Date.parse(exportedAt))) {
    throw new BackupValidationError("Export time is invalid.");
  }

  const members = array(root.members, "Members", 2).map((item, index) => {
    const row = record(item, `Member ${index + 1}`);
    return {
      name: text(row.name, `Member ${index + 1} name`, 80),
      email: email(row.email, `Member ${index + 1} email`),
    };
  });
  if (!members.length || new Set(members.map((member) => member.email)).size !== members.length) {
    throw new BackupValidationError("Backup members are missing or duplicated.");
  }

  const categories = array(root.categories, "Categories", 100).map((item, index) => {
    const row = record(item, `Category ${index + 1}`);
    const budget = row.budget_minor === null
      ? null
      : safeInteger(row.budget_minor, `Category ${index + 1} guide`, 1);
    const color = text(row.color, `Category ${index + 1} color`, 24);
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      throw new BackupValidationError(`Category ${index + 1} color is invalid.`);
    }
    return {
      name: text(row.name, `Category ${index + 1} name`, 80),
      emoji: text(row.emoji, `Category ${index + 1} emoji`, 24),
      color,
      sort: safeInteger(row.sort, `Category ${index + 1} order`, 0, 10_000),
      budget_minor: budget,
    };
  });
  if (new Set(categories.map((category) => category.name.toLowerCase())).size !== categories.length) {
    throw new BackupValidationError("Backup categories contain duplicate names.");
  }

  const recurring = array(root.recurring, "Recurring schedules", 2_000).map((item, index) => {
    const row = record(item, `Recurring schedule ${index + 1}`);
    if (row.frequency !== "weekly" && row.frequency !== "monthly") {
      throw new BackupValidationError(`Recurring schedule ${index + 1} frequency is invalid.`);
    }
    const frequency: "weekly" | "monthly" = row.frequency;
    if (typeof row.active !== "boolean") {
      throw new BackupValidationError(`Recurring schedule ${index + 1} status is invalid.`);
    }
    return {
      id: text(row.id, `Recurring schedule ${index + 1} ID`, 100),
      user_email: email(row.user_email, `Recurring schedule ${index + 1} payer`),
      label: text(row.label, `Recurring schedule ${index + 1} label`, 120),
      amount_minor: safeInteger(row.amount_minor, `Recurring schedule ${index + 1} amount`, 1),
      currency: currency(row.currency, `Recurring schedule ${index + 1} currency`),
      category_name: nullableText(row.category_name, `Recurring schedule ${index + 1} category`, 80),
      frequency,
      anchor_day: safeInteger(row.anchor_day, `Recurring schedule ${index + 1} anchor`, 1, 31),
      next_due_on: date(row.next_due_on, `Recurring schedule ${index + 1} next date`),
      active: row.active,
      created_at: safeInteger(row.created_at, `Recurring schedule ${index + 1} created time`),
    };
  });
  if (new Set(recurring.map((rule) => rule.id)).size !== recurring.length) {
    throw new BackupValidationError("Recurring schedule IDs are duplicated.");
  }

  const expenses = array(root.expenses, "Expenses", 50_000).map((item, index) => {
    const row = record(item, `Expense ${index + 1}`);
    if (typeof row.fx_to_home !== "number" || !Number.isFinite(row.fx_to_home) || row.fx_to_home <= 0 || row.fx_to_home > 1_000_000) {
      throw new BackupValidationError(`Expense ${index + 1} exchange rate is invalid.`);
    }
    return {
      user_email: email(row.user_email, `Expense ${index + 1} payer`),
      amount_minor: safeInteger(row.amount_minor, `Expense ${index + 1} amount`, 1),
      currency: currency(row.currency, `Expense ${index + 1} currency`),
      fx_to_home: row.fx_to_home,
      category_name: nullableText(row.category_name, `Expense ${index + 1} category`, 80),
      merchant: nullableText(row.merchant, `Expense ${index + 1} merchant`, 120),
      note: nullableText(row.note, `Expense ${index + 1} note`, 500),
      spent_on: date(row.spent_on, `Expense ${index + 1} date`),
      spent_time: time(row.spent_time, `Expense ${index + 1} time`),
      source: text(row.source, `Expense ${index + 1} source`, 40),
      raw_input: nullableText(row.raw_input, `Expense ${index + 1} raw input`, 2_000),
      recurring_rule_id: nullableText(row.recurring_rule_id, `Expense ${index + 1} recurring ID`, 100),
      created_at: safeInteger(row.created_at, `Expense ${index + 1} created time`),
    };
  });

  const presets = array(root.presets, "Presets", 2_000).map((item, index) => {
    const row = record(item, `Preset ${index + 1}`);
    return {
      label: text(row.label, `Preset ${index + 1} label`, 80),
      emoji: text(row.emoji, `Preset ${index + 1} emoji`, 24),
      amount_minor: safeInteger(row.amount_minor, `Preset ${index + 1} amount`, 1),
      currency: currency(row.currency, `Preset ${index + 1} currency`),
      category_name: nullableText(row.category_name, `Preset ${index + 1} category`, 80),
      sort: safeInteger(row.sort, `Preset ${index + 1} order`, 0, 10_000),
    };
  });

  const memberEmails = new Set(members.map((member) => member.email));
  const referencedMember = [...recurring, ...expenses].find(
    (item) => !memberEmails.has(item.user_email)
  );
  if (referencedMember) {
    throw new BackupValidationError(
      `Backup payer ${referencedMember.user_email} is not listed as a member.`
    );
  }

  const categoryNames = new Set(categories.map((category) => category.name.toLowerCase()));
  const referencedCategory = [...recurring, ...expenses, ...presets]
    .map((item) => item.category_name)
    .find((name): name is string => Boolean(name && !categoryNames.has(name.toLowerCase())));
  if (referencedCategory) {
    throw new BackupValidationError(
      `Backup category ${referencedCategory} is referenced but not included.`
    );
  }

  const recurringIds = new Set(recurring.map((rule) => rule.id));
  const missingRecurringId = expenses
    .map((expense) => expense.recurring_rule_id)
    .find((id): id is string => Boolean(id && !recurringIds.has(id)));
  if (missingRecurringId) {
    throw new BackupValidationError(
      `Backup recurring schedule ${missingRecurringId} is referenced but not included.`
    );
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date(exportedAt).toISOString(),
    household: {
      name: text(householdInput.name, "Household name", 80),
      home_currency: homeCurrency,
    },
    members,
    categories,
    recurring,
    expenses,
    presets,
  };
}

async function clearFinancialData(
  householdId: string,
  client: Queryable
): Promise<DataCounts> {
  const expenseResult = await client.query("DELETE FROM expenses WHERE household_id = $1", [
    householdId,
  ]);
  const recurringResult = await client.query(
    "DELETE FROM recurring_expenses WHERE household_id = $1",
    [householdId]
  );
  const presetResult = await client.query("DELETE FROM presets WHERE household_id = $1", [
    householdId,
  ]);
  const guideResult = await client.query(
    "UPDATE categories SET budget_minor = NULL WHERE household_id = $1 AND budget_minor IS NOT NULL",
    [householdId]
  );
  return {
    expenses: expenseResult.rowCount,
    recurring: recurringResult.rowCount,
    presets: presetResult.rowCount,
    categoryGuides: guideResult.rowCount,
  };
}

export async function clearHouseholdFinancialData(
  householdId: string,
  database: AppDatabase = db()
): Promise<DataCounts> {
  return database.transaction((client) => clearFinancialData(householdId, client));
}

export async function replaceHouseholdFromBackup(
  householdId: string,
  rawBackup: unknown,
  database: AppDatabase = db()
): Promise<DataCounts> {
  const backup = validateHouseholdBackup(rawBackup);
  const [household, memberRows] = await Promise.all([
    database.query<{ home_currency: string }>(
      "SELECT home_currency FROM households WHERE id = $1",
      [householdId]
    ),
    database.query<{ id: string; email: string }>(
      `SELECT u.id, u.email
       FROM household_members m JOIN users u ON u.id = m.user_id
       WHERE m.household_id = $1`,
      [householdId]
    ),
  ]);
  const homeCurrency = household.rows[0]?.home_currency;
  if (!homeCurrency) throw new BackupValidationError("Household not found.");
  if (homeCurrency !== backup.household.home_currency) {
    throw new BackupValidationError(
      `This backup uses ${backup.household.home_currency}, but this household uses ${homeCurrency}.`
    );
  }
  const memberByEmail = new Map(memberRows.rows.map((member) => [member.email, member.id]));
  const referencedEmails = new Set([
    ...backup.expenses.map((item) => item.user_email),
    ...backup.recurring.map((item) => item.user_email),
  ]);
  const missingEmail = [...referencedEmails].find((item) => !memberByEmail.has(item));
  if (missingEmail) {
    throw new BackupValidationError(
      `The backup includes ${missingEmail}, who is not a member of this household.`
    );
  }

  return database.transaction(async (client) => {
    await clearFinancialData(householdId, client);

    const existingCategories = await client.query<{ id: string; name: string }>(
      "SELECT id, name FROM categories WHERE household_id = $1",
      [householdId]
    );
    const categoryByName = new Map(
      existingCategories.rows.map((category) => [category.name.toLowerCase(), category.id])
    );
    for (const category of backup.categories) {
      const key = category.name.toLowerCase();
      let categoryId = categoryByName.get(key);
      if (categoryId) {
        await client.query(
          `UPDATE categories SET emoji = $1, color = $2, sort = $3, budget_minor = $4
           WHERE id = $5 AND household_id = $6`,
          [category.emoji, category.color, category.sort, category.budget_minor, categoryId, householdId]
        );
      } else {
        categoryId = uid();
        await client.query(
          `INSERT INTO categories (id, household_id, name, emoji, color, sort, budget_minor)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [categoryId, householdId, category.name, category.emoji, category.color, category.sort, category.budget_minor]
        );
        categoryByName.set(key, categoryId);
      }
    }

    const categoryId = (name: string | null) =>
      name ? categoryByName.get(name.toLowerCase()) ?? null : null;
    const recurringIdMap = new Map<string, string>();
    for (const rule of backup.recurring) {
      const newId = uid();
      recurringIdMap.set(rule.id, newId);
      await client.query(
        `INSERT INTO recurring_expenses
         (id, household_id, user_id, label, amount_minor, currency, category_id,
          frequency, anchor_day, next_due_on, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          newId,
          householdId,
          memberByEmail.get(rule.user_email),
          rule.label,
          rule.amount_minor,
          rule.currency,
          categoryId(rule.category_name),
          rule.frequency,
          rule.anchor_day,
          rule.next_due_on,
          rule.active ? 1 : 0,
          rule.created_at,
        ]
      );
    }

    for (const expense of backup.expenses) {
      await client.query(
        `INSERT INTO expenses
         (id, household_id, user_id, amount_minor, currency, fx_to_home, category_id,
          merchant, note, spent_on, spent_time, source, raw_input, request_id,
          recurring_rule_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL, $14, $15)`,
        [
          uid(),
          householdId,
          memberByEmail.get(expense.user_email),
          expense.amount_minor,
          expense.currency,
          expense.fx_to_home,
          categoryId(expense.category_name),
          expense.merchant,
          expense.note,
          expense.spent_on,
          expense.spent_time,
          expense.source,
          expense.raw_input,
          expense.recurring_rule_id
            ? recurringIdMap.get(expense.recurring_rule_id) ?? null
            : null,
          expense.created_at,
        ]
      );
    }

    for (const preset of backup.presets) {
      await client.query(
        `INSERT INTO presets
         (id, household_id, label, emoji, amount_minor, currency, category_id, sort)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          uid(),
          householdId,
          preset.label,
          preset.emoji,
          preset.amount_minor,
          preset.currency,
          categoryId(preset.category_name),
          preset.sort,
        ]
      );
    }

    return {
      expenses: backup.expenses.length,
      recurring: backup.recurring.length,
      presets: backup.presets.length,
      categoryGuides: backup.categories.filter((category) => category.budget_minor !== null).length,
    };
  });
}
