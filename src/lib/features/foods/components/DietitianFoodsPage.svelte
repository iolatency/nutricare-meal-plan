<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
import {
	fetchExternalFoodDetail,
	importExternalFood,
	searchExternalFoods
} from '$lib/features/foods/services/foods-api';
	import type { PageData, ActionData } from '../../../../routes/dietitian/foods/$types';

	interface ExternalFood {
		foodId: string;
		label: string;
		knownAs: string | null;
		brand: string | null;
		category: string | null;
		categoryLabel: string | null;
		foodContentsLabel: string | null;
		image: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
		fullNutrients: string | null;
		healthLabels: string[];
		cautions: string[];
		dietLabels: string[];
		measures: { label: string; weight: number }[];
		alreadyImported: boolean;
		dbId: number | null;
	}

	const MICRO_FIELDS = [
		{ key: 'CHOLE', label: 'الكوليسترول', unit: 'mg' },
		{ key: 'FIBTG', label: 'الألياف', unit: 'g' },
		{ key: 'NA', label: 'الصوديوم', unit: 'mg' },
		{ key: 'WATER', label: 'الماء', unit: 'g' },
		{ key: 'VITA_RAE', label: 'فيتامين أ', unit: 'ug' },
		{ key: 'VITB6A', label: 'فيتامين ب-6', unit: 'mg' },
		{ key: 'VITB12', label: 'فيتامين ب-12', unit: 'ug' },
		{ key: 'VITC', label: 'فيتامين ج', unit: 'mg' },
		{ key: 'VITD', label: 'فيتامين د (D2+D3)', unit: 'ug' },
		{ key: 'TOCPHA', label: 'فيتامين هـ', unit: 'mg' },
		{ key: 'VITK1', label: 'فيتامين ك', unit: 'ug' },
		{ key: 'STARCH', label: 'النشا', unit: 'g' },
		{ key: 'LACTOSE', label: 'اللاكتوز', unit: 'g' },
		{ key: 'ALCOHOL', label: 'الكحول', unit: 'g' },
		{ key: 'CAFFEINE', label: 'الكافيين', unit: 'mg' },
		{ key: 'SUGAR', label: 'السكريات', unit: 'g' },
		{ key: 'CA', label: 'الكالسيوم', unit: 'mg' },
		{ key: 'FE', label: 'الحديد', unit: 'mg' },
		{ key: 'MG', label: 'المغنيسيوم', unit: 'mg' },
		{ key: 'P', label: 'الفسفور', unit: 'mg' },
		{ key: 'K', label: 'البوتاسيوم', unit: 'mg' },
		{ key: 'ZN', label: 'الزنك', unit: 'mg' },
		{ key: 'CU', label: 'النحاس', unit: 'mg' },
		{ key: 'FL', label: 'الفلورايد', unit: 'ug' },
		{ key: 'MN', label: 'المنغنيز', unit: 'mg' },
		{ key: 'SE', label: 'السيلينيوم', unit: 'ug' },
		{ key: 'THIA', label: 'الثيامين', unit: 'mg' },
		{ key: 'RIBF', label: 'الريبوفلافين', unit: 'mg' },
		{ key: 'NIA', label: 'النياسين', unit: 'mg' },
		{ key: 'PANTOTHENIC', label: 'حمض البانتوثينيك', unit: 'mg' },
		{ key: 'FOLDFE', label: 'حمض الفوليك (إجمالي)', unit: 'ug' },
		{ key: 'FOLAC', label: 'حمض الفوليك', unit: 'ug' },
		{ key: 'FATRN', label: 'أحماض متحولة', unit: 'g' },
		{ key: 'FASAT', label: 'أحماض مشبعة', unit: 'g' },
		{ key: 'FAMS', label: 'أحماض أحادية', unit: 'g' },
		{ key: 'FAPU', label: 'أحماض متعددة', unit: 'g' },
		{ key: 'CHLORIDE', label: 'الكلورايد', unit: 'mg' },
	];

	const UNIT_OPTIONS = [
		{ value: 'g', label: 'غرام (g)' },
		{ value: 'ml', label: 'مليلتر (ml)' },
		{ value: 'l', label: 'لتر (l)' },
		{ value: 'cup', label: 'كوب' },
		{ value: 'tbsp', label: 'ملعقة كبيرة' },
		{ value: 'tsp', label: 'ملعقة صغيرة' },
		{ value: 'fl_oz', label: 'أونصة سائلة' },
		{ value: 'oz', label: 'أونصة وزن' },
		{ value: 'lb', label: 'رطل' },
		{ value: 'kg', label: 'كيلوغرام' },
		{ value: 'serving', label: 'حصة تقديم' },
		{ value: 'slice', label: 'شريحة' },
		{ value: 'whole', label: 'حبة كاملة' },
		{ value: 'piece', label: 'قطعة' },
		{ value: 'portion', label: 'حصة' },
		{ value: 'pinch', label: 'رشة' },
		{ value: 'can', label: 'علبة' },
		{ value: 'bottle', label: 'زجاجة' },
		{ value: 'package', label: 'عبوة' },
	];

	const CAUTION_OPTIONS = [
		{ value: 'GLUTEN', label: 'غلوتين' },
		{ value: 'WHEAT', label: 'قمح' },
		{ value: 'MILK', label: 'حليب' },
		{ value: 'EGG', label: 'بيض' },
		{ value: 'PEANUTS', label: 'فول سوداني' },
		{ value: 'TREE_NUTS', label: 'مكسرات' },
		{ value: 'FISH', label: 'سمك' },
		{ value: 'SHELLFISH', label: 'مأكولات بحرية' },
		{ value: 'SOY', label: 'صويا' },
		{ value: 'SESAME', label: 'سمسم' },
		{ value: 'SULFITES', label: 'كبريتيت' },
	];
	const DIET_OPTIONS = [
		{ value: 'BALANCED', label: 'متوازن' },
		{ value: 'HIGH_FIBER', label: 'عالي الألياف' },
		{ value: 'HIGH_PROTEIN', label: 'عالي البروتين' },
		{ value: 'LOW_FAT', label: 'منخفض الدهون' },
		{ value: 'FAT_FREE', label: 'خالي من الدهون' },
		{ value: 'LOW_SODIUM', label: 'منخفض الصوديوم' },
		{ value: 'LOW_CARB', label: 'منخفض الكربوهيدرات' },
		{ value: 'VEGAN', label: 'نباتي صرف' },
		{ value: 'VEGETARIAN', label: 'نباتي' },
		{ value: 'SUGAR_CONSCIOUS', label: 'قليل السكر' },
		{ value: 'KETO_FRIENDLY', label: 'كيتو' },
		{ value: 'KIDNEY_FRIENDLY', label: 'مناسب لمرضى الكلى' },
		{ value: 'LOW_POTASSIUM', label: 'منخفض البوتاسيوم' },
	];
	const HEALTH_OPTIONS = [
		{ value: 'DAIRY_FREE', label: 'خالٍ من الألبان' },
		{ value: 'GLUTEN_FREE', label: 'خالٍ من الغلوتين' },
		{ value: 'WHEAT_FREE', label: 'خالٍ من القمح' },
		{ value: 'EGG_FREE', label: 'خالٍ من البيض' },
		{ value: 'MILK_FREE', label: 'خالٍ من الحليب' },
		{ value: 'PEANUT_FREE', label: 'خالٍ من الفول السوداني' },
		{ value: 'TREE_NUT_FREE', label: 'خالٍ من المكسرات' },
		{ value: 'SOY_FREE', label: 'خالٍ من الصويا' },
		{ value: 'FISH_FREE', label: 'خالٍ من الأسماك' },
		{ value: 'SHELLFISH_FREE', label: 'خالٍ من المحار' },
		{ value: 'PORK_FREE', label: 'خالٍ من لحم الخنزير' },
		{ value: 'RED_MEAT_FREE', label: 'خالٍ من اللحوم الحمراء' },
		{ value: 'CRUSTACEAN_FREE', label: 'خالٍ من القشريات' },
		{ value: 'CELERY_FREE', label: 'خالٍ من الكرفس' },
		{ value: 'MUSTARD_FREE', label: 'خالٍ من الخردل' },
		{ value: 'SESAME_FREE', label: 'خالٍ من السمسم' },
		{ value: 'LUPINE_FREE', label: 'خالٍ من الترمس' },
		{ value: 'MOLLUSK_FREE', label: 'خالٍ من الرخويات' },
		{ value: 'ALCOHOL_FREE', label: 'خالٍ من الكحول' },
		{ value: 'NO_OIL_ADDED', label: 'بدون زيت مضاف' },
		{ value: 'NO_SUGAR_ADDED', label: 'بدون سكر مضاف' },
		{ value: 'KOSHER', label: 'كوشر' },
		{ value: 'HALAL', label: 'حلال' },
		{ value: 'PESCATARIAN', label: 'بيسكاتاري' },
		{ value: 'PALEO', label: 'باليو' },
		{ value: 'SPECIFIC_CARBS', label: 'كربوهيدرات محددة' },
		{ value: 'IMMUNO_SUPPORTIVE', label: 'داعم للمناعة' },
	];

	const CAUTION_TAG_VALUES = new Set(CAUTION_OPTIONS.map((o) => o.value));
	const DIET_TAG_VALUES = new Set(DIET_OPTIONS.map((o) => o.value));
	const HEALTH_TAG_VALUES = new Set(HEALTH_OPTIONS.map((o) => o.value));

	/** تسمية عربية لرمز Edamam؛ جرّب ثلاث القوائم ثم الرمز الخام. */
	function tagLabelAr(value: string): string {
		return (
			CAUTION_OPTIONS.find((o) => o.value === value)?.label ??
			DIET_OPTIONS.find((o) => o.value === value)?.label ??
			HEALTH_OPTIONS.find((o) => o.value === value)?.label ??
			value
		);
	}

	/**
	 * يضع كل رمز في سلة واحدة فقط: تحذير → تصنيف غذائي → خالٍ/مناسب (يتعامل مع تداخل حقول Edamam).
	 */
	function normalizeTagBuckets(
		cautionsIn: string[],
		dietIn: string[],
		healthIn: string[]
	): { cautions: string[]; dietLabels: string[]; healthLabels: string[] } {
		const seen = new Set<string>();
		const cautions: string[] = [];
		const dietLabels: string[] = [];
		const healthLabels: string[] = [];
		const push = (arr: string[], v: string) => {
			if (!v || seen.has(v)) return;
			seen.add(v);
			arr.push(v);
		};
		const tokens = [...new Set([...cautionsIn, ...dietIn, ...healthIn].filter(Boolean))];
		for (const t of tokens) {
			if (CAUTION_TAG_VALUES.has(t)) push(cautions, t);
			else if (DIET_TAG_VALUES.has(t)) push(dietLabels, t);
			else if (HEALTH_TAG_VALUES.has(t)) push(healthLabels, t);
			else push(healthLabels, t);
		}
		return { cautions, dietLabels, healthLabels };
	}

	interface SelectedFoodInfo {
		id: number;
		name: string;
		nameAr: string | null;
		imageUrl: string | null;
		calories: number;
		protein: number;
		carbs: number;
		fat: number;
		fiber: number;
		unit: string;
		portionSize: number;
		source: string;
		fullNutrients: string | null;
		categoryNameAr: string | null;
		brand?: string | null;
		edamamCategory?: string | null;
		edamamCategoryLabel?: string | null;
		foodContentsLabel?: string | null;
		measures?: { label: string; weight: number }[];
		externalNutrientsJson?: string | null;
		/** Set when row comes from DB; used to allow «إزالة من أطعمتي» for your Edamam imports only. */
		createdBy?: number | null;
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/** null = follow URL (`?extPage=` → external tab) */
	let tabOverride = $state<'internal' | 'external' | null>(null);
	let prevExtPageParam = $state<string | undefined>(undefined);
	$effect(() => {
		const s = page.url.searchParams.get('extPage') ?? '';
		const changed = prevExtPageParam !== undefined && s !== prevExtPageParam;
		prevExtPageParam = s;
		if (changed && s !== '') tabOverride = null;
	});
	const activeTab = $derived(tabOverride ?? (data.preferExternalTab ? 'external' : 'internal'));

	// Detail panel
	let selectedFood = $state<SelectedFoodInfo | null>(null);

	/** Thumbnail for list rows: DB `image_url`, else image URL inside Edamam parser JSON. */
	function foodRowImageUrl(food: {
		imageUrl: string | null;
		externalParserFoodJson?: string | null;
	}): string | null {
		if (food.imageUrl?.trim()) return food.imageUrl;
		try {
			if (food.externalParserFoodJson) {
				const j = JSON.parse(food.externalParserFoodJson) as { image?: string };
				if (j.image?.trim()) return j.image;
			}
		} catch {
			/* ignore */
		}
		return null;
	}

	/** بناء كائن واجهة الاستيراد من صف كتالوج خارجي محفوظ في قاعدة البيانات. */
	function catalogRowToExternalFood(
		catalog: {
			providerFoodId: string;
			name: string;
			nameAr: string | null;
			calories: number;
			protein: number;
			carbs: number;
			fat: number;
			fiber: number;
			imageUrl: string | null;
			fullNutrients: string | null;
			externalParserFoodJson: string | null;
			externalParserMeasuresJson: string | null;
		},
		opts?: { alreadyImported?: boolean; dbId?: number | null }
	): ExternalFood {
		let brand: string | null = null;
		let category: string | null = null;
		let categoryLabel: string | null = null;
		let foodContentsLabel: string | null = null;
		let image: string | null = catalog.imageUrl;
		let healthLabels: string[] = [];
		let cautions: string[] = [];
		let dietLabels: string[] = [];
		let label = catalog.name;
		let knownAs = catalog.nameAr;
		let measures: { label: string; weight: number }[] = [];
		try {
			if (catalog.externalParserFoodJson) {
				const pf = JSON.parse(catalog.externalParserFoodJson) as {
					label?: string;
					knownAs?: string | null;
					brand?: string | null;
					category?: string | null;
					categoryLabel?: string | null;
					foodContentsLabel?: string | null;
					image?: string | null;
					healthLabels?: string[];
					cautions?: string[];
					dietLabels?: string[];
				};
				if (pf.label) label = pf.label;
				if (pf.knownAs !== undefined) knownAs = pf.knownAs;
				brand = pf.brand ?? null;
				category = pf.category ?? null;
				categoryLabel = pf.categoryLabel ?? null;
				foodContentsLabel = pf.foodContentsLabel ?? null;
				if (pf.image?.trim()) image = pf.image;
				healthLabels = pf.healthLabels ?? [];
				cautions = pf.cautions ?? [];
				dietLabels = pf.dietLabels ?? [];
			}
		} catch {
			/* ignore */
		}
		try {
			if (catalog.externalParserMeasuresJson) {
				measures = JSON.parse(catalog.externalParserMeasuresJson).map(
					(m: { label: string; weight: number }) => ({ label: m.label, weight: m.weight })
				);
			}
		} catch {
			/* ignore */
		}
		const nutLbl = labelBucketsFromFullNutrientsJson(catalog.fullNutrients);
		const tags = normalizeTagBuckets(
			[...cautions, ...nutLbl.cautions],
			[...dietLabels, ...nutLbl.dietLabels],
			[...healthLabels, ...nutLbl.healthLabels]
		);
		return {
			foodId: catalog.providerFoodId,
			label,
			knownAs,
			brand,
			category,
			categoryLabel,
			foodContentsLabel,
			image,
			calories: catalog.calories,
			protein: catalog.protein,
			carbs: catalog.carbs,
			fat: catalog.fat,
			fiber: catalog.fiber,
			fullNutrients: catalog.fullNutrients,
			healthLabels: tags.healthLabels,
			cautions: tags.cautions,
			dietLabels: tags.dietLabels,
			measures,
			alreadyImported: opts?.alreadyImported ?? false,
			dbId: opts?.dbId ?? null
		};
	}

	function selectFood(food: { id: number; name: string; nameAr: string | null; imageUrl: string | null; calories: number; protein: number; carbs: number; fat: number; fiber: number; unit: string; portionSize: number; source: string; fullNutrients: string | null; createdBy?: number | null; externalParserFoodJson?: string | null; externalParserMeasuresJson?: string | null; externalNutrientsJson?: string | null }, category: { nameAr: string | null } | null) {
		let brand: string | null = null;
		let edamamCategory: string | null = null;
		let edamamCategoryLabel: string | null = null;
		let foodContentsLabel: string | null = null;
		let measures: { label: string; weight: number }[] = [];
		try {
			if (food.externalParserFoodJson) {
				const pf = JSON.parse(food.externalParserFoodJson);
				brand = pf.brand ?? null;
				edamamCategory = pf.category ?? null;
				edamamCategoryLabel = pf.categoryLabel ?? null;
				foodContentsLabel = pf.foodContentsLabel ?? null;
			}
		} catch { /* ignore */ }
		try {
			if (food.externalParserMeasuresJson) {
				measures = JSON.parse(food.externalParserMeasuresJson).map((m: any) => ({ label: m.label, weight: m.weight }));
			}
		} catch { /* ignore */ }
		selectedFood = {
			id: food.id, name: food.name, nameAr: food.nameAr, imageUrl: food.imageUrl,
			calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat,
			fiber: food.fiber, unit: food.unit, portionSize: food.portionSize, source: food.source,
			fullNutrients: food.fullNutrients, categoryNameAr: category?.nameAr ?? null,
			brand, edamamCategory, edamamCategoryLabel, foodContentsLabel, measures,
			externalNutrientsJson: food.externalNutrientsJson ?? null,
			createdBy: food.createdBy ?? null
		};
	}

	function parsedMicros(fn: string | null): Record<string, number> {
		if (!fn) return {};
		try { return JSON.parse(fn) as Record<string, number>; } catch { return {}; }
	}

	/** Caution / diet / health code arrays sometimes live only inside `fullNutrients` JSON (not parser food JSON). */
	function labelBucketsFromFullNutrientsJson(fn: string | null | undefined): {
		cautions: string[];
		dietLabels: string[];
		healthLabels: string[];
	} {
		const empty = { cautions: [] as string[], dietLabels: [] as string[], healthLabels: [] as string[] };
		if (!fn) return empty;
		try {
			const nut = JSON.parse(fn) as Record<string, unknown>;
			return {
				cautions: Array.isArray(nut._cautions) ? (nut._cautions as string[]) : [],
				dietLabels: Array.isArray(nut._diet_labels) ? (nut._diet_labels as string[]) : [],
				healthLabels: Array.isArray(nut._health_labels) ? (nut._health_labels as string[]) : []
			};
		} catch {
			return empty;
		}
	}

	/** يخفي السطر الثاني عندما يكرر الاسم نفسه (اختلاف حالة الأحرف، مسافات، إلخ). */
	function isRedundantSecondaryName(primary: string, secondary: string | null | undefined): boolean {
		if (secondary == null || !String(secondary).trim()) return true;
		const n = (s: string) =>
			s
				.trim()
				.toLowerCase()
				.replace(/\s+/g, ' ');
		return n(primary) === n(secondary);
	}

	/** عنوان مختصر في الواجهة: الجزء قبل أول فاصلة (مثل «Apple Juice, Apple» → «Apple Juice»). */
	function externalFoodHeadingLabel(label: string): string {
		const i = label.indexOf(',');
		if (i <= 0) return label.trim();
		return label.slice(0, i).trim() || label.trim();
	}

	const EXTERNAL_API_PAGE_SIZE = 20;
const EXTERNAL_LOCAL_PAGE_SIZE = 20;

	// External search
	let externalQuery = $state('');
	let externalResults = $state<ExternalFood[]>([]);
	let externalApiPage = $state(1);
let externalLocalPage = $state(1);
	let externalLocalResults = $state<SelectedFoodInfo[]>([]);
	let externalResultSource = $state<'local' | 'api' | null>(null);
	let externalLoading = $state(false);
	let importingIds = $state<Set<string>>(new Set());
	let importedMap = $state<Map<string, number>>(new Map());
	let selectedExternalFood = $state<ExternalFood | null>(null);
	let externalDetailLoading = $state(false);
	let importError = $state('');

	const externalApiTotalPages = $derived(
		Math.max(1, Math.ceil(externalResults.length / EXTERNAL_API_PAGE_SIZE))
	);
	const externalResultsPaged = $derived(
		externalResults.slice(
			(externalApiPage - 1) * EXTERNAL_API_PAGE_SIZE,
			externalApiPage * EXTERNAL_API_PAGE_SIZE
		)
	);
const externalLocalTotalPages = $derived(
	Math.max(1, Math.ceil(externalLocalResults.length / EXTERNAL_LOCAL_PAGE_SIZE))
);
const externalLocalResultsPaged = $derived(
	externalLocalResults.slice(
		(externalLocalPage - 1) * EXTERNAL_LOCAL_PAGE_SIZE,
		externalLocalPage * EXTERNAL_LOCAL_PAGE_SIZE
	)
);
	$effect(() => {
		if (externalApiPage > externalApiTotalPages) externalApiPage = externalApiTotalPages;
	});
$effect(() => {
	if (externalLocalPage > externalLocalTotalPages) externalLocalPage = externalLocalTotalPages;
});

	let searchTimer: ReturnType<typeof setTimeout>;
	async function searchExternal() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(async () => {
			if (externalQuery.length < 2) {
				externalResults = [];
				externalLocalResults = [];
				externalResultSource = null;
				externalApiPage = 1;
				externalLocalPage = 1;
				return;
			}
			externalLoading = true;
			try {
				// Unified backend chain: local/imported -> external catalog DB -> Edamam API fallback.
				const results = await searchExternalFoods<ExternalFood>(externalQuery);
				externalResults = results;
				externalApiPage = 1;
				externalLocalPage = 1;
				externalLocalResults = [];
				externalResultSource = 'api';
				for (const f of results) {
					if (f.alreadyImported && f.dbId !== null) {
						importedMap = new Map([...importedMap, [f.foodId, f.dbId]]);
					}
				}
			} finally { externalLoading = false; }
		}, 350);
	}

	/** Opens the external preview modal and loads full micros/tags via Nutrients API (same data as after import). */
	async function openExternalFoodModal(food: ExternalFood) {
		const id = food.foodId;
		selectedExternalFood = food;
		externalDetailLoading = true;
		try {
			const detail = await fetchExternalFoodDetail(id);
			if (!detail || selectedExternalFood?.foodId !== id) return;
			selectedExternalFood = {
				...selectedExternalFood,
				fullNutrients: detail.fullNutrients ?? selectedExternalFood.fullNutrients,
				calories: detail.calories,
				protein: detail.protein,
				carbs: detail.carbs,
				fat: detail.fat,
				fiber: detail.fiber
			};
		} finally {
			if (selectedExternalFood?.foodId === id) externalDetailLoading = false;
		}
	}

	async function importFood(food: ExternalFood) {
		importError = '';
		importingIds = new Set([...importingIds, food.foodId]);
		const impLbl = labelBucketsFromFullNutrientsJson(food.fullNutrients);
		const nt = normalizeTagBuckets(
			[...food.cautions, ...impLbl.cautions],
			[...food.dietLabels, ...impLbl.dietLabels],
			[...food.healthLabels, ...impLbl.healthLabels]
		);
		food = { ...food, cautions: nt.cautions, dietLabels: nt.dietLabels, healthLabels: nt.healthLabels };
		try {
			const res = await importExternalFood({
				foodId: food.foodId,
				name: food.label,
				nameAr: food.knownAs ?? null,
				calories: food.calories,
				protein: food.protein,
				carbs: food.carbs,
				fat: food.fat,
				fiber: food.fiber,
				image: food.image ?? null,
				fullNutrients: food.fullNutrients ?? null,
				parserFoodJson: JSON.stringify({
					foodId: food.foodId,
					label: food.label,
					knownAs: food.knownAs,
					brand: food.brand,
					category: food.category,
					categoryLabel: food.categoryLabel,
					foodContentsLabel: food.foodContentsLabel,
					image: food.image,
					healthLabels: nt.healthLabels,
					cautions: nt.cautions,
					dietLabels: nt.dietLabels
				}),
				parserMeasuresJson: JSON.stringify(food.measures ?? [])
			});
			if (res.ok) {
				const { id } = (await res.json()) as { id: number };
				importedMap = new Map([...importedMap, [food.foodId, id]]);
				selectedExternalFood = null;
				externalDetailLoading = false;
				selectedFood = null;
				externalQuery = '';
				externalResults = [];
				externalLocalResults = [];
				externalResultSource = null;
				externalLocalPage = 1;
				tabOverride = 'internal';
				await invalidateAll();
			} else {
				const raw = await res.text();
				let msg = 'تعذر الاستيراد. حاول مرة أخرى.';
				try {
					const j = JSON.parse(raw) as { message?: string };
					if (j?.message && typeof j.message === 'string') msg = j.message;
				} catch {
					if (raw.trim()) msg = raw.slice(0, 200);
				}
				importError = msg;
			}
		} catch {
			importError = 'تعذر الاتصال بالخادم. تحقق من الشبكة وحاول مجدداً.';
		} finally {
			const next = new Set(importingIds);
			next.delete(food.foodId);
			importingIds = next;
		}
	}

	// Modal state
	let showCreateModal = $state(false);
let showEditModal = $state(false);
let editingFoodId = $state<number | null>(null);
	let imagePreview = $state<string | null>(null);
	let imageInputEl: HTMLInputElement | undefined = $state();
	let fName = $state('');
let fNameAr = $state('');
	let fQuantity = $state('100');
	let fUnit = $state('g');

	// Tags
	let fCautions = $state<string[]>([]);
	let fDietLabels = $state<string[]>([]);
	let fHealthLabels = $state<string[]>([]);
let editImagePreview = $state<string | null>(null);
let editImageInputEl: HTMLInputElement | undefined = $state();
let eName = $state('');
let eNameAr = $state('');
let eQuantity = $state('100');
let eUnit = $state('g');
let eCalories = $state('0');
let eProtein = $state('0');
let eCarbs = $state('0');
let eFat = $state('0');
let eMicros = $state<Record<string, string>>({});
let eCautions = $state<string[]>([]);
let eDietLabels = $state<string[]>([]);
let eHealthLabels = $state<string[]>([]);
let editCurrentImage = $state<string | null>(null);
let editCautionOpen = $state(false);
let editDietOpen = $state(false);
let editHealthOpen = $state(false);

	// Tag dropdown open states
	let cautionOpen = $state(false);
	let dietOpen = $state(false);
	let healthOpen = $state(false);

	function toggleTag(arr: string[], val: string): string[] {
		return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
	}

	function handleImageChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => { imagePreview = ev.target?.result as string; };
		reader.readAsDataURL(file);
	}

function handleEditImageChange(e: Event) {
	const file = (e.target as HTMLInputElement).files?.[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = (ev) => { editImagePreview = ev.target?.result as string; };
	reader.readAsDataURL(file);
}

function openEditFood(food: SelectedFoodInfo) {
	if (!food.id || food.source === 'edamam') return;
	editingFoodId = food.id;
	eName = food.name ?? '';
	eNameAr = food.nameAr ?? '';
	eQuantity = String(food.portionSize ?? 100);
	eUnit = food.unit ?? 'g';
	eCalories = String(food.calories ?? 0);
	eProtein = String(food.protein ?? 0);
	eCarbs = String(food.carbs ?? 0);
	eFat = String(food.fat ?? 0);
	editCurrentImage = food.imageUrl ?? null;
	editImagePreview = null;
	if (editImageInputEl) editImageInputEl.value = '';

	const micros = parsedMicros(food.fullNutrients ?? null);
	const nextMicros: Record<string, string> = {};
	for (const field of MICRO_FIELDS) {
		const val = micros[field.key];
		nextMicros[field.key] = val !== undefined && val !== null ? String(val) : '';
	}
	eMicros = nextMicros;
	eCautions = Array.isArray((micros as any)._cautions) ? ((micros as any)._cautions as string[]) : [];
	eDietLabels = Array.isArray((micros as any)._diet_labels) ? ((micros as any)._diet_labels as string[]) : [];
	eHealthLabels = Array.isArray((micros as any)._health_labels) ? ((micros as any)._health_labels as string[]) : [];
	editCautionOpen = false;
	editDietOpen = false;
	editHealthOpen = false;
	showEditModal = true;
}

	function resetModal() {
		imagePreview = null;
		if (imageInputEl) imageInputEl.value = '';
		fName = '';
	fNameAr = '';
		fQuantity = '100';
		fUnit = 'g';
		fCautions = [];
		fDietLabels = [];
		fHealthLabels = [];
		cautionOpen = false;
		dietOpen = false;
		healthOpen = false;
	}

	// Close tag dropdowns when clicking outside
	$effect(() => {
		function handleOutside(e: MouseEvent) {
			if (!(e.target as Element).closest('.multi-select')) {
				cautionOpen = false;
				dietOpen = false;
				healthOpen = false;
				editCautionOpen = false;
				editDietOpen = false;
				editHealthOpen = false;
			}
		}
		document.addEventListener('click', handleOutside, true);
		return () => document.removeEventListener('click', handleOutside, true);
	});

	// Nutrient footnote
	const nutrientFootnote = $derived(
		fUnit === 'g' ? 'القيم الغذائية أدناه لكل 100 غرام.' :
		fUnit === 'ml' ? 'القيم الغذائية أدناه لكل 100 مل.' :
		`الحصة المرجعية: ${fQuantity} ${fUnit}. القيم الغذائية لكل 100 غ.`
	);
const editNutrientFootnote = $derived(
	eUnit === 'g' ? 'القيم الغذائية أدناه لكل 100 غرام.' :
	eUnit === 'ml' ? 'القيم الغذائية أدناه لكل 100 مل.' :
	`الحصة المرجعية: ${eQuantity} ${eUnit}. القيم الغذائية لكل 100 غ.`
);
</script>

<svelte:head><title>الأطعمة — نيوتريكير</title></svelte:head>

<style>
	.page {
		--fp-ink: #121816;
		--fp-muted: #5c6560;
		--fp-line: #e2e8e4;
		--fp-surface: #ffffff;
		--fp-accent: #2a9d62;
		--fp-accent-deep: #1f7a4a;
		--fp-warm: #faf9f6;
		--font-display: 'El Messiri', 'Tajawal', serif;

		padding: 28px 32px 40px;
		max-width: 1120px;
		margin: 0 auto;
		font-family: 'Tajawal', sans-serif;
		animation: fp-page-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes fp-page-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.page-header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: 26px;
		flex-wrap: wrap;
		gap: 18px;
	}
	.page-title {
		font-family: var(--font-display);
		font-size: clamp(1.65rem, 4vw, 2rem);
		font-weight: 700;
		color: var(--fp-ink);
		margin: 0 0 8px;
		line-height: 1.15;
	}
	.page-subtitle {
		font-size: 13.5px;
		color: var(--fp-muted);
		margin: 0;
	}
	.page-subtitle strong {
		font-weight: 800;
		color: var(--fp-accent);
		margin-inline-end: 6px;
	}

	.tabs-wrap {
		display: flex;
		gap: 6px;
		background: var(--fp-warm);
		padding: 6px;
		border-radius: 14px;
		width: fit-content;
		margin-bottom: 22px;
		border: 1px solid rgba(226, 232, 228, 0.9);
		box-shadow: 0 2px 12px rgba(18, 24, 22, 0.04);
	}

	.btn-primary {
		background: linear-gradient(165deg, #34b16f 0%, var(--fp-accent) 45%, var(--fp-accent-deep) 100%);
		color: #fff;
		border: 1px solid #1f7a4a;
		border-radius: 12px;
		padding: 11px 20px;
		font-size: 13.5px;
		font-weight: 600;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		transition:
			box-shadow 0.2s ease,
			transform 0.15s ease;
		font-family: 'Tajawal', sans-serif;
		box-shadow: 0 4px 16px rgba(42, 157, 98, 0.28);
	}
	.btn-primary:hover {
		box-shadow: 0 8px 28px rgba(42, 157, 98, 0.35);
	}
	.btn-primary:active {
		transform: scale(0.98);
	}
	.btn-primary:focus-visible {
		outline: 2px solid var(--fp-accent);
		outline-offset: 3px;
	}
	.btn-import {
		background: var(--fp-surface);
		color: var(--fp-accent);
		border: 1.5px solid var(--fp-accent);
		border-radius: 10px;
		padding: 6px 14px;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		transition:
			background 0.15s ease,
			box-shadow 0.15s ease;
		font-family: 'Tajawal', sans-serif;
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.btn-import:hover:not(:disabled) {
		background: rgba(42, 157, 98, 0.08);
		box-shadow: 0 2px 10px rgba(42, 157, 98, 0.12);
	}
	.btn-import:focus-visible {
		outline: 2px solid var(--fp-accent);
		outline-offset: 2px;
	}
	.btn-import:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.tab-btn {
		padding: 9px 22px;
		border-radius: 11px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid transparent;
		transition:
			background 0.2s ease,
			color 0.2s ease,
			box-shadow 0.2s ease;
		font-family: 'Tajawal', sans-serif;
		background: transparent;
		color: var(--fp-muted);
	}
	.tab-btn:hover:not(.active) {
		background: rgba(255, 255, 255, 0.7);
		color: var(--fp-ink);
	}
	.tab-btn:focus-visible {
		outline: 2px solid var(--fp-accent);
		outline-offset: 2px;
	}
	.tab-btn.active {
		background: var(--fp-surface);
		color: var(--fp-accent-deep);
		font-weight: 700;
		border-color: rgba(42, 157, 98, 0.2);
		box-shadow: 0 2px 12px rgba(18, 24, 22, 0.06);
	}
	.input {
		width: 100%;
		border: 1.5px solid #cbd5e1;
		border-radius: 12px;
		padding: 10px 14px;
		font-size: 14px;
		font-family: 'Tajawal', sans-serif;
		outline: none;
		box-sizing: border-box;
		transition:
			border 0.2s ease,
			box-shadow 0.2s ease;
		background: var(--fp-warm);
		color: var(--fp-ink);
	}
	.input:hover:not(:disabled) {
		border-color: #94a3b8;
	}
	.input:focus {
		border-color: var(--fp-accent);
		box-shadow: 0 0 0 4px rgba(42, 157, 98, 0.12);
		background: var(--fp-surface);
	}
	/* Hide number spinners and wheel-style increment UI */
	input[type='number'] {
		-moz-appearance: textfield;
		appearance: textfield;
	}
	input[type='number']::-webkit-outer-spin-button,
	input[type='number']::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.input:disabled {
		background: #f3f4f3;
		color: #9ca3af;
		cursor: not-allowed;
	}
	/* Food list */
	.food-list {
		background: var(--fp-surface);
		border-radius: 18px;
		border: 1px solid var(--fp-line);
		box-shadow: 0 4px 24px rgba(18, 24, 22, 0.05);
		overflow: hidden;
	}
	.food-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 22px;
		border-bottom: 1px solid rgba(226, 232, 228, 0.85);
		transition: background 0.18s ease;
		gap: 16px;
	}
	.food-row:last-child {
		border-bottom: none;
	}
	.food-row:hover {
		background: linear-gradient(90deg, rgba(42, 157, 98, 0.04) 0%, transparent 55%);
	}
	.food-info { flex:1; min-width:0; }
	.food-name {
		font-family: var(--font-display);
		font-size: 14.5px;
		font-weight: 700;
		color: var(--fp-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin: 0 0 4px;
	}
	.food-meta {
		font-size: 11.5px;
		color: var(--fp-muted);
		margin: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.macro-chips {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}
	.macro-chip {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-width: 56px;
		text-align: center;
	}
	.food-row-actions {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}
	.food-row-actions form {
		display: flex;
		align-items: center;
		margin: 0;
	}
	.btn-row-delete {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		padding: 0;
		border-radius: 10px;
		border: 1.5px solid #e5e7eb;
		background: var(--fp-surface);
		color: #9ca3af;
		cursor: pointer;
		transition:
			color 0.15s ease,
			border-color 0.15s ease,
			background 0.15s ease;
	}
	.btn-row-delete:hover {
		color: #ef4444;
		border-color: #fecaca;
		background: #fef2f2;
	}
	.btn-row-delete:focus-visible {
		outline: 2px solid var(--fp-accent);
		outline-offset: 2px;
	}
	.food-search-form {
		margin-bottom: 16px;
	}
	.search-field-wrap {
		position: relative;
		width: 100%;
		max-width: 520px;
	}
	.modal-header-food {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 14px;
	}
	.modal-header-food-main {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
		min-width: 0;
	}
	.modal-header-food-text {
		flex: 1;
		min-width: 0;
	}
	.modal-header-close {
		flex-shrink: 0;
		background: none;
		border: none;
		cursor: pointer;
		color: #8b909a;
		padding: 8px;
		margin: -4px;
		border-radius: 10px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.modal-header-close:hover {
		background: #f1f5f9;
		color: #475569;
	}
	.detail-macro-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
	}
	.detail-macro-tile {
		border-radius: 10px;
		padding: 10px 6px;
		text-align: center;
		min-width: 0;
	}
	.detail-portion-strip {
		font-size: 12px;
		color: #6b7280;
		margin: 0;
		background: #f8fafc;
		border: 1px solid #e8eaed;
		border-radius: 10px;
		padding: 10px 14px;
		line-height: 1.5;
	}
	.macro-val { font-size:13px; font-weight:600; color:#1a1d23; }
	.macro-lbl { font-size:10px; color:#9ca3af; }
	.badge { display:inline-flex; padding:1.5px 7px; border-radius:8px; font-size:11px; font-weight:500; }
	.badge-internal {
		background: rgba(42, 157, 98, 0.1);
		color: var(--fp-accent-deep);
		border: 1px solid rgba(42, 157, 98, 0.15);
	}
	.badge-external {
		background: #eef2ff;
		color: #4338ca;
		border: 1px solid #e0e7ff;
	}
	.badge-saved {
		background: rgba(42, 157, 98, 0.12);
		color: var(--fp-accent-deep);
	}
	/* External search */
	.ext-list {
		background: var(--fp-surface);
		border-radius: 18px;
		border: 1px solid var(--fp-line);
		box-shadow: 0 4px 24px rgba(18, 24, 22, 0.05);
		overflow: hidden;
	}
	.ext-row { display:flex; align-items:center; padding:12px 20px; border-bottom:1px solid #f0f2f5; gap:12px; transition:background .12s; }
	.ext-row:last-child { border-bottom:none; }
	.ext-row:hover { background:#fafffe; }
	.food-thumb { width:40px; height:40px; border-radius:8px; object-fit:cover; flex-shrink:0; }
	.food-thumb-ph { width:40px; height:40px; border-radius:8px; background:#f4f6f9; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
	/* Pagination */
	.pagination-wrap { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:12px; flex-wrap:wrap; }
	.pagination-btn { border:1px solid #e8eaed; background:#fff; color:#4b5563; border-radius:8px; padding:7px 14px; text-decoration:none; font-size:12px; font-weight:600; transition:.15s; }
	.pagination-btn:hover:not(.disabled) {
		border-color: var(--fp-accent);
		color: var(--fp-accent-deep);
		background: rgba(42, 157, 98, 0.06);
	}
	.pagination-btn:focus-visible {
		outline: 2px solid var(--fp-accent);
		outline-offset: 2px;
	}
	.pagination-btn.disabled { pointer-events:none; opacity:.45; }
	/* Modal */
	/* No backdrop-filter on overlay — it causes WebKit to composite modals as translucent over blur */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.62);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
		padding: 16px;
	}
	.modal {
		background: #ffffff;
		background-color: #ffffff;
		border-radius: 20px;
		box-shadow: 0 24px 80px rgba(18, 24, 22, 0.2);
		width: 100%;
		max-width: 640px;
		max-height: 90vh;
		overflow-y: auto;
		font-family: 'Tajawal', sans-serif;
		border: 1px solid var(--fp-line);
		animation: fp-modal-pop 0.36s cubic-bezier(0.22, 1, 0.36, 1) both;
		position: relative;
		z-index: 1;
		isolation: isolate;
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
	}
	@keyframes fp-modal-pop {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(10px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
	.modal-header {
		padding: 22px 24px 16px;
		border-bottom: 1px solid #f0f2f5;
		position: sticky;
		top: 0;
		background: #ffffff;
		background-color: #ffffff;
		z-index: 2;
		border-radius: 18px 18px 0 0;
	}
	.modal-body {
		padding: 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		background: #ffffff;
		background-color: #ffffff;
	}
	.modal-footer {
		padding: 16px 24px;
		border-top: 1px solid #f0f2f5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		position: sticky;
		bottom: 0;
		background: #ffffff;
		background-color: #ffffff;
		border-radius: 0 0 18px 18px;
		z-index: 2;
	}
	.modal-footer-actions {
		display: flex;
		gap: 10px;
		width: 100%;
		justify-content: flex-end;
		flex-direction: row;
		direction: rtl;
	}
	.modal-footer-actions .btn-primary {
		min-width: 150px;
		color: #ffffff !important;
		font-weight: 700;
		background: #1f9e57 !important;
		border-color: #147a41 !important;
		-webkit-appearance: none;
		appearance: none;
		line-height: 1.2;
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
		justify-content: center;
		text-align: center;
	}
	/* أزرار التذييل بدون .modal-footer-actions (مثل نافذة الطعام الخارجي) — يتجاوز إعادة ضبط Tailwind/forms للـ button */
	/* NOTE: hardcoded hex because modal-overlay is outside .page so CSS variables don't inherit */
	.modal-footer .btn-primary {
		color: #ffffff !important;
		background: linear-gradient(165deg, #34b16f 0%, #2a9d62 45%, #1f7a4a 100%) !important;
		border: 1px solid #1f7a4a !important;
		-webkit-appearance: none;
		appearance: none;
	}
	.modal-footer .btn-primary svg {
		stroke: currentColor;
	}
	.btn-secondary {
		padding: 10px 18px;
		border: 1px solid #e8eaed;
		border-radius: 10px;
		background: #fff;
		font-size: 13.5px;
		color: #4b5563;
		cursor: pointer;
		font-family: 'Tajawal', sans-serif;
	}
	.micro-accordion {
		border: 1px solid #e8eaed;
		border-radius: 10px;
		background: #fafafa;
		padding: 10px;
	}
	.micro-accordion summary {
		cursor: pointer;
		font-size: 13px;
		font-weight: 700;
		color: #374151;
	}
	.micro-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		margin-top: 10px;
	}
	.field-label { font-size:11.5px; font-weight:600; color:#059669; margin:0 0 5px; display:block; }
	.required-star { color:#dc2626; font-weight:800; margin-inline-start:2px; }
	.section-card { border:1px solid #e8eaed; border-radius:10px; background:#fafafa; padding:14px; }
	.nut-input { width:100%; height:36px; border:1px solid #e2e8f0; border-radius:7px; background:#f8fafc; padding:0 32px 0 12px; font-size:13px; color:#1e293b; outline:none; box-sizing:border-box; font-family:'Tajawal',sans-serif; }
	.nut-input:focus { border-color:#3cb96b; box-shadow:0 0 0 2px rgba(60,185,107,.15); background:#fff; }
	.nut-unit { position:absolute; left:10px; top:50%; transform:translateY(-50%); font-size:11px; color:#9ca3af; pointer-events:none; }
	/* Multi-select dropdown */
	.multi-select { position:relative; }
	.multi-trigger { display:flex; align-items:center; justify-content:space-between; width:100%; border:1px solid #e8eaed; border-radius:8px; padding:8px 12px; font-size:13px; font-family:'Tajawal',sans-serif; background:#fff; color:#4b5563; cursor:pointer; transition:all .15s; text-align:right; box-sizing:border-box; }
	.multi-trigger:hover { border-color:#3cb96b; background:#fafffe; }
	.multi-trigger.open { border-color:#3cb96b; box-shadow:0 0 0 3px rgba(60,185,107,.1); color:#1a1d23; }
	.multi-dropdown { position:absolute; top:calc(100% + 5px); right:0; left:0; background:#fff; border:1px solid #e8eaed; border-radius:10px; box-shadow:0 8px 28px rgba(0,0,0,.13); z-index:50; max-height:200px; overflow-y:auto; padding:5px; }
	.multi-option { display:flex; align-items:center; gap:9px; padding:7px 10px; border-radius:7px; cursor:pointer; transition:background .1s; font-size:13px; font-family:'Tajawal',sans-serif; color:#374151; }
	.multi-option:hover { background:#f4f9f6; }
	.multi-option.checked { background:#edf9f2; color:#059669; font-weight:500; }
	.multi-option input[type=checkbox] { width:15px; height:15px; accent-color:#3cb96b; cursor:pointer; flex-shrink:0; }
	.sel-tags { display:flex; flex-wrap:wrap; gap:4px; margin-top:7px; }
	.sel-tag { display:inline-flex; align-items:center; gap:3px; padding:2px 6px 2px 4px; border-radius:12px; font-size:11.5px; background:#edf9f2; color:#1f9e57; border:1px solid #b6e9ce; }
	.sel-tag button { background:none; border:none; padding:0 0 0 2px; cursor:pointer; color:#6b9e80; line-height:1; display:flex; align-items:center; }
	.sel-tag button:hover { color:#dc2626; }
	.spinner { width:14px; height:14px; border:2px solid #b6e9ce; border-top-color:#3cb96b; border-radius:50%; animation:spin .6s linear infinite; }
	@keyframes spin { to { transform:rotate(360deg); } }
	.img-picker { width:80px; height:80px; border-radius:12px; border:2px dashed #d1d5db; background:#f9fafb; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; flex-shrink:0; transition:border-color .15s, background .15s; position:relative; }
	.img-picker:hover { border-color:#3cb96b; background:#edf9f2; }
	.img-picker img { width:100%; height:100%; object-fit:cover; }
	.img-remove { position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%; background:#ef4444; color:#fff; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:11px; }

	@media (max-width: 720px) {
		.page {
			padding: 14px max(10px, env(safe-area-inset-right, 0px)) 28px max(10px, env(safe-area-inset-left, 0px));
			max-width: 100%;
		}
		.page-header {
			flex-direction: column;
			align-items: stretch;
			gap: 12px;
		}
		.page-header .btn-primary {
			width: 100%;
			justify-content: center;
			min-height: 46px;
		}
		.tabs-wrap {
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
			display: flex;
			flex-wrap: nowrap;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: thin;
		}
		.tab-btn {
			flex: 1 1 auto;
			min-width: min(140px, 42vw);
			justify-content: center;
			padding-inline: 14px;
		}
		.food-row {
			flex-direction: column;
			align-items: stretch;
			padding: 14px 16px;
			gap: 12px;
		}
		.food-row > div:first-child {
			width: 100%;
		}
		.food-name {
			white-space: normal;
			overflow: visible;
			text-overflow: unset;
		}
		.macro-chips {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 8px;
			width: 100%;
		}
		.macro-chip {
			min-width: 0;
			padding: 8px 4px;
			background: #f8fafc;
			border: 1px solid #eef2f6;
			border-radius: 12px;
		}
		.food-row-actions {
			align-self: stretch;
			justify-content: flex-start;
			flex-wrap: wrap;
			gap: 10px;
			padding-top: 2px;
		}
		.food-row-actions .btn-import {
			margin-inline-end: 0 !important;
			margin-right: 0 !important;
			min-height: 40px;
			padding: 8px 16px;
		}
		.detail-macro-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.modal-overlay {
			padding: 0;
			align-items: flex-end;
		}
		.modal {
			max-width: none;
			width: 100%;
			max-height: min(94dvh, 920px);
			border-radius: 18px 18px 0 0;
		}
		.modal-header,
		.modal-body {
			padding-inline: 16px;
		}
		.modal-footer {
			padding-inline: 16px;
			flex-wrap: wrap;
			gap: 10px;
		}
		.modal-footer-actions {
			flex-direction: column;
			align-items: stretch;
		}
		.modal-footer-actions .btn-primary {
			min-width: 0;
			width: 100%;
			min-height: 46px;
		}
		.micro-grid {
			grid-template-columns: 1fr;
		}
		.pagination-wrap {
			flex-direction: column;
			align-items: stretch;
			text-align: center;
		}
		.pagination-wrap > div:last-child {
			justify-content: center;
			display: flex;
			gap: 8px;
		}
	}
</style>

<div class="page" dir="rtl">
	<div class="page-header">
		<div>
			<h1 class="page-title">قاعدة الأطعمة</h1>
			<p class="page-subtitle"><strong>{data.totalCount}</strong> عنصر في قاعدة البيانات</p>
		</div>
		{#if activeTab === 'internal'}
			<button class="btn-primary" onclick={() => { resetModal(); showCreateModal = true; }}>
				<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
				</svg>
				إضافة طعام
			</button>
		{/if}
	</div>

	<!-- Tabs -->
	<div class="tabs-wrap">
		<button
			class="tab-btn {activeTab === 'internal' ? 'active' : ''}"
			onclick={() => {
				tabOverride = 'internal';
				importError = '';
			}}
		>أطعمتي</button>
		<button class="tab-btn {activeTab === 'external' ? 'active' : ''}" onclick={() => (tabOverride = 'external')}>قاعدة بيانات خارجية</button>
	</div>

	{#if form?.error}
		<div style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; padding:12px 16px; border-radius:8px; margin-bottom:16px; font-size:13px;">{form.error}</div>
	{/if}

	{#if activeTab === 'internal'}
		<!-- Internal search -->
		<form method="GET" class="food-search-form">
			<div class="search-field-wrap">
				<svg style="position:absolute; right:13px; top:50%; transform:translateY(-50%); width:15px; height:15px; color:#8b909a; pointer-events:none;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
				</svg>
				<input type="text" name="q" value={data.q} placeholder="بحث في الأطعمة..." class="input" style="padding-right:42px;" />
			</div>
		</form>

		<div class="food-list">
			{#each data.foods as { food, category }}
				{@const rowImg = foodRowImageUrl(food)}
				<div class="food-row">
					<!-- svelte-ignore a11y_interactive_supports_focus -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
						{#if rowImg}
							<img src={rowImg} alt={food.nameAr ?? food.name} class="food-thumb" />
						{:else}
							<div class="food-thumb-ph" aria-hidden="true">
								<svg width="14" height="14" fill="none" stroke="#c0c7d0" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
							</div>
						{/if}
						<div class="food-info" style="cursor:pointer;" onclick={() => selectFood(food, category)} role="button">
							<p class="food-name">{food.nameAr ?? food.name}</p>
							<p class="food-meta">
								<span class="badge {food.source === 'edamam' ? 'badge-external' : 'badge-internal'}">{food.source === 'edamam' ? 'قاعدة خارجية' : 'أطعمتي'}</span>
								{#if category}
									<span>·</span>
									<span>{category.nameAr}</span>
								{/if}
							</p>
						</div>
					</div>
					<div
						class="macro-chips"
						style="cursor:pointer;"
						role="button"
						tabindex="0"
						onclick={() => selectFood(food, category)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								selectFood(food, category);
							}
						}}
					>
						<div class="macro-chip">
							<span class="macro-val">{food.calories}</span>
							<span class="macro-lbl">kcal</span>
						</div>
						<div class="macro-chip" style="color:#f59e0b;">
							<span class="macro-val" style="color:#f59e0b;">{food.fat}g</span>
							<span class="macro-lbl">الدهون</span>
						</div>
						<div class="macro-chip" style="color:#3cb96b;">
							<span class="macro-val" style="color:#3cb96b;">{food.carbs}g</span>
							<span class="macro-lbl">الكارب</span>
						</div>
						<div class="macro-chip" style="color:#7c5cbf;">
							<span class="macro-val" style="color:#7c5cbf;">{food.protein}g</span>
							<span class="macro-lbl">البروتين</span>
						</div>
					</div>
					{#if food.createdBy === data.userId}
						<div class="food-row-actions">
							{#if food.createdBy === data.userId && food.source !== 'edamam'}
								<button
									type="button"
									class="btn-import"
									style="flex-shrink:0;"
									onclick={() =>
										openEditFood({
											id: food.id,
											name: food.name,
											nameAr: food.nameAr,
											imageUrl: rowImg,
											calories: food.calories,
											protein: food.protein,
											carbs: food.carbs,
											fat: food.fat,
											fiber: food.fiber,
											unit: food.unit,
											portionSize: food.portionSize,
											source: food.source,
											fullNutrients: food.fullNutrients,
											categoryNameAr: category?.nameAr ?? null,
											externalNutrientsJson: food.externalNutrientsJson ?? null,
											createdBy: food.createdBy ?? null
										})
									}
								>
									تعديل
								</button>
							{/if}
							{#if food.createdBy === data.userId}
								<form method="POST" action="?/deleteFood" use:enhance>
									<input type="hidden" name="foodId" value={food.id} />
									<button
										type="submit"
										class="btn-row-delete"
										title={food.source === 'edamam' && food.createdBy === data.userId
											? 'إزالة من أطعمتي فقط — يبقى الطعام في القاعدة الخارجية وفي الخطط التي تستخدمه'
											: 'حذف من أطعمتي'}
										aria-label="حذف"
									>
										<svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
									</button>
								</form>
							{/if}
						</div>
					{/if}
				</div>
			{:else}
				<div style="text-align:center; padding:48px; color:#8b909a; font-size:13px;">
					{data.q ? `لا توجد نتائج لـ "${data.q}"` : 'لا توجد أطعمة — أضف أول طعام أو استورد من البحث الخارجي'}
				</div>
			{/each}
		</div>

		<div class="pagination-wrap">
			<div style="font-size:12px; color:#8b909a;">صفحة {data.page} من {data.totalPages}</div>
			<div style="display:flex; gap:8px;">
				<a class="pagination-btn {data.page <= 1 ? 'disabled' : ''}" href={`/dietitian/foods?q=${encodeURIComponent(data.q)}&page=${Math.max(1, data.page - 1)}`}>السابق</a>
				<a class="pagination-btn {data.page >= data.totalPages ? 'disabled' : ''}" href={`/dietitian/foods?q=${encodeURIComponent(data.q)}&page=${Math.min(data.totalPages, data.page + 1)}`}>التالي</a>
			</div>
		</div>
	{:else}
		<!-- External Tab: search bar to find new ones + existing external foods -->
		{#if importError}
			<div
				style="background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:13px; display:flex; align-items:flex-start; justify-content:space-between; gap:12px;"
			>
				<span style="flex:1;">{importError}</span>
				<button
					type="button"
					onclick={() => (importError = '')}
					style="background:none; border:none; cursor:pointer; color:#991b1b; font-size:12px; flex-shrink:0; font-family:'Tajawal',sans-serif;"
				>
					إغلاق
				</button>
			</div>
		{/if}
		<div style="display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; align-items:center;">
			<div class="search-field-wrap" style="flex:1; min-width:0; max-width:560px;">
				<svg style="position:absolute; right:13px; top:50%; transform:translateY(-50%); width:15px; height:15px; color:#8b909a; pointer-events:none;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
				</svg>
				<input type="text" bind:value={externalQuery} oninput={searchExternal} placeholder="ابحث عن أي طعام بالإنجليزي للاستيراد..." class="input" style="padding-right:42px;" />
			</div>
			{#if externalQuery}
				<button onclick={() => { externalQuery = ''; externalResults = []; externalLocalResults = []; externalResultSource = null; externalApiPage = 1; }} style="background:none; border:none; cursor:pointer; color:#8b909a; font-size:13px; font-family:'Tajawal',sans-serif; padding:0;">مسح</button>
			{/if}
		</div>

		{#if externalLoading}
			<div style="display:flex; align-items:center; justify-content:center; gap:10px; padding:40px; color:#8b909a; font-size:13px;">
				<div class="spinner"></div>
				{externalResultSource === 'local' ? 'جاري البحث في قاعدتك...' : 'لا نتائج محلية — جاري البحث في Edamam...'}
			</div>
		{:else if externalQuery.length >= 2}
			{#if externalResultSource === 'local' && externalLocalResults.length > 0}
				<!-- Local imported foods matched -->
				<p style="font-size:12px; color:#8b909a; margin:0 0 10px;">
					{externalLocalResults.length} نتيجة من قاعدتك المستوردة
					{#if externalLocalTotalPages > 1}
						— عرض {(externalLocalPage - 1) * EXTERNAL_LOCAL_PAGE_SIZE + 1}–{Math.min(externalLocalPage * EXTERNAL_LOCAL_PAGE_SIZE, externalLocalResults.length)} من {externalLocalResults.length}
					{/if}
				</p>
				<div class="food-list">
					{#each externalLocalResultsPaged as food}
						<!-- svelte-ignore a11y_interactive_supports_focus -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div class="food-row" style="cursor:pointer;" onclick={() => (selectedFood = food)} role="button">
							<div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
								{#if food.imageUrl}
									<img src={food.imageUrl} alt={food.name} class="food-thumb" />
								{:else}
									<div class="food-thumb-ph">
										<svg width="14" height="14" fill="none" stroke="#c0c7d0" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
									</div>
								{/if}
								<div class="food-info">
									<p class="food-name">{food.nameAr ?? food.name}</p>
									<p class="food-meta">
										<span class="badge badge-saved">✓ مستورد</span>
									</p>
								</div>
							</div>
							<div class="macro-chips">
								<div class="macro-chip"><span class="macro-val">{food.calories}</span><span class="macro-lbl">kcal</span></div>
								<div class="macro-chip"><span class="macro-val" style="color:#f59e0b;">{food.fat}g</span><span class="macro-lbl">دهون</span></div>
								<div class="macro-chip"><span class="macro-val" style="color:#3cb96b;">{food.carbs}g</span><span class="macro-lbl">كارب</span></div>
								<div class="macro-chip"><span class="macro-val" style="color:#7c5cbf;">{food.protein}g</span><span class="macro-lbl">بروتين</span></div>
							</div>
						</div>
					{/each}
				</div>
				{#if externalLocalTotalPages > 1}
					<div class="pagination-wrap" style="margin-top:16px;">
						<div style="font-size:12px; color:#8b909a;">
							صفحة {externalLocalPage} من {externalLocalTotalPages}
						</div>
						<div style="display:flex; gap:8px;">
							<button
								type="button"
								class="pagination-btn {externalLocalPage <= 1 ? 'disabled' : ''}"
								disabled={externalLocalPage <= 1}
								onclick={() => (externalLocalPage = Math.max(1, externalLocalPage - 1))}
							>السابق</button>
							<button
								type="button"
								class="pagination-btn {externalLocalPage >= externalLocalTotalPages ? 'disabled' : ''}"
								disabled={externalLocalPage >= externalLocalTotalPages}
								onclick={() =>
									(externalLocalPage = Math.min(externalLocalTotalPages, externalLocalPage + 1))}
							>التالي</button>
						</div>
					</div>
				{/if}
			{:else if externalResultSource === 'api' && externalResults.length > 0}
				<!-- Edamam API results (no local match found) -->
				<div class="ext-list">
					{#each externalResultsPaged as food}
						{@const isImported = importedMap.has(food.foodId) || food.alreadyImported}
						{@const isImporting = importingIds.has(food.foodId)}
						<!-- svelte-ignore a11y_interactive_supports_focus -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div class="ext-row" style="cursor:pointer;" role="button" onclick={() => {
							if (isImported) {
								const dbId = importedMap.get(food.foodId) ?? food.dbId ?? 0;
								selectedFood = {
									id: dbId,
									name: food.label,
									nameAr: food.knownAs,
									imageUrl: food.image,
									calories: food.calories,
									protein: food.protein,
									carbs: food.carbs,
									fat: food.fat,
									fiber: food.fiber,
									unit: 'g',
									portionSize: 100,
									source: 'edamam',
									fullNutrients: food.fullNutrients,
									categoryNameAr: null,
									brand: food.brand,
									edamamCategory: food.category,
									edamamCategoryLabel: food.categoryLabel,
									foodContentsLabel: food.foodContentsLabel,
									measures: food.measures,
									createdBy: data.userId
								};
							} else {
								openExternalFoodModal(food);
							}
						}}>
							{#if food.image}
								<img src={food.image} alt={food.label} class="food-thumb" />
							{:else}
								<div class="food-thumb-ph">
									<svg width="16" height="16" fill="none" stroke="#c0c7d0" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
								</div>
							{/if}
							<div style="flex:1; min-width:0;">
								<p style="font-weight:600; font-size:13.5px; color:#1a1d23; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{food.label}</p>
								{#if food.knownAs && food.knownAs !== food.label}
									<p style="font-size:11.5px; color:#8b909a; margin:1px 0 0;">{food.knownAs}</p>
								{/if}
							</div>
							<div class="macro-chips" style="margin-left:8px;">
								<div class="macro-chip"><span class="macro-val">{food.calories}</span><span class="macro-lbl">kcal</span></div>
								<div class="macro-chip"><span class="macro-val" style="color:#f59e0b;">{food.fat}g</span><span class="macro-lbl">دهون</span></div>
								<div class="macro-chip"><span class="macro-val" style="color:#3cb96b;">{food.carbs}g</span><span class="macro-lbl">كارب</span></div>
								<div class="macro-chip"><span class="macro-val" style="color:#7c5cbf;">{food.protein}g</span><span class="macro-lbl">بروتين</span></div>
							</div>
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_interactive_supports_focus -->
							<div style="flex-shrink:0; margin-right:12px;" onclick={(e) => e.stopPropagation()} role="presentation">
								{#if isImported}
									<button
										type="button"
										class="btn-import"
										onclick={() => {
											const dbId = importedMap.get(food.foodId) ?? food.dbId ?? 0;
											selectedFood = {
												id: dbId,
												name: food.label,
												nameAr: food.knownAs,
												imageUrl: food.image,
												calories: food.calories,
												protein: food.protein,
												carbs: food.carbs,
												fat: food.fat,
												fiber: food.fiber,
												unit: 'g',
												portionSize: 100,
												source: 'edamam',
												fullNutrients: food.fullNutrients,
												categoryNameAr: null,
												brand: food.brand,
												edamamCategory: food.category,
												edamamCategoryLabel: food.categoryLabel,
												foodContentsLabel: food.foodContentsLabel,
												measures: food.measures,
												createdBy: data.userId
											};
										}}
									>
										عرض
									</button>
								{:else if isImporting}
									<button type="button" class="btn-import" disabled aria-label="جاري الاستيراد" title="جاري الاستيراد"><div class="spinner"></div></button>
								{:else}
									<button class="btn-import" onclick={() => importFood(food)}>
										<svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
										استيراد
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
				{#if externalApiTotalPages > 1}
					<div class="pagination-wrap" style="margin-top:16px;">
						<div style="font-size:12px; color:#8b909a;">
							صفحة {externalApiPage} من {externalApiTotalPages}
						</div>
						<div style="display:flex; gap:8px;">
							<button
								type="button"
								class="pagination-btn {externalApiPage <= 1 ? 'disabled' : ''}"
								disabled={externalApiPage <= 1}
								onclick={() => (externalApiPage = Math.max(1, externalApiPage - 1))}
							>السابق</button>
							<button
								type="button"
								class="pagination-btn {externalApiPage >= externalApiTotalPages ? 'disabled' : ''}"
								disabled={externalApiPage >= externalApiTotalPages}
								onclick={() =>
									(externalApiPage = Math.min(externalApiTotalPages, externalApiPage + 1))}
							>التالي</button>
						</div>
					</div>
				{/if}
			{:else}
				<div style="text-align:center; padding:40px; color:#8b909a; font-size:13px;">لا توجد نتائج لـ "{externalQuery}"</div>
			{/if}
		{:else}
			<!-- Default: كل أطعمة الكتالوج الخارجي المحفوظة؛ «مستورد» عند وجود ربط في أطعمتي -->
			{#if data.externalTotalCount > 0}
				<div class="food-list">
					{#each data.externalFoods as row}
						{@const catalog = row.catalog}
						{@const food = row.food}
						{@const category = row.category}
						{@const isImported = food != null && food.id != null}
						{@const rowImg = foodRowImageUrl(
							isImported
								? food
								: { imageUrl: catalog.imageUrl, externalParserFoodJson: catalog.externalParserFoodJson }
						)}
						{@const displayName = isImported ? (food!.nameAr ?? food!.name) : (catalog.nameAr ?? catalog.name)}
						{@const kcal = isImported ? food!.calories : catalog.calories}
						{@const fatv = isImported ? food!.fat : catalog.fat}
						{@const carbsv = isImported ? food!.carbs : catalog.carbs}
						{@const protv = isImported ? food!.protein : catalog.protein}
						{@const isRowImporting = importingIds.has(catalog.providerFoodId)}
						<!-- svelte-ignore a11y_interactive_supports_focus -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div
							class="food-row"
							style="cursor:pointer;"
							onclick={() =>
								isImported
									? selectFood(food!, category)
									: openExternalFoodModal(catalogRowToExternalFood(catalog))}
							role="button"
						>
							<div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
								{#if rowImg}
									<img src={rowImg} alt={displayName} class="food-thumb" />
								{:else}
									<div class="food-thumb-ph" aria-hidden="true">
										<svg width="14" height="14" fill="none" stroke="#c0c7d0" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
									</div>
								{/if}
								<div class="food-info">
									<p class="food-name">{displayName}</p>
									<p class="food-meta">
										{#if isImported}
											<span class="badge badge-saved">مستورد</span>
										{/if}
										<span class="badge badge-external">قاعدة خارجية</span>
										{#if category}<span>·</span><span>{category.nameAr}</span>{/if}
									</p>
								</div>
							</div>
							<div class="macro-chips">
								<div class="macro-chip"><span class="macro-val">{kcal}</span><span class="macro-lbl">kcal</span></div>
								<div class="macro-chip"><span class="macro-val" style="color:#f59e0b;">{fatv}g</span><span class="macro-lbl">دهون</span></div>
								<div class="macro-chip"><span class="macro-val" style="color:#3cb96b;">{carbsv}g</span><span class="macro-lbl">كارب</span></div>
								<div class="macro-chip"><span class="macro-val" style="color:#7c5cbf;">{protv}g</span><span class="macro-lbl">بروتين</span></div>
							</div>
							<div class="food-row-actions" onclick={(e) => e.stopPropagation()} role="presentation">
								{#if isImported}
									<button
										type="button"
										class="btn-import"
										style="margin-right:0;"
										onclick={() => selectFood(food!, category)}
									>
										عرض
									</button>
									{#if food!.createdBy === data.userId}
										<form method="POST" action="?/deleteFood" use:enhance>
											<input type="hidden" name="foodId" value={food!.id} />
											<button
												type="submit"
												class="btn-row-delete"
												title="إزالة من أطعمتي فقط — القاعدة الخارجية لا تُحذف"
												aria-label="حذف"
											>
												<svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
												</svg>
											</button>
										</form>
									{/if}
								{:else if isRowImporting}
									<button type="button" class="btn-import" disabled style="margin-right:0;" aria-label="جاري الاستيراد" title="جاري الاستيراد"><div class="spinner"></div></button>
								{:else}
									<button
										type="button"
										class="btn-import"
										style="margin-right:0;"
										onclick={() => openExternalFoodModal(catalogRowToExternalFood(catalog))}
									>
										عرض
									</button>
									<button
										type="button"
										class="btn-import"
										onclick={() => importFood(catalogRowToExternalFood(catalog))}
									>
										<svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
										استيراد
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
				{#if data.externalTotalPages > 1}
					<div class="pagination-wrap">
						<div style="font-size:12px; color:#8b909a;">صفحة {data.externalPage} من {data.externalTotalPages}</div>
						<div style="display:flex; gap:8px;">
							<a
								class="pagination-btn {data.externalPage <= 1 ? 'disabled' : ''}"
								href={`/dietitian/foods?extPage=${Math.max(1, data.externalPage - 1)}`}
							>السابق</a>
							<a
								class="pagination-btn {data.externalPage >= data.externalTotalPages ? 'disabled' : ''}"
								href={`/dietitian/foods?extPage=${Math.min(data.externalTotalPages, data.externalPage + 1)}`}
							>التالي</a>
						</div>
					</div>
				{/if}
			{:else}
				<div style="text-align:center; padding:56px 20px; color:#8b909a; font-size:13px;">
					<svg width="36" height="36" fill="none" stroke="#d1d5db" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto 14px; display:block;">
						<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
					</svg>
					<p style="margin:0 0 4px; font-weight:500; color:#6b7280; font-size:14px;">لا توجد أطعمة في الكتالوج الخارجي بعد</p>
					<p style="margin:0; font-size:12.5px;">ابحث بالإنجليزي أعلاه — تُحفظ نتائج Edamam في القائمة ويمكنك استيرادها لاحقًا إلى أطعمتي</p>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<!-- External Food Detail Panel (not yet imported) -->
{#if selectedExternalFood}
	{@const ef = selectedExternalFood}
	{@const efHeading = externalFoodHeadingLabel(ef.label)}
	{@const efMicros = parsedMicros(ef.fullNutrients)}
	{@const nutLbl = labelBucketsFromFullNutrientsJson(ef.fullNutrients)}
	{@const extTags = normalizeTagBuckets(
		[...ef.cautions, ...nutLbl.cautions],
		[...ef.dietLabels, ...nutLbl.dietLabels],
		[...ef.healthLabels, ...nutLbl.healthLabels]
	)}
	{@const isImporting = importingIds.has(ef.foodId)}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && ((selectedExternalFood = null), (externalDetailLoading = false))}>
		<div class="modal" style="max-width:520px;">
			<div class="modal-header">
				<div class="modal-header-food">
					<div class="modal-header-food-main">
						{#if ef.image}
							<img src={ef.image} alt={efHeading} style="width:52px; height:52px; border-radius:10px; object-fit:cover; flex-shrink:0;" />
						{/if}
						<div class="modal-header-food-text">
							<h2 style="font-size:16px; font-weight:700; color:#1a1d23; margin:0 0 2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{efHeading}</h2>
							{#if ef.knownAs && !isRedundantSecondaryName(ef.label, ef.knownAs)}
								<p style="font-size:12px; color:#8b909a; margin:0;">{ef.knownAs}</p>
							{/if}
							<div style="display:flex; align-items:center; gap:6px; margin-top:4px; flex-wrap:wrap;">
								<span class="badge badge-external">قاعدة بيانات خارجية</span>
							</div>
						</div>
					</div>
					<button type="button" class="modal-header-close" aria-label="إغلاق" title="إغلاق" onclick={() => ((selectedExternalFood = null), (externalDetailLoading = false))}>
						<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
					</button>
				</div>
			</div>

			<div class="modal-body">
				<p class="detail-portion-strip" style="font-weight:600; color:#4b5563;">
					جميع القيم أدناه لكل <strong style="color:#1a1d23;">100 غ</strong> من الطعام
				</p>
				{#if externalDetailLoading}
					<div style="display:flex; align-items:center; gap:10px; font-size:12.5px; color:#6b7280; padding:8px 12px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px;">
						<div class="spinner" style="width:18px; height:18px; border-width:2px;"></div>
						<span>جاري تحميل التفاصيل الكاملة من Edamam (المغذيات الدقيقة والعلامات)…</span>
					</div>
				{/if}

				<!-- Macros (الأساس 100 غ في الشريط أعلاه فقط) -->
				<div class="detail-macro-grid">
					<div class="detail-macro-tile" style="background:#fff8f0; border:1px solid #fed7aa;">
						<p style="font-size:18px; font-weight:700; color:#ea580c; margin:0 0 2px;">{ef.calories}<span style="font-size:12px; font-weight:600;"> kcal</span></p>
						<p style="font-size:11px; color:#9a3412; margin:0;">سعرات</p>
					</div>
					<div class="detail-macro-tile" style="background:#faf5ff; border:1px solid #e9d5ff;">
						<p style="font-size:18px; font-weight:700; color:#7c3aed; margin:0 0 2px;">{ef.protein}g</p>
						<p style="font-size:11px; color:#5b21b6; margin:0;">بروتين</p>
					</div>
					<div class="detail-macro-tile" style="background:#f0fdf4; border:1px solid #bbf7d0;">
						<p style="font-size:18px; font-weight:700; color:#16a34a; margin:0 0 2px;">{ef.carbs}g</p>
						<p style="font-size:11px; color:#166534; margin:0;">كارب</p>
					</div>
					<div class="detail-macro-tile" style="background:#fffbeb; border:1px solid #fde68a;">
						<p style="font-size:18px; font-weight:700; color:#d97706; margin:0 0 2px;">{ef.fat}g</p>
						<p style="font-size:11px; color:#92400e; margin:0;">دهون</p>
					</div>
				</div>

				<!-- Fiber -->
				{#if ef.fiber > 0}
					<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f9fafb; border-radius:8px; font-size:13px;">
						<span style="color:#4b5563;">الألياف</span>
						<span style="font-weight:600;">{ef.fiber}g</span>
					</div>
				{/if}

				<!-- Micros -->
				{#if Object.keys(efMicros).filter(k => !k.startsWith('_')).length > 0}
					<div>
						<p style="font-size:12px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; margin:0 0 8px;">المغذيات الدقيقة</p>
						<div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
							{#each MICRO_FIELDS as field}
								{#if !(field.key === 'FIBTG' && ef.fiber > 0)}
									{@const val = efMicros[field.key]}
									{#if val !== undefined && val !== 0}
										<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 10px; background:#f9fafb; border-radius:7px; font-size:12.5px;">
											<span style="color:#6b7280;">{field.label}</span>
											<span style="font-weight:600; color:#1a1d23; text-align:end;">
												{typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(1)) : val}
												{field.unit}
											</span>
										</div>
									{/if}
								{/if}
							{/each}
						</div>
					</div>
				{/if}

				<!-- Labels from Edamam (نفس تجميع نموذج الإضافة) -->
				{#if extTags.cautions.length || extTags.dietLabels.length || extTags.healthLabels.length}
					<div class="section-card" style="padding:0; overflow:visible;">
						<div style="padding:10px 14px; border-bottom:1px solid #e8eaed; background:#f9fafb; border-radius:10px 10px 0 0;">
							<p style="font-size:13px; font-weight:600; color:#1a1d23; margin:0 0 2px;">التصنيفات والعلامات</p>
							<p style="font-size:11px; color:#8b909a; margin:0;">من قاعدة البيانات الخارجية لهذا الطعام.</p>
						</div>
						<div style="padding:14px; display:flex; flex-direction:column; gap:14px;">
							{#if extTags.cautions.length}
								<div>
									<p style="font-size:11.5px; font-weight:600; color:#92400e; margin:0 0 8px;">تحذيرات (مسببات حساسية)</p>
									<div style="display:flex; flex-wrap:wrap; gap:5px;">
										{#each extTags.cautions as c}
											<span style="padding:2px 9px; background:#fef3c7; color:#92400e; border-radius:20px; font-size:11.5px; border:1px solid #fde68a;">{tagLabelAr(c)}</span>
										{/each}
									</div>
								</div>
							{/if}
							{#if extTags.dietLabels.length}
								<div>
									<p style="font-size:11.5px; font-weight:600; color:#065f46; margin:0 0 8px;">التصنيف الغذائي</p>
									<div style="display:flex; flex-wrap:wrap; gap:5px;">
										{#each extTags.dietLabels as d}
											<span style="padding:2px 9px; background:#d1fae5; color:#065f46; border-radius:20px; font-size:11.5px; border:1px solid #6ee7b7;">{tagLabelAr(d)}</span>
										{/each}
									</div>
								</div>
							{/if}
							{#if extTags.healthLabels.length}
								<div>
									<p style="font-size:11.5px; font-weight:600; color:#0c4a6e; margin:0 0 8px;">خالٍ من / مناسب لـ</p>
									<div style="display:flex; flex-wrap:wrap; gap:5px;">
										{#each extTags.healthLabels as h}
											<span style="padding:2px 9px; background:#e0f2fe; color:#0c4a6e; border-radius:20px; font-size:11.5px; border:1px solid #7dd3fc;">{tagLabelAr(h)}</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				<p style="margin:0; font-size:12px; color:#8b909a; max-width:240px; line-height:1.45;">استورد هذا الطعام لإضافته إلى قاعدة بياناتك.</p>
				<div style="display:flex; gap:8px;">
					<button onclick={() => ((selectedExternalFood = null), (externalDetailLoading = false))} style="padding:8px 18px; border:1px solid #e8eaed; border-radius:8px; background:#fff; font-size:13.5px; color:#4b5563; cursor:pointer; font-family:'Tajawal',sans-serif;">إغلاق</button>
					{#if isImporting}
						<button class="btn-primary" disabled style="opacity:.6; cursor:not-allowed; gap:8px;"><div class="spinner"></div> جاري...</button>
					{:else}
						<button class="btn-primary" onclick={() => importFood(ef)}>
							<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
							استيراد
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Food Detail Panel -->
{#if selectedFood}
	{@const micros = parsedMicros(selectedFood.fullNutrients)}
	{@const cautions = (micros as any)._cautions as string[] | undefined}
	{@const dietLabels = (micros as any)._diet_labels as string[] | undefined}
	{@const healthLabels = (micros as any)._health_labels as string[] | undefined}
	{@const selTags = normalizeTagBuckets(cautions ?? [], dietLabels ?? [], healthLabels ?? [])}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (selectedFood = null)}>
		<div class="modal" style="max-width:520px;">
			<!-- Header -->
			<div class="modal-header">
				<div class="modal-header-food">
					<div class="modal-header-food-main">
						{#if selectedFood.imageUrl}
							<img src={selectedFood.imageUrl} alt={selectedFood.name} style="width:52px; height:52px; border-radius:10px; object-fit:cover; flex-shrink:0;" />
						{/if}
						<div class="modal-header-food-text">
							<h2 style="font-size:16px; font-weight:700; color:#1a1d23; margin:0 0 2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
								{selectedFood.nameAr ?? selectedFood.name}
							</h2>
							{#if selectedFood.nameAr && !isRedundantSecondaryName(selectedFood.nameAr, selectedFood.name)}
								<p style="font-size:12px; color:#8b909a; margin:0;">{selectedFood.name}</p>
							{/if}
							<div style="display:flex; align-items:center; gap:6px; margin-top:4px; flex-wrap:wrap;">
								<span class="badge {selectedFood.source === 'edamam' ? 'badge-external' : 'badge-internal'}">{selectedFood.source === 'edamam' ? 'قاعدة خارجية' : 'أطعمتي'}</span>
								{#if selectedFood.categoryNameAr}<span style="font-size:11.5px; color:#8b909a;">· {selectedFood.categoryNameAr}</span>{/if}
							</div>
						</div>
					</div>
					<button type="button" class="modal-header-close" aria-label="إغلاق" title="إغلاق" onclick={() => (selectedFood = null)}>
						<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
					</button>
				</div>
			</div>

			<div class="modal-body">
				<!-- Portion -->
				<p class="detail-portion-strip">
					القيم الغذائية لكل {selectedFood.portionSize} {selectedFood.unit === 'g' ? 'غرام' : selectedFood.unit === 'ml' ? 'مل' : selectedFood.unit}
				</p>

				<!-- Macros -->
				<div class="detail-macro-grid">
					<div class="detail-macro-tile" style="background:#fff8f0; border:1px solid #fed7aa;">
						<p style="font-size:18px; font-weight:700; color:#ea580c; margin:0 0 2px;">{selectedFood.calories}</p>
						<p style="font-size:11px; color:#9a3412; margin:0;">سعرات</p>
					</div>
					<div class="detail-macro-tile" style="background:#faf5ff; border:1px solid #e9d5ff;">
						<p style="font-size:18px; font-weight:700; color:#7c3aed; margin:0 0 2px;">{selectedFood.protein}g</p>
						<p style="font-size:11px; color:#5b21b6; margin:0;">بروتين</p>
					</div>
					<div class="detail-macro-tile" style="background:#f0fdf4; border:1px solid #bbf7d0;">
						<p style="font-size:18px; font-weight:700; color:#16a34a; margin:0 0 2px;">{selectedFood.carbs}g</p>
						<p style="font-size:11px; color:#166534; margin:0;">كارب</p>
					</div>
					<div class="detail-macro-tile" style="background:#fffbeb; border:1px solid #fde68a;">
						<p style="font-size:18px; font-weight:700; color:#d97706; margin:0 0 2px;">{selectedFood.fat}g</p>
						<p style="font-size:11px; color:#92400e; margin:0;">دهون</p>
					</div>
				</div>

				<!-- Fiber -->
				{#if selectedFood.fiber > 0}
					<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#f9fafb; border-radius:8px; font-size:13px;">
						<span style="color:#4b5563;">الألياف</span>
						<span style="font-weight:600;">{selectedFood.fiber}g</span>
					</div>
				{/if}

				<!-- Micros -->
				{#if Object.keys(micros).filter(k => !k.startsWith('_')).length > 0}
					<div>
						<p style="font-size:12px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:.5px; margin:0 0 8px;">المغذيات الدقيقة</p>
						<div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
							{#each MICRO_FIELDS as field}
								{#if !(field.key === 'FIBTG' && selectedFood.fiber > 0)}
									{@const val = micros[field.key]}
									{#if val !== undefined && val !== 0}
										<div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:#f9fafb; border-radius:7px; font-size:12.5px;">
											<span style="color:#6b7280;">{field.label}</span>
											<span style="font-weight:600; color:#1a1d23;">{typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(1)) : val} {field.unit}</span>
										</div>
									{/if}
								{/if}
							{/each}
						</div>
					</div>
				{/if}

				<!-- Tags (نفس تجميع نموذج الإضافة) -->
				{#if selTags.cautions.length || selTags.dietLabels.length || selTags.healthLabels.length}
					<div class="section-card" style="padding:0; overflow:visible;">
						<div style="padding:10px 14px; border-bottom:1px solid #e8eaed; background:#f9fafb; border-radius:10px 10px 0 0;">
							<p style="font-size:13px; font-weight:600; color:#1a1d23; margin:0 0 2px;">التصنيفات والعلامات</p>
							<p style="font-size:11px; color:#8b909a; margin:0;">المحفوظ مع هذا الطعام.</p>
						</div>
						<div style="padding:14px; display:flex; flex-direction:column; gap:14px;">
							{#if selTags.cautions.length}
								<div>
									<p style="font-size:11.5px; font-weight:600; color:#92400e; margin:0 0 8px;">تحذيرات (مسببات حساسية)</p>
									<div style="display:flex; flex-wrap:wrap; gap:5px;">
										{#each selTags.cautions as c}
											<span style="padding:2px 9px; background:#fef3c7; color:#92400e; border-radius:20px; font-size:11.5px; border:1px solid #fde68a;">{tagLabelAr(c)}</span>
										{/each}
									</div>
								</div>
							{/if}
							{#if selTags.dietLabels.length}
								<div>
									<p style="font-size:11.5px; font-weight:600; color:#065f46; margin:0 0 8px;">التصنيف الغذائي</p>
									<div style="display:flex; flex-wrap:wrap; gap:5px;">
										{#each selTags.dietLabels as d}
											<span style="padding:2px 9px; background:#d1fae5; color:#065f46; border-radius:20px; font-size:11.5px; border:1px solid #6ee7b7;">{tagLabelAr(d)}</span>
										{/each}
									</div>
								</div>
							{/if}
							{#if selTags.healthLabels.length}
								<div>
									<p style="font-size:11.5px; font-weight:600; color:#0c4a6e; margin:0 0 8px;">خالٍ من / مناسب لـ</p>
									<div style="display:flex; flex-wrap:wrap; gap:5px;">
										{#each selTags.healthLabels as h}
											<span style="padding:2px 9px; background:#e0f2fe; color:#0c4a6e; border-radius:20px; font-size:11.5px; border:1px solid #7dd3fc;">{tagLabelAr(h)}</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="modal-footer" style="justify-content:flex-end;">
				<button onclick={() => (selectedFood = null)} style="padding:8px 18px; border:1px solid #e8eaed; border-radius:8px; background:#fff; font-size:13.5px; color:#4b5563; cursor:pointer; font-family:'Tajawal',sans-serif;">إغلاق</button>
			</div>
		</div>
	</div>
{/if}

<!-- Create Food Modal -->
{#if showCreateModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (showCreateModal = false)}>
		<div class="modal">
			<!-- Header -->
			<div class="modal-header">
				<div style="display:flex; align-items:flex-start; justify-content:space-between;">
					<div>
						<h2 style="font-size:17px; font-weight:700; color:#1a1d23; margin:0 0 3px;">إضافة طعام جديد</h2>
						<p style="font-size:12px; color:#8b909a; margin:0;">أضف عنصر غذائي مخصص لقاعدة البيانات</p>
					</div>
					<button type="button" aria-label="إغلاق" title="إغلاق" onclick={() => (showCreateModal = false)} style="background:none; border:none; cursor:pointer; color:#8b909a; padding:2px; margin-top:2px;">
						<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
					</button>
				</div>
			</div>

			<form
				method="POST"
				action="?/createFood"
				enctype="multipart/form-data"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'success') {
							showCreateModal = false;
							resetModal();
						}
						await update();
					};
				}}
			>
				<div class="modal-body">
					<!-- Image picker -->
					<div style="display:flex; align-items:center; gap:16px;">
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="img-picker" onclick={() => imageInputEl?.click()}>
							{#if imagePreview}
								<img src={imagePreview} alt="معاينة" />
								<button type="button" class="img-remove" onclick={(e) => { e.stopPropagation(); imagePreview = null; if (imageInputEl) imageInputEl.value = ''; }}>×</button>
							{:else}
								<svg width="24" height="24" fill="none" stroke="#d1d5db" stroke-width="1.5" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
								</svg>
							{/if}
						</div>
						<input bind:this={imageInputEl} type="file" name="image" accept="image/*" class="hidden" style="display:none;" onchange={handleImageChange} />
						<div>
							<p style="font-size:12px; font-weight:600; color:#059669; margin:0 0 2px;">صورة الطعام</p>
							<p style="font-size:11px; color:#9ca3af; margin:0 0 6px;">اختياري · PNG أو JPG · حتى 5 ميغابايت</p>
							<button type="button" onclick={() => imageInputEl?.click()} style="font-size:12px; color:#059669; background:none; border:none; cursor:pointer; padding:0; text-decoration:underline; text-underline-offset:2px; font-family:'Tajawal',sans-serif;">
								{imagePreview ? 'تغيير الصورة' : 'رفع صورة'}
							</button>
						</div>
					</div>

					<!-- Name + Source -->
					<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
						<div>
							<label class="field-label" for="m-name">الاسم <span class="required-star" aria-hidden="true">*</span></label>
							<input id="m-name" name="name" type="text" bind:value={fName} placeholder="اسم الطعام" required class="input" />
						</div>
						<div>
							<label class="field-label" for="m-name-ar">الاسم بالعربي</label>
							<input id="m-name-ar" name="nameAr" type="text" bind:value={fNameAr} placeholder="اختياري" class="input" />
						</div>
					</div>
					<!-- Quantity + Unit -->
					<fieldset style="border:none; padding:0; margin:0;">
						<legend class="field-label" style="padding:0;">الكمية</legend>
						<div style="display:flex; gap:8px; flex-direction:row-reverse;">
							<input id="m-create-qty" type="number" name="quantity" bind:value={fQuantity} min="0" step="any" class="input" style="width:110px; flex:none;" dir="rtl" />
							<select id="m-create-unit" name="unit" bind:value={fUnit} class="input" style="flex:1;" aria-label="وحدة القياس">
								{#each UNIT_OPTIONS as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
						<p style="font-size:11px; color:#9ca3af; margin:5px 0 0;">{nutrientFootnote}</p>
					</fieldset>

					<!-- Tags -->
					<div class="section-card" style="padding:0; overflow:visible;">
						<div style="padding:10px 14px; border-bottom:1px solid #e8eaed; background:#f9fafb; border-radius:10px 10px 0 0;">
							<p style="font-size:13px; font-weight:600; color:#1a1d23; margin:0 0 2px;">التصنيفات والعلامات</p>
							<p style="font-size:11px; color:#8b909a; margin:0;">اختر من القائمة للإضافة إلى الطعام.</p>
						</div>
						<div style="padding:14px; display:flex; flex-direction:column; gap:14px;">
							<!-- Cautions multi-select -->
							<div>
								<p style="font-size:11.5px; font-weight:600; color:#92400e; margin:0 0 6px;">تحذيرات (مسببات حساسية)</p>
								<div class="multi-select">
									<button type="button" class="multi-trigger {cautionOpen ? 'open' : ''}" onclick={() => { cautionOpen = !cautionOpen; dietOpen = false; healthOpen = false; }}>
										<span>{fCautions.length === 0 ? 'اختر مسببات الحساسية...' : `${fCautions.length} محدد`}</span>
										<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="transform:{cautionOpen ? 'rotate(180deg)' : 'none'}; transition:.2s; flex-shrink:0; color:#8b909a;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
									</button>
									{#if cautionOpen}
										<div class="multi-dropdown">
											{#each CAUTION_OPTIONS as opt}
												<label class="multi-option {fCautions.includes(opt.value) ? 'checked' : ''}">
													<input type="checkbox" checked={fCautions.includes(opt.value)} onchange={() => (fCautions = toggleTag(fCautions, opt.value))} />
													{opt.label}
												</label>
											{/each}
										</div>
									{/if}
								</div>
								{#if fCautions.length > 0}
									<div class="sel-tags">
										{#each CAUTION_OPTIONS.filter(o => fCautions.includes(o.value)) as opt}
											<span class="sel-tag">
												{opt.label}
												<button type="button" onclick={() => (fCautions = toggleTag(fCautions, opt.value))} aria-label="إزالة">
													<svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M18 6L6 18M6 6l12 12"/></svg>
												</button>
											</span>
										{/each}
									</div>
								{/if}
							</div>
							<!-- Diet multi-select -->
							<div>
								<p style="font-size:11.5px; font-weight:600; color:#065f46; margin:0 0 6px;">التصنيف الغذائي</p>
								<div class="multi-select">
									<button type="button" class="multi-trigger {dietOpen ? 'open' : ''}" onclick={() => { dietOpen = !dietOpen; cautionOpen = false; healthOpen = false; }}>
										<span>{fDietLabels.length === 0 ? 'اختر التصنيف الغذائي...' : `${fDietLabels.length} محدد`}</span>
										<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="transform:{dietOpen ? 'rotate(180deg)' : 'none'}; transition:.2s; flex-shrink:0; color:#8b909a;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
									</button>
									{#if dietOpen}
										<div class="multi-dropdown">
											{#each DIET_OPTIONS as opt}
												<label class="multi-option {fDietLabels.includes(opt.value) ? 'checked' : ''}">
													<input type="checkbox" checked={fDietLabels.includes(opt.value)} onchange={() => (fDietLabels = toggleTag(fDietLabels, opt.value))} />
													{opt.label}
												</label>
											{/each}
										</div>
									{/if}
								</div>
								{#if fDietLabels.length > 0}
									<div class="sel-tags">
										{#each DIET_OPTIONS.filter(o => fDietLabels.includes(o.value)) as opt}
											<span class="sel-tag">
												{opt.label}
												<button type="button" onclick={() => (fDietLabels = toggleTag(fDietLabels, opt.value))} aria-label="إزالة">
													<svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M18 6L6 18M6 6l12 12"/></svg>
												</button>
											</span>
										{/each}
									</div>
								{/if}
							</div>
							<!-- Health multi-select -->
							<div>
								<p style="font-size:11.5px; font-weight:600; color:#0c4a6e; margin:0 0 6px;">خالٍ من / مناسب لـ</p>
								<div class="multi-select">
									<button type="button" class="multi-trigger {healthOpen ? 'open' : ''}" onclick={() => { healthOpen = !healthOpen; cautionOpen = false; dietOpen = false; }}>
										<span>{fHealthLabels.length === 0 ? 'اختر ما ينطبق...' : `${fHealthLabels.length} محدد`}</span>
										<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="transform:{healthOpen ? 'rotate(180deg)' : 'none'}; transition:.2s; flex-shrink:0; color:#8b909a;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
									</button>
									{#if healthOpen}
										<div class="multi-dropdown">
											{#each HEALTH_OPTIONS as opt}
												<label class="multi-option {fHealthLabels.includes(opt.value) ? 'checked' : ''}">
													<input type="checkbox" checked={fHealthLabels.includes(opt.value)} onchange={() => (fHealthLabels = toggleTag(fHealthLabels, opt.value))} />
													{opt.label}
												</label>
											{/each}
										</div>
									{/if}
								</div>
								{#if fHealthLabels.length > 0}
									<div class="sel-tags">
										{#each HEALTH_OPTIONS.filter(o => fHealthLabels.includes(o.value)) as opt}
											<span class="sel-tag">
												{opt.label}
												<button type="button" onclick={() => (fHealthLabels = toggleTag(fHealthLabels, opt.value))} aria-label="إزالة">
													<svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M18 6L6 18M6 6l12 12"/></svg>
												</button>
											</span>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- Hidden tag inputs -->
					<input type="hidden" name="cautions" value={JSON.stringify(fCautions)} />
					<input type="hidden" name="dietLabels" value={JSON.stringify(fDietLabels)} />
					<input type="hidden" name="healthLabels" value={JSON.stringify(fHealthLabels)} />

					<!-- Nutrient heading -->
					<div style="border:1px solid #e8eaed; border-radius:8px; overflow:hidden;">
						<div style="background:#edf9f2; padding:9px 14px; text-align:center; border-bottom:2px solid #3cb96b;">
							<span style="font-size:13px; font-weight:600; color:#059669;">القيمة الغذائية لكل 100 {fUnit === 'ml' ? 'مل' : 'غ'}</span>
						</div>
					</div>

					<!-- Macros -->
					<div>
						<h3 style="font-size:13px; font-weight:600; color:#374151; margin:0 0 10px;">المغذيات الكبرى</h3>
						<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px;">
							<div>
								<label for="m-create-calories" style="display:block; font-size:11.5px; font-weight:500; color:#6b7280; margin-bottom:4px;">الطاقة</label>
								<div style="position:relative;">
									<input id="m-create-calories" type="number" name="calories" step="any" placeholder="0" class="nut-input" style="padding-left:36px;" />
									<span class="nut-unit">kcal</span>
								</div>
							</div>
							<div>
								<label for="m-create-fat" style="display:block; font-size:11.5px; font-weight:500; color:#6b7280; margin-bottom:4px;">الدهون</label>
								<div style="position:relative;">
									<input id="m-create-fat" type="number" name="fat" step="any" placeholder="0" class="nut-input" style="padding-left:24px;" />
									<span class="nut-unit">g</span>
								</div>
							</div>
							<div>
								<label for="m-create-carbs" style="display:block; font-size:11.5px; font-weight:500; color:#6b7280; margin-bottom:4px;">الكربوهيدرات</label>
								<div style="position:relative;">
									<input id="m-create-carbs" type="number" name="carbs" step="any" placeholder="0" class="nut-input" style="padding-left:24px;" />
									<span class="nut-unit">g</span>
								</div>
							</div>
							<div>
								<label for="m-create-protein" style="display:block; font-size:11.5px; font-weight:500; color:#6b7280; margin-bottom:4px;">البروتين</label>
								<div style="position:relative;">
									<input id="m-create-protein" type="number" name="protein" step="any" placeholder="0" class="nut-input" style="padding-left:24px;" />
									<span class="nut-unit">g</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Micronutrients -->
					<div>
						<h3 style="font-size:13px; font-weight:600; color:#374151; margin:0 0 10px;">المغذيات الدقيقة</h3>
						<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px;">
							{#each MICRO_FIELDS as field}
								<div>
									<label for="m-create-micro-{field.key}" style="display:block; font-size:11.5px; font-weight:500; color:#6b7280; margin-bottom:4px;">{field.label}</label>
									<div style="position:relative;">
										<input id="m-create-micro-{field.key}" type="number" name="micro_{field.key}" step="any" placeholder="0" class="nut-input" style="padding-left:32px;" />
										<span class="nut-unit">{field.unit}</span>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div class="modal-footer">
					<button type="button" onclick={() => (showCreateModal = false)} style="padding:9px 18px; border:1px solid #e8eaed; border-radius:8px; background:#fff; font-size:13.5px; color:#4b5563; cursor:pointer; font-family:'Tajawal',sans-serif;">إلغاء</button>
					<button type="submit" class="btn-primary" disabled={!fName.trim()} style="opacity:{fName.trim() ? 1 : 0.5}; cursor:{fName.trim() ? 'pointer' : 'not-allowed'};">حفظ وإغلاق</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Edit Food Modal -->
{#if showEditModal && editingFoodId}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" role="presentation" onclick={(e) => e.target === e.currentTarget && (showEditModal = false)}>
		<div class="modal">
			<div class="modal-header">
				<div style="display:flex; align-items:flex-start; justify-content:space-between;">
					<div>
						<h2 style="font-size:17px; font-weight:700; color:#1a1d23; margin:0 0 3px;">تعديل الطعام</h2>
						<p style="font-size:12px; color:#8b909a; margin:0;">حدّث البيانات بسرعة ثم احفظ التعديلات</p>
					</div>
					<button type="button" aria-label="إغلاق" title="إغلاق" onclick={() => (showEditModal = false)} style="background:none; border:none; cursor:pointer; color:#8b909a; padding:2px; margin-top:2px;">
						<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
					</button>
				</div>
			</div>
			<form method="POST" action="?/editFood" enctype="multipart/form-data" use:enhance={() => {
				return async ({ update, result }) => {
					await update();
					if (result.type === 'success') showEditModal = false;
				};
			}}>
				<input type="hidden" name="foodId" value={editingFoodId} />
				<input type="hidden" name="cautions" value={JSON.stringify(eCautions)} />
				<input type="hidden" name="dietLabels" value={JSON.stringify(eDietLabels)} />
				<input type="hidden" name="healthLabels" value={JSON.stringify(eHealthLabels)} />

				<div class="modal-body">
					<!-- Image picker -->
					<div style="display:flex; align-items:center; gap:16px;">
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="img-picker" onclick={() => editImageInputEl?.click()}>
							{#if editImagePreview}
								<img src={editImagePreview} alt="معاينة" />
							{:else if editCurrentImage}
								<img src={editCurrentImage} alt="الصورة الحالية" />
							{:else}
								<svg width="24" height="24" fill="none" stroke="#d1d5db" stroke-width="1.5" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
								</svg>
							{/if}
						</div>
						<input bind:this={editImageInputEl} type="file" name="image" accept="image/*" class="hidden" style="display:none;" onchange={handleEditImageChange} />
						<div>
							<p style="font-size:12px; font-weight:600; color:#059669; margin:0 0 2px;">صورة الطعام</p>
							<p style="font-size:11px; color:#9ca3af; margin:0 0 6px;">اختياري · PNG أو JPG · حتى 5 ميغابايت</p>
							<button type="button" onclick={() => editImageInputEl?.click()} style="font-size:12px; color:#059669; background:none; border:none; cursor:pointer; padding:0; text-decoration:underline; text-underline-offset:2px; font-family:'Tajawal',sans-serif;">
								{editImagePreview ? 'تغيير الصورة' : 'رفع صورة'}
							</button>
						</div>
					</div>

					<!-- Name + Source -->
					<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
						<div>
							<label class="field-label" for="e-name-en">الاسم (English) <span class="required-star" aria-hidden="true">*</span></label>
							<input id="e-name-en" name="name" type="text" bind:value={eName} placeholder="اسم الطعام" required class="input" />
						</div>
						<div>
							<label class="field-label" for="e-name-ar">الاسم بالعربي</label>
							<input id="e-name-ar" name="nameAr" type="text" bind:value={eNameAr} placeholder="اختياري" class="input" />
						</div>
					</div>
					<!-- Quantity + Unit -->
					<fieldset style="border:none; padding:0; margin:0;">
						<legend class="field-label" style="padding:0;">الكمية</legend>
						<div style="display:flex; gap:8px; flex-direction:row-reverse;">
							<input id="e-edit-qty" type="number" name="quantity" bind:value={eQuantity} min="0" step="any" class="input" style="width:110px; flex:none;" dir="rtl" />
							<select id="e-edit-unit" name="unit" bind:value={eUnit} class="input" style="flex:1;" aria-label="وحدة القياس">
								{#each UNIT_OPTIONS as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
						<p style="font-size:11px; color:#9ca3af; margin:5px 0 0;">{editNutrientFootnote}</p>
					</fieldset>

					<!-- Tags -->
					<div class="section-card" style="padding:0; overflow:visible;">
						<div style="padding:10px 14px; border-bottom:1px solid #e8eaed; background:#f9fafb; border-radius:10px 10px 0 0;">
							<p style="font-size:13px; font-weight:600; color:#1a1d23; margin:0 0 2px;">التصنيفات والعلامات</p>
							<p style="font-size:11px; color:#8b909a; margin:0;">اختر من القائمة لتعديل تصنيفات الطعام.</p>
						</div>
						<div style="padding:14px; display:flex; flex-direction:column; gap:14px;">
							<div>
								<p style="font-size:11.5px; font-weight:600; color:#92400e; margin:0 0 6px;">تحذيرات (مسببات حساسية)</p>
								<div class="multi-select">
									<button type="button" class="multi-trigger {editCautionOpen ? 'open' : ''}" onclick={() => { editCautionOpen = !editCautionOpen; editDietOpen = false; editHealthOpen = false; }}>
										<span>{eCautions.length === 0 ? 'اختر مسببات الحساسية...' : `${eCautions.length} محدد`}</span>
										<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="transform:{editCautionOpen ? 'rotate(180deg)' : 'none'}; transition:.2s; flex-shrink:0; color:#8b909a;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
									</button>
									{#if editCautionOpen}
										<div class="multi-dropdown">
											{#each CAUTION_OPTIONS as opt}
												<label class="multi-option {eCautions.includes(opt.value) ? 'checked' : ''}">
													<input type="checkbox" checked={eCautions.includes(opt.value)} onchange={() => (eCautions = toggleTag(eCautions, opt.value))} />
													{opt.label}
												</label>
											{/each}
										</div>
									{/if}
								</div>
							</div>
							<div>
								<p style="font-size:11.5px; font-weight:600; color:#065f46; margin:0 0 6px;">التصنيف الغذائي</p>
								<div class="multi-select">
									<button type="button" class="multi-trigger {editDietOpen ? 'open' : ''}" onclick={() => { editDietOpen = !editDietOpen; editCautionOpen = false; editHealthOpen = false; }}>
										<span>{eDietLabels.length === 0 ? 'اختر التصنيف الغذائي...' : `${eDietLabels.length} محدد`}</span>
										<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="transform:{editDietOpen ? 'rotate(180deg)' : 'none'}; transition:.2s; flex-shrink:0; color:#8b909a;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
									</button>
									{#if editDietOpen}
										<div class="multi-dropdown">
											{#each DIET_OPTIONS as opt}
												<label class="multi-option {eDietLabels.includes(opt.value) ? 'checked' : ''}">
													<input type="checkbox" checked={eDietLabels.includes(opt.value)} onchange={() => (eDietLabels = toggleTag(eDietLabels, opt.value))} />
													{opt.label}
												</label>
											{/each}
										</div>
									{/if}
								</div>
							</div>
							<div>
								<p style="font-size:11.5px; font-weight:600; color:#0c4a6e; margin:0 0 6px;">خالٍ من / مناسب لـ</p>
								<div class="multi-select">
									<button type="button" class="multi-trigger {editHealthOpen ? 'open' : ''}" onclick={() => { editHealthOpen = !editHealthOpen; editCautionOpen = false; editDietOpen = false; }}>
										<span>{eHealthLabels.length === 0 ? 'اختر ما ينطبق...' : `${eHealthLabels.length} محدد`}</span>
										<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="transform:{editHealthOpen ? 'rotate(180deg)' : 'none'}; transition:.2s; flex-shrink:0; color:#8b909a;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
									</button>
									{#if editHealthOpen}
										<div class="multi-dropdown">
											{#each HEALTH_OPTIONS as opt}
												<label class="multi-option {eHealthLabels.includes(opt.value) ? 'checked' : ''}">
													<input type="checkbox" checked={eHealthLabels.includes(opt.value)} onchange={() => (eHealthLabels = toggleTag(eHealthLabels, opt.value))} />
													{opt.label}
												</label>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>

					<!-- Nutrient heading -->
					<div style="border:1px solid #e8eaed; border-radius:8px; overflow:hidden;">
						<div style="background:#edf9f2; padding:9px 14px; text-align:center; border-bottom:2px solid #3cb96b;">
							<span style="font-size:13px; font-weight:600; color:#059669;">القيمة الغذائية لكل 100 {eUnit === 'ml' ? 'مل' : 'غ'}</span>
						</div>
					</div>

					<!-- Macros -->
					<div>
						<h3 style="font-size:13px; font-weight:600; color:#374151; margin:0 0 10px;">المغذيات الكبرى</h3>
						<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px;">
							<div>
								<label for="e-edit-calories" style="display:block; font-size:11.5px; font-weight:500; color:#6b7280; margin-bottom:4px;">الطاقة</label>
								<div style="position:relative;">
									<input id="e-edit-calories" type="number" name="calories" bind:value={eCalories} step="any" placeholder="0" class="nut-input" style="padding-left:36px;" />
									<span class="nut-unit">kcal</span>
								</div>
							</div>
							<div>
								<label for="e-edit-fat" style="display:block; font-size:11.5px; font-weight:500; color:#6b7280; margin-bottom:4px;">الدهون</label>
								<div style="position:relative;">
									<input id="e-edit-fat" type="number" name="fat" bind:value={eFat} step="any" placeholder="0" class="nut-input" style="padding-left:24px;" />
									<span class="nut-unit">g</span>
								</div>
							</div>
							<div>
								<label for="e-edit-carbs" style="display:block; font-size:11.5px; font-weight:500; color:#6b7280; margin-bottom:4px;">الكربوهيدرات</label>
								<div style="position:relative;">
									<input id="e-edit-carbs" type="number" name="carbs" bind:value={eCarbs} step="any" placeholder="0" class="nut-input" style="padding-left:24px;" />
									<span class="nut-unit">g</span>
								</div>
							</div>
							<div>
								<label for="e-edit-protein" style="display:block; font-size:11.5px; font-weight:500; color:#6b7280; margin-bottom:4px;">البروتين</label>
								<div style="position:relative;">
									<input id="e-edit-protein" type="number" name="protein" bind:value={eProtein} step="any" placeholder="0" class="nut-input" style="padding-left:24px;" />
									<span class="nut-unit">g</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Micronutrients -->
					<div>
						<h3 style="font-size:13px; font-weight:600; color:#374151; margin:0 0 10px;">المغذيات الدقيقة</h3>
						<details class="micro-accordion">
							<summary>فتح/إخفاء قائمة المغذيات الدقيقة</summary>
							<div class="micro-grid">
								{#each MICRO_FIELDS as field}
									<div>
										<label for="e-edit-micro-{field.key}" style="display:block; font-size:11.5px; font-weight:500; color:#6b7280; margin-bottom:4px;">{field.label}</label>
										<div style="position:relative;">
											<input id="e-edit-micro-{field.key}" type="number" name="micro_{field.key}" bind:value={eMicros[field.key]} step="any" placeholder="0" class="nut-input" style="padding-left:32px;" />
											<span class="nut-unit">{field.unit}</span>
										</div>
									</div>
								{/each}
							</div>
						</details>
					</div>
				</div>

				<div class="modal-footer">
					<div class="modal-footer-actions">
						<button type="submit" class="btn-primary" disabled={!eName.trim()} style="opacity:{eName.trim() ? 1 : 0.5}; cursor:{eName.trim() ? 'pointer' : 'not-allowed'};">حفظ التعديلات</button>
						<button type="button" class="btn-secondary" onclick={() => (showEditModal = false)}>إلغاء</button>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}
