/**
 * Format money with thousand separators and 2 decimal places
 * Example: 1000000 => "1.000.000,00" (German) or "1,000,000.00" (English)
 * Based on locale, but defaults to German format (. for thousands, , for decimals)
 */
export function formatMoney(amount: number, locale: string = 'de-DE'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Shorter version for display (still includes decimals)
 */
export function formatMoneyShort(amount: number): string {
  if (amount >= 1000000) {
    return formatMoney(amount);
  }
  return formatMoney(amount);
}

/**
 * Very short, compact format for small spaces (no decimals if > 1000)
 */
export function formatMoneyCompact(amount: number): string {
  if (amount >= 1000000) {
    return (amount / 1000000).toFixed(2) + 'M';
  }
  if (amount >= 1000) {
    return (amount / 1000).toFixed(1) + 'K';
  }
  return amount.toFixed(2);
}
