const eurFormatter = new Intl.NumberFormat("el-GR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrencyEUR(value: number): string {
  const normalized = Number.isFinite(value) ? value : 0;
  return eurFormatter.format(normalized);
}
