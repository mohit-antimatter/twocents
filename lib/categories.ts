import { db, uid } from "./db";

// First 8 slots use the validated dark-mode categorical palette
// (adjacent-pair CVD-checked); the tail categories share a recessive neutral —
// identity in charts is always carried by the emoji + name label, never color alone.
export const DEFAULT_CATEGORIES: { name: string; emoji: string; color: string }[] = [
  { name: "Food & Drinks", emoji: "🍜", color: "#3987e5" },
  { name: "Groceries", emoji: "🛒", color: "#d95926" },
  { name: "Transport", emoji: "🚕", color: "#199e70" },
  { name: "Shopping", emoji: "🛍️", color: "#c98500" },
  { name: "Housing & Bills", emoji: "🏠", color: "#d55181" },
  { name: "Entertainment", emoji: "🎬", color: "#008300" },
  { name: "Health", emoji: "💊", color: "#9085e9" },
  { name: "Travel", emoji: "✈️", color: "#e66767" },
  { name: "Kids & Education", emoji: "🎓", color: "#6B7A70" },
  { name: "Subscriptions", emoji: "📺", color: "#6B7A70" },
  { name: "Personal Care", emoji: "💇", color: "#6B7A70" },
  { name: "Household Help", emoji: "🧹", color: "#6B7A70" },
  { name: "Other", emoji: "🌀", color: "#6B7A70" },
];

// Fallback parser hints. Merchant/keyword → category name.
export const CATEGORY_KEYWORDS: Record<string, string> = {
  swiggy: "Food & Drinks", zomato: "Food & Drinks", dinner: "Food & Drinks",
  lunch: "Food & Drinks", breakfast: "Food & Drinks", coffee: "Food & Drinks",
  chai: "Food & Drinks", starbucks: "Food & Drinks", restaurant: "Food & Drinks",
  pizza: "Food & Drinks", biryani: "Food & Drinks", cafe: "Food & Drinks",
  drinks: "Food & Drinks", beer: "Food & Drinks", snacks: "Food & Drinks",

  groceries: "Groceries", grocery: "Groceries", bigbasket: "Groceries",
  blinkit: "Groceries", zepto: "Groceries", instamart: "Groceries",
  vegetables: "Groceries", milk: "Groceries", fruits: "Groceries",

  uber: "Transport", ola: "Transport", rapido: "Transport", petrol: "Transport",
  fuel: "Transport", diesel: "Transport", metro: "Transport", cab: "Transport",
  taxi: "Transport", auto: "Transport", parking: "Transport", toll: "Transport",

  amazon: "Shopping", flipkart: "Shopping", myntra: "Shopping",
  shopping: "Shopping", clothes: "Shopping", shoes: "Shopping", ikea: "Shopping",

  rent: "Housing & Bills", electricity: "Housing & Bills", wifi: "Housing & Bills",
  internet: "Housing & Bills", gas: "Housing & Bills",
  maintenance: "Housing & Bills", water: "Housing & Bills", bill: "Housing & Bills",

  maid: "Household Help", cook: "Household Help", nanny: "Household Help",
  driver: "Household Help", cleaner: "Household Help", housekeeper: "Household Help",
  housekeeping: "Household Help", babysitter: "Household Help",
  gardener: "Household Help", laundry: "Household Help",

  movie: "Entertainment", pvr: "Entertainment", concert: "Entertainment",
  game: "Entertainment", bowling: "Entertainment", tickets: "Entertainment",

  doctor: "Health", pharmacy: "Health", medicine: "Health", medicines: "Health",
  hospital: "Health", gym: "Health", dentist: "Health", lab: "Health",

  flight: "Travel", hotel: "Travel", airbnb: "Travel", train: "Travel",
  visa: "Travel", trip: "Travel", vacation: "Travel",

  school: "Kids & Education", fees: "Kids & Education", tuition: "Kids & Education",
  books: "Kids & Education", toys: "Kids & Education", daycare: "Kids & Education",

  netflix: "Subscriptions", spotify: "Subscriptions", prime: "Subscriptions",
  hotstar: "Subscriptions", icloud: "Subscriptions", subscription: "Subscriptions",
  youtube: "Subscriptions", chatgpt: "Subscriptions", claude: "Subscriptions",

  salon: "Personal Care", haircut: "Personal Care", spa: "Personal Care",
  cosmetics: "Personal Care",
};

export function seedCategories(householdId: string) {
  const insert = db().prepare(
    "INSERT INTO categories (id, household_id, name, emoji, color, sort) VALUES (?, ?, ?, ?, ?, ?)"
  );
  DEFAULT_CATEGORIES.forEach((c, i) => {
    insert.run(uid(), householdId, c.name, c.emoji, c.color, i);
  });
}

export type Category = {
  id: string;
  household_id: string;
  name: string;
  emoji: string;
  color: string;
  sort: number;
  budget_minor: number | null;
};

export function listCategories(householdId: string): Category[] {
  return db()
    .prepare("SELECT * FROM categories WHERE household_id = ? ORDER BY sort")
    .all(householdId) as Category[];
}
