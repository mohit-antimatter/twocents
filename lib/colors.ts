// Partner identity colors, assigned by join order. Used for the "who paid"
// dot and the person-split chart — always paired with a name or initial,
// never color alone.
export const PERSON_COLORS = ["#7fe0b2", "#f0b860", "#9085e9", "#3987e5"];

export function personColorMap(members: { id: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  members.forEach((m, i) => {
    map[m.id] = PERSON_COLORS[i % PERSON_COLORS.length];
  });
  return map;
}
