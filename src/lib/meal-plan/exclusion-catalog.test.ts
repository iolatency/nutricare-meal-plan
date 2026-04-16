import { describe, expect, it } from 'vitest';
import {
	EXCLUSION_GROUPS,
	filterExclusionCatalog,
	getExclusionCatalogItem,
	stableNegativeFoodId
} from './exclusion-catalog';

describe('exclusion-catalog', () => {
	it('returns stable negative ids per key', () => {
		expect(stableNegativeFoodId('water')).toBe(stableNegativeFoodId('water'));
		expect(stableNegativeFoodId('water')).not.toBe(stableNegativeFoodId('coffee'));
		expect(stableNegativeFoodId('water')).toBeLessThan(0);
	});

	it('resolves catalog items by key', () => {
		expect(getExclusionCatalogItem('water')?.labelAr).toBe('ماء');
		expect(getExclusionCatalogItem('nonexistent-key-xyz')).toBeUndefined();
	});

	it('filterExclusionCatalog returns all groups for empty query', () => {
		expect(filterExclusionCatalog('').length).toBe(EXCLUSION_GROUPS.length);
	});

	it('filterExclusionCatalog matches Arabic label substring', () => {
		const r = filterExclusionCatalog('موز');
		expect(r.length).toBeGreaterThan(0);
		expect(r.some((g) => g.items.some((it) => it.labelAr.includes('موز')))).toBe(true);
	});

	it('filterExclusionCatalog matches group title', () => {
		const r = filterExclusionCatalog('مكسرات');
		expect(r.length).toBe(1);
		expect(r[0].groupAr).toContain('مكسرات');
	});

	it('filterExclusionCatalog matches english key', () => {
		const r = filterExclusionCatalog('almond');
		expect(r.some((g) => g.items.some((it) => it.key === 'nut-almonds'))).toBe(true);
	});

	it('has unique keys across all groups', () => {
		const seen = new Set<string>();
		for (const g of EXCLUSION_GROUPS) {
			for (const it of g.items) {
				expect(seen.has(it.key)).toBe(false);
				seen.add(it.key);
			}
		}
	});
});
