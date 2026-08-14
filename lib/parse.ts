import { CATEGORY_KEYWORDS } from "./categories";
import { CURRENCIES } from "./money";

// The one parsing brain. Every capture surface — web quick-add, voice
// dictation, Siri/Shortcuts — funnels into this module. Pure local logic:
// no API keys, no network calls, nothing leaves the machine.

export type ParsedExpense = {
  amount: number; // major units
  currency: string | null; // ISO code, null = household home currency
  category: string | null; // must match a household category name
  merchant: string | null;
  note: string | null;
  spent_on: string; // YYYY-MM-DD
};

export type ParseContext = {
  categories: string[];
  homeCurrency: string;
  today: string; // YYYY-MM-DD in the user's locale
};

const SYMBOL_TO_CODE: [RegExp, string][] = [
  [/₹|\brs\.?\b|\binr\b|\brupees?\b/i, "INR"],
  [/\$|\busd\b|\bdollars?\b/i, "USD"],
  [/€|\beur\b|\beuros?\b/i, "EUR"],
  [/£|\bgbp\b|\bpounds?\b/i, "GBP"],
  [/\baed\b|\bdirhams?\b/i, "AED"],
  [/\bsgd\b/i, "SGD"],
  [/\baud\b/i, "AUD"],
  [/\bcad\b/i, "CAD"],
];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Spelled-out numbers, for voice dictation that comes through as words
// ("three hundred on chai"). Handles ones/tens plus hundred/thousand/k/lakh.
const WORD_ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const WORD_MULT: Record<string, number> = {
  hundred: 100, thousand: 1000, grand: 1000, k: 1000, lakh: 100000, lakhs: 100000,
};

function parseWordNumber(tokens: string[]): { value: number; used: Set<number> } | null {
  let total = 0;
  let current = 0;
  let sawNumber = false;
  const used = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in WORD_ONES) {
      current += WORD_ONES[t];
      sawNumber = true;
      used.add(i);
    } else if (t in WORD_MULT && sawNumber) {
      current = (current || 1) * WORD_MULT[t];
      used.add(i);
      if (WORD_MULT[t] >= 1000) {
        total += current;
        current = 0;
      }
    } else if (sawNumber && (t === "and" || t === "a")) {
      used.add(i); // "two thousand and fifty"
    } else if (sawNumber) {
      break; // number phrase ended
    }
  }
  const value = total + current;
  return sawNumber && value > 0 ? { value, used } : null;
}

export function parseExpenseText(text: string, ctx: ParseContext): ParsedExpense {
  const lower = text.toLowerCase();

  let currency: string | null = null;
  for (const [re, code] of SYMBOL_TO_CODE) {
    if (re.test(lower) && CURRENCIES[code]) {
      currency = code;
      break;
    }
  }

  // Amount: digits first ("450", "1.2k", "2,500"), then spelled-out words.
  let amount = 0;
  let wordTokensUsed: Set<string> | null = null;
  const m = lower.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k\b|lakhs?\b)?/);
  if (m && m[1]) {
    amount = parseFloat(m[1]);
    if (m[2]) amount *= m[2].startsWith("k") ? 1000 : 100000;
  }
  if (!amount) {
    const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
    const wordNum = parseWordNumber(tokens);
    if (wordNum) {
      amount = wordNum.value;
      wordTokensUsed = new Set([...wordNum.used].map((i) => tokens[i]));
    }
  }

  // Date words.
  let spentOn = ctx.today;
  const today = new Date(ctx.today + "T12:00:00");
  if (/\bday before\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 2);
    spentOn = d.toISOString().slice(0, 10);
  } else if (/\byesterday\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    spentOn = d.toISOString().slice(0, 10);
  } else {
    for (let i = 0; i < 7; i++) {
      if (new RegExp(`\\b(last\\s+)?${WEEKDAYS[i]}\\b`).test(lower)) {
        const d = new Date(today);
        const diff = (d.getDay() - i + 7) % 7 || 7;
        d.setDate(d.getDate() - diff);
        spentOn = d.toISOString().slice(0, 10);
        break;
      }
    }
  }

  // Category + merchant from keywords.
  let category: string | null = null;
  let merchant: string | null = null;
  for (const word of lower.split(/[^a-z]+/)) {
    const hit = CATEGORY_KEYWORDS[word];
    if (hit && ctx.categories.includes(hit)) {
      category = hit;
      // Brand-looking keywords double as the merchant.
      if (!/^(dinner|lunch|breakfast|groceries|grocery|bill|fees|trip)$/.test(word)) {
        merchant = word.charAt(0).toUpperCase() + word.slice(1);
      }
      break;
    }
  }

  // Note: the entry minus amount/currency/date tokens.
  let note: string | null = text
    .replace(/[₹$€£]|\b(rs\.?|inr|usd|eur|gbp|aed|sgd|aud|cad|rupees?|dollars?|euros?|pounds?|dirhams?)\b/gi, "")
    .replace(/\d+(?:[.,]\d+)?\s*(k|lakhs?)?\b/gi, "")
    .replace(/\b(yesterday|today|day before|last|on|for|spent|paid)\b/gi, "")
    .replace(new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`, "gi"), "")
    .replace(/\s+/g, " ")
    .trim();
  if (note && wordTokensUsed) {
    note = note
      .split(/\s+/)
      .filter((w) => !wordTokensUsed!.has(w.toLowerCase()))
      .join(" ")
      .trim();
  }
  // Drop the note when it just repeats the merchant or category.
  if (note && merchant && note.toLowerCase() === merchant.toLowerCase()) note = null;
  if (note && category && note.toLowerCase() === category.toLowerCase()) note = null;

  return {
    amount: Math.abs(amount),
    currency,
    category,
    merchant,
    note: note || null,
    spent_on: spentOn,
  };
}

export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
