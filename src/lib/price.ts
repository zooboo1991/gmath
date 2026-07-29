// Prices are stored as the display string the teacher typed ("350,000₮"),
// so any arithmetic has to strip the formatting first.

export function parsePriceToNumber(price: string | undefined | null): number {
  if (!price) return 0;
  return Number(price.replace(/[^\d]/g, "")) || 0;
}

export function formatMnt(value: number): string {
  return `${value.toLocaleString("en-US")}₮`;
}
