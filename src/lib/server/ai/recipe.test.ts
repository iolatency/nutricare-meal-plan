import { describe, it, expect } from 'vitest';
import {
	normalizeIngredients,
	validateNormalizedIngredients,
	parseRecipeRoot,
	mergeYieldIntoSteps,
	nutrientsFromAiIngredients
} from './recipe';

describe('normalizeIngredients', () => {
	it('maps string entries to names and uses serving when no leading qty', () => {
		const out = normalizeIngredients(['whey protein powder', 'frozen berries']);
		expect(out).toHaveLength(2);
		expect(out[0]!.name).toBe('whey protein powder');
		expect(out[0]!.name_ar).toBe('whey protein powder');
		expect(out[0]!.quantity).toBe(0);
		expect(out[0]!.unit).toBe('serving');
	});

	it('parses leading English quantity and unit', () => {
		const out = normalizeIngredients(['1 cup low-fat milk', '1/2 cup oats']);
		expect(out[0]!.quantity).toBe(1);
		expect(out[0]!.unit).toBe('cup');
		expect(out[0]!.name).toBe('low-fat milk');
		expect(out[1]!.quantity).toBe(0.5);
		expect(out[1]!.unit).toBe('cup');
		expect(out[1]!.name).toBe('oats');
	});

	it('reads alternate object keys and Arabic-only name', () => {
		const out = normalizeIngredients([
			{ item: 'Banana', name_ar: 'موز', quantity: 1, unit: 'piece', calories: 90, protein: 1, carbs: 23, fat: 0, fiber: 3 },
			{ ingredient: 'Oats', arabic: 'شوفان', qty: 40, unit: 'g', calories: 150, protein: 5, carbs: 27, fat: 3, fiber: 4 }
		]);
		expect(out[0]!.name).toBe('Banana');
		expect(out[0]!.name_ar).toBe('موز');
		expect(out[1]!.name).toBe('Oats');
		expect(out[1]!.name_ar).toBe('شوفان');
		expect(out[1]!.quantity).toBe(40);
	});

	it('coerces numeric strings and fibre alias', () => {
		const out = normalizeIngredients([
			{
				name: 'x',
				name_ar: 'x',
				quantity: '12',
				unit: 'ml',
				calories: '10',
				protein: '1',
				carbs: '2',
				fat: '0',
				fibre: 1
			}
		]);
		expect(out[0]!.quantity).toBe(12);
		expect(out[0]!.calories).toBe(10);
		expect(out[0]!.fiber).toBe(1);
	});
});

describe('validateNormalizedIngredients', () => {
	it('throws on empty list', () => {
		expect(() => validateNormalizedIngredients([])).toThrow(/no ingredients/i);
	});

	it('throws when a row has empty names', () => {
		const bad = normalizeIngredients([{ name: '', name_ar: '', quantity: 1, unit: 'g' }]);
		expect(() => validateNormalizedIngredients(bad)).toThrow(/unusable ingredients/i);
	});

	it('accepts valid normalized rows', () => {
		const ok = normalizeIngredients([{ name: 'a', name_ar: 'ب', quantity: 1, unit: 'g' }]);
		expect(() => validateNormalizedIngredients(ok)).not.toThrow();
	});
});

describe('parseRecipeRoot + mergeYieldIntoSteps + nutrientsFromAiIngredients', () => {
	it('parses canonical model JSON and merges yield like manual recipes', () => {
		const raw = {
			name: 'Lentil soup',
			name_ar: 'شوربة عدس',
			yield: '4 أكواب',
			portions: 3,
			steps: '1. اغسل العدس.\n2. اطبخ 20 دقيقة.',
			ingredients: [
				{ name: 'lentils', name_ar: 'عدس', quantity: 200, unit: 'g', calories: 230, protein: 18, carbs: 40, fat: 1, fiber: 16 }
			]
		};
		const p = parseRecipeRoot(raw, 'fallback');
		expect(p.name).toBe('Lentil soup');
		expect(p.name_ar).toBe('شوربة عدس');
		expect(p.portions).toBe(3);
		expect(mergeYieldIntoSteps(p.yieldText, p.stepsBody)).toContain('الناتج: 4 أكواب');
		expect(mergeYieldIntoSteps(p.yieldText, p.stepsBody)).toContain('اغسل العدس');
		const ings = normalizeIngredients(p.ingredients);
		const n = nutrientsFromAiIngredients(ings);
		expect(n.calories).toBe(230);
		expect(n.protein).toBe(18);
	});

	it('accepts nameAr key and items alias', () => {
		const raw = {
			name: 'Salad',
			nameAr: 'سلطة',
			portions: 2,
			steps: '1. قطع الخضار.',
			items: [{ name: 'tomato', name_ar: 'طماطم', quantity: 100, unit: 'g', calories: 18, protein: 1, carbs: 4, fat: 0, fiber: 1 }]
		};
		const p = parseRecipeRoot(raw, 'x');
		expect(p.name_ar).toBe('سلطة');
		expect(normalizeIngredients(p.ingredients)).toHaveLength(1);
	});
});
