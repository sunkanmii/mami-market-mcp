// The organiser confirmed this recorded-stock exchange was a rehearsal, not
// a physical pickup. Preserve the D1 history while labelling its evidence.
const rehearsals = new Set(["offer-00e024f4-393a-4d2f-947e-f4633566a158"]);
export const isRehearsal = (offerId: string) => rehearsals.has(offerId);
