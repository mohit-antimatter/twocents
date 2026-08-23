import { listCategories } from "./categories";
import { db } from "./db";
import { toHomeMinor } from "./money";

export type BudgetDirection = "above" | "below" | "near";

export type CategoryBudgetPace = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  budgetMinor: number;
  spentMinor: number;
  expectedMinor: number;
  differenceMinor: number;
  remainingMinor: number;
  projectedMinor: number;
  percentUsed: number;
  elapsedPercent: number;
  direction: BudgetDirection;
  asOfDay: number;
  daysInMonth: number;
};

function roundToMajorUnit(minor: number): number {
  return Math.round(minor / 100) * 100;
}

export function validateBudgetAmount(
  rawAmount: unknown
): { ok: true; amountMinor: number } | { ok: false; error: string } {
  const amount = Number(rawAmount);
  const amountMinor = Math.round(amount * 100);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amountMinor <= 0 ||
    !Number.isSafeInteger(amountMinor)
  ) {
    return { ok: false, error: "Enter a positive monthly amount we can store safely." };
  }
  return { ok: true, amountMinor };
}

export async function setCategoryBudget(
  categoryId: string,
  householdId: string,
  rawAmount: unknown
): Promise<{ ok: true } | { ok: false; error: string; status: 400 | 404 }> {
  const validation = validateBudgetAmount(rawAmount);
  if (!validation.ok) return { ...validation, status: 400 };

  const result = await db().query(
    "UPDATE categories SET budget_minor = $1 WHERE id = $2 AND household_id = $3",
    [validation.amountMinor, categoryId, householdId]
  );
  if (result.rowCount === 0) {
    return { ok: false, error: "Category not found.", status: 404 };
  }
  return { ok: true };
}

export async function clearCategoryBudget(
  categoryId: string,
  householdId: string
): Promise<boolean> {
  const result = await db().query(
    "UPDATE categories SET budget_minor = NULL WHERE id = $1 AND household_id = $2",
    [categoryId, householdId]
  );
  return result.rowCount > 0;
}

export function calculateCategoryBudgetPace(
  category: {
    id: string;
    name: string;
    emoji: string;
    color: string;
    budgetMinor: number;
  },
  spentMinor: number,
  asOfDay: number,
  daysInMonth: number
): CategoryBudgetPace {
  const safeDaysInMonth = Math.max(1, daysInMonth);
  const safeDay = Math.min(Math.max(1, asOfDay), safeDaysInMonth);
  const expectedMinor = roundToMajorUnit(
    (category.budgetMinor * safeDay) / safeDaysInMonth
  );
  const differenceMinor = spentMinor - expectedMinor;
  const tolerance = Math.round(category.budgetMinor * 0.05);
  const direction: BudgetDirection =
    Math.abs(differenceMinor) <= tolerance
      ? "near"
      : differenceMinor > 0
        ? "above"
        : "below";

  return {
    ...category,
    spentMinor,
    expectedMinor,
    differenceMinor,
    remainingMinor: category.budgetMinor - spentMinor,
    projectedMinor: roundToMajorUnit((spentMinor / safeDay) * safeDaysInMonth),
    percentUsed: Math.round((spentMinor / category.budgetMinor) * 100),
    elapsedPercent: Math.round((safeDay / safeDaysInMonth) * 100),
    direction,
    asOfDay: safeDay,
    daysInMonth: safeDaysInMonth,
  };
}

export async function getCategoryBudgetPaces(
  householdId: string,
  asOfDate: string
): Promise<CategoryBudgetPace[]> {
  const [year, month, day] = asOfDate.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const budgeted = (await listCategories(householdId)).filter(
    (category) => category.budget_minor !== null && category.budget_minor > 0
  );
  if (budgeted.length === 0) return [];

  const rows = (
    await db().query<{
      category_id: string | null;
      amount_minor: number;
      fx_to_home: number;
    }>(
      `SELECT category_id, amount_minor, fx_to_home
       FROM expenses
       WHERE household_id = $1 AND spent_on >= $2 AND spent_on <= $3`,
      [householdId, `${asOfDate.slice(0, 7)}-01`, asOfDate]
    )
  ).rows;
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.category_id) continue;
    totals.set(
      row.category_id,
      (totals.get(row.category_id) ?? 0) + toHomeMinor(row.amount_minor, row.fx_to_home)
    );
  }

  return budgeted
    .map((category) =>
      calculateCategoryBudgetPace(
        {
          id: category.id,
          name: category.name,
          emoji: category.emoji,
          color: category.color,
          budgetMinor: category.budget_minor!,
        },
        totals.get(category.id) ?? 0,
        day,
        daysInMonth
      )
    )
    .sort((a, b) => {
      const aRelative = a.differenceMinor / a.budgetMinor;
      const bRelative = b.differenceMinor / b.budgetMinor;
      return bRelative - aRelative;
    });
}
