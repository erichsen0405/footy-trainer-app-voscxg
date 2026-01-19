const DEFAULT_MAX_FRACTION_DIGITS = 2;

const sanitizeAmountInput = (value: number | string): number | null => {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null;
	}
	if (typeof value === 'string') {
		let working = value.replace(/\s/g, '');
		const lastComma = working.lastIndexOf(',');
		const lastDot = working.lastIndexOf('.');

		if (lastComma !== -1 && lastComma > lastDot) {
			working = working.replace(/\./g, '').replace(',', '.');
		} else if (lastDot !== -1 && lastDot > lastComma) {
			working = working.replace(/,/g, '');
		} else {
			working = working.replace(',', '.');
		}

		working = working.replace(/[^0-9.-]/g, '');
		const parsed = Number(working);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

export interface FormatPriceOptions {
	locale?: string;
	minimumFractionDigits?: number;
	maximumFractionDigits?: number;
	currencyDisplay?: 'symbol' | 'code' | 'name';
}

export const formatPrice = (
	amount: number | string | null | undefined,
	currency?: string,
	options?: FormatPriceOptions
): string => {
	const safeCurrency = (currency || 'DKK').toUpperCase();
	const normalized = amount === null || amount === undefined ? null : sanitizeAmountInput(amount);
	const maxFractionDigits = options?.maximumFractionDigits ?? DEFAULT_MAX_FRACTION_DIGITS;
	const hasFraction = normalized !== null && Math.abs(normalized % 1) > Number.EPSILON;
	const minFractionDigits =
		options?.minimumFractionDigits ?? (hasFraction ? Math.min(maxFractionDigits, DEFAULT_MAX_FRACTION_DIGITS) : 0);

	try {
		if (normalized !== null) {
			return new Intl.NumberFormat(options?.locale, {
				style: 'currency',
				currency: safeCurrency,
				currencyDisplay: options?.currencyDisplay ?? 'code',
				maximumFractionDigits: maxFractionDigits,
				minimumFractionDigits: minFractionDigits,
			}).format(normalized);
		}
	} catch {
		// fall through to fallback
	}

	const fallbackDigits = normalized !== null ? normalized.toFixed(Math.min(maxFractionDigits, DEFAULT_MAX_FRACTION_DIGITS)) : '--';
	const trimmedFallback = fallbackDigits.replace(/\.00$/, '');
	return `${safeCurrency} ${trimmedFallback}`;
};
