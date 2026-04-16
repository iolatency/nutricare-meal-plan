/**
 * Static exclusion catalog for AI meal-plan builder (Arabic UI, stable keys).
 * Replaces DB search; selections flow to AI via `excludedFoods` string array.
 */

export type ExclusionCatalogItem = { key: string; labelAr: string };

export type ExclusionCatalogGroup = { groupAr: string; items: ExclusionCatalogItem[] };

function group(groupAr: string, rows: readonly (readonly [string, string])[]): ExclusionCatalogGroup {
	return { groupAr, items: rows.map(([key, labelAr]) => ({ key, labelAr })) };
}

/** Stable negative id for chip remove/dedup (matches prior hash style). */
export function stableNegativeFoodId(key: string): number {
	const sig = key.trim().toLowerCase();
	const h = Array.from(sig).reduce(
		(acc, ch) => ((acc * 31 + ch.charCodeAt(0)) >>> 0) % 2147483647,
		7
	);
	return -Math.max(1, h);
}

export const EXCLUSION_GROUPS: ExclusionCatalogGroup[] = [
	group('الماء', [['water', 'ماء']]),
	group('القهوة', [
		['coffee', 'قهوة'],
		['coffee-decaf', 'قهوة منزوعة الكافيين']
	]),
	group('الشاي', [
		['tea', 'شاي'],
		['tea-decaf', 'شاي منزوع الكافيين'],
		['tea-green', 'شاي أخضر'],
		['tea-hibiscus', 'شاي كركديه'],
		['tea-chai', 'شاي تشاي']
	]),
	group('فواكه شائعة', [
		['fruit-apple-fresh', 'تفاح طازج'],
		['fruit-banana-fresh', 'موز طازج'],
		['fruit-pear-fresh', 'كمثرى طازجة'],
		['fruit-grapes-fresh', 'عنب طازج'],
		['fruit-canned-mixed', 'فواكه معلبة']
	]),
	group('الحمضيات', [
		['citrus-orange-fresh', 'برتقال طازج'],
		['citrus-tangerine-fresh', 'يوسفي طازج'],
		['citrus-grapefruit-fresh', 'جريب فروت طازج'],
		['citrus-lemon-fresh', 'ليمون طازج'],
		['citrus-lime-fresh', 'ليمون أخضر (لايم) طازج']
	]),
	group('فواكه ذات نوى', [
		['stone-cherry-fresh', 'كرز طازج'],
		['stone-plum-fresh', 'برقوق طازج'],
		['stone-peach-fresh', 'خوخ طازج'],
		['stone-apricot-fresh', 'مشمش طازج'],
		['stone-nectarine-fresh', 'نكتارين طازج']
	]),
	group('فواكه استوائية', [['exotic-mango-fresh', 'مانجو طازجة']]),
	group('التوت', [
		['berry-strawberry-fresh', 'فراولة طازجة'],
		['berry-blueberry-fresh', 'توت أزرق طازج'],
		['berry-raspberry-fresh', 'توت العليق طازج'],
		['berry-blackberry-fresh', 'توت أسود طازج'],
		['berry-generic', 'توت (عام)']
	]),
	group('البطيخ والشمام', [
		['melon-watermelon-fresh', 'بطيخ طازج'],
		['melon-cantaloupe-fresh', 'شمام (كنتالوب) طازج'],
		['melon-honeydew-fresh', 'شمام أخضر (هانيديو) طازج']
	]),
	group('فواكه مجففة', [
		['dried-raisins', 'زبيب'],
		['dried-apricot', 'مشمش مجفف'],
		['dried-banana-chips', 'رقائق موز'],
		['dried-apple', 'تفاح مجفف'],
		['dried-cranberries', 'توت بري مجفف']
	]),
	group('العصائر', [['juice-lemon', 'عصير ليمون']]),
	group('المكسرات', [
		['nut-almonds', 'لوز'],
		['nut-cashew', 'كاجو'],
		['nut-pistachio', 'فستق'],
		['nut-walnuts', 'جوز'],
		['nut-pecan', 'جوز بقان'],
		['nut-brazil', 'جوز برازيلي'],
		['nut-peanuts', 'فول سوداني'],
		['nut-macadamia', 'مكاديميا'],
		['nut-hazelnuts', 'بندق'],
		['nut-almond-butter', 'زبدة لوز'],
		['nut-peanut-butter', 'زبدة فول سوداني'],
		['nut-cashew-butter', 'زبدة كاجو'],
		['nut-pine-nuts', 'صنوبر'],
		['nut-trail-mix', 'خليط مكسرات ومكسرات جافة']
	]),
	group('البذور', [
		['seed-flax', 'بذر كتان'],
		['seed-sunflower', 'بذور دوار الشمس'],
		['seed-pumpkin', 'بذور اليقطين'],
		['seed-sesame', 'بذور سمسم'],
		['seed-chia', 'بذور شيا'],
		['seed-hemp', 'بذور قنب'],
		['seed-tahini', 'طحينة'],
		['seed-sunflower-butter', 'زبدة دوار الشمس']
	]),
	group('الفاصوليا والبقول', [
		['bean-black-fresh', 'فاصوليا سوداء طازجة'],
		['bean-black-canned', 'فاصوليا سوداء معلبة'],
		['bean-edamame', 'إيدامامي'],
		['bean-navy-fresh', 'فاصوليا بيضاء طازجة'],
		['bean-navy-canned', 'فاصوليا بيضاء معلبة'],
		['bean-pinto-fresh', 'فاصوليا بينتو طازجة'],
		['bean-pinto-canned', 'فاصوليا بينتو معلبة'],
		['bean-kidney-fresh', 'فاصوليا حمراء طازجة'],
		['bean-kidney-canned', 'فاصوليا حمراء معلبة'],
		['bean-chickpea-fresh', 'حمص طازج'],
		['bean-chickpea-canned', 'حمص معلب'],
		['bean-mung-fresh', 'ماش طازج'],
		['bean-mung-canned', 'ماش معلب'],
		['bean-adzuki-fresh', 'أدزوكي طازج'],
		['bean-adzuki-canned', 'أدزوكي معلب'],
		['bean-black-eyed-fresh', 'لوبيا طازجة'],
		['bean-black-eyed-canned', 'لوبيا معلبة'],
		['bean-green-peas-fresh', 'بازلاء خضراء طازجة'],
		['bean-green-peas-canned', 'بازلاء خضراء معلبة'],
		['bean-green-snap', 'فاصوليا خضراء'],
		['bean-chickpea-flour-besan', 'دقيق حمص (بيسان)'],
		['bean-chickpea-pasta', 'معكرونة حمص']
	]),
	group('العدس', [
		['lentil-brown-fresh', 'عدس بني طازج'],
		['lentil-brown-canned', 'عدس بني معلب'],
		['lentil-red-fresh', 'عدس أحمر طازج'],
		['lentil-green-fresh', 'عدس أخضر طازج'],
		['lentil-green-canned', 'عدس أخضر معلب'],
		['lentil-yellow-split-fresh', 'عدس أصفر مجروش طازج']
	]),
	group('الزبادي', [['yogurt-low-fat', 'زبادي قليل الدسم']]),
	group('السمك', [
		['fish-tuna', 'تونا طازجة أو معلبة'],
		['fish-salmon', 'سلمون طازج'],
		['fish-cod', 'سمك القد'],
		['fish-haddock', 'هادوك'],
		['fish-pollock', 'سمك بولوك'],
		['fish-whiting', 'سمك ويتينغ'],
		['fish-plaice', 'سمك بليس'],
		['fish-white-generic', 'سمك أبيض (عام)'],
		['fish-trout', 'سلمون مرقط (تروت)'],
		['fish-bass', 'قاروص'],
		['fish-sardines', 'سردين طازج أو معلب'],
		['fish-mackerel', 'سمك ماكريل طازج']
	]),
	group('المحار والصدفيات', [
		['shellfish-prawn', 'جمبري'],
		['shellfish-clams', 'محار'],
		['shellfish-mussels', 'بلح البحر'],
		['shellfish-squid', 'حبار (كلاماري)'],
		['shellfish-mix', 'مزيج مأكولات بحرية']
	]),
	group('بدائل اللحوم', [
		['alt-tofu', 'توفو'],
		['alt-tempeh', 'تمبيه'],
		['alt-seitan', 'سيتان'],
		['alt-soy-protein-isolate', 'بروتين فول الصويا المعزول'],
		['alt-nutritional-yeast', 'خميرة غذائية'],
		['alt-protein-powder-non-whey', 'مسحوق بروتين (غير شرش اللبن)']
	]),
	group('الحليب النباتي', [
		['milk-almond', 'حليب لوز'],
		['milk-oat', 'حليب شوفان'],
		['milk-soy', 'حليب صويا'],
		['milk-rice', 'حليب أرز'],
		['milk-plant-non-soy', 'حليب نباتي (غير صويا)']
	]),
	group('البهارات', [
		['spice-cardamom', 'هيل'],
		['spice-chili-powder', 'مسحوق فلفل حار'],
		['spice-cinnamon', 'قرفة'],
		['spice-cloves', 'قرنفل'],
		['spice-coriander-seeds', 'بذور كزبرة'],
		['spice-cumin', 'كمون'],
		['spice-curry-powder', 'مسحوق كاري'],
		['spice-fennel-seeds', 'بذور شمر'],
		['spice-ginger', 'زنجبيل'],
		['spice-nutmeg', 'جوزة الطيب'],
		['spice-paprika', 'بابريكا'],
		['spice-black-pepper', 'فلفل أسود'],
		['spice-salt', 'ملح'],
		['spice-cayenne', 'فلفل حار (كايين)'],
		['spice-turmeric', 'كركم'],
		['spice-mustard-seeds', 'بذور خردل'],
		['spice-garam-masala', 'كرم مسالا'],
		['spice-capers', 'كبر'],
		['spice-saffron', 'زعفران'],
		['spice-mint', 'نعناع'],
		['spice-allspice', 'بهارات حلوة']
	]),
	group('الحلويات', [
		['sweet-dark-chocolate-70', 'شوكولاتة داكنة 70٪'],
		['sweet-cocoa-100', 'كاكاو 100٪'],
		['sweet-agar-agar', 'أغار أغار']
	]),
	group('الصلصات', [
		['sauce-harissa', 'هريسة'],
		['sauce-salsa', 'صلصة سالسا'],
		['sauce-marinara', 'صلصة مارينارا'],
		['sauce-ginger-garlic-paste', 'معجون زنجبيل وثوم'],
		['sauce-tzatziki', 'تزاتزيكي']
	]),
	group('الخل', [
		['vinegar-white', 'خل أبيض'],
		['vinegar-apple-cider', 'خل تفاح'],
		['vinegar-balsamic', 'خل بلسمي'],
		['vinegar-red-wine', 'خل نبيذ أحمر'],
		['vinegar-rice', 'خل أرز'],
		['vinegar-vinaigrette', 'صلصة فينيغريت']
	]),
	group('المنكهات', [
		['cond-hummus', 'حمص'],
		['cond-coconut-aminos', 'أمينوس جوز الهند'],
		['cond-ketchup', 'كاتشب']
	]),
	group('المخمرات', [
		['leaven-baking-powder', 'بيكنج باودر'],
		['leaven-yeast', 'خميرة'],
		['leaven-baking-soda', 'بيكربونات صوديوم']
	]),
	group('المرق', [
		['broth-beef', 'مرق لحم بقر'],
		['broth-chicken', 'مرق دجاج'],
		['broth-vegetable', 'مرق خضار'],
		['broth-vegetable-low-sodium', 'مرق خضار قليل الصوديوم']
	]),
	group('التوابل والنكهات', [
		['season-vanilla', 'مستخلص فانيليا'],
		['season-salt-pepper', 'ملح وفلفل'],
		['season-italian', 'بهارات إيطالية'],
		['season-lemon-pepper', 'بهارات ليمون وفلفل']
	]),
	group('الزيوت', [
		['oil-olive', 'زيت زيتون'],
		['oil-avocado', 'زيت أفوكادو']
	]),
	group('خضروات شائعة', [
		['veg-avocado', 'أفوكادو'],
		['veg-tomato-fresh', 'طماطم طازجة'],
		['veg-tomato-canned', 'طماطم معلبة'],
		['veg-artichoke-fresh', 'أرضي شوكي طازج'],
		['veg-artichoke-canned', 'أرضي شوكي معلب'],
		['veg-corn-fresh', 'ذرة طازجة'],
		['veg-corn-canned', 'ذرة معلبة'],
		['veg-asparagus-fresh', 'هليون طازج'],
		['veg-olives-green', 'زيتون أخضر'],
		['veg-olives-black', 'زيتون أسود'],
		['veg-celery', 'كرفس'],
		['veg-soybean-sprouts', 'براعم فول الصويا'],
		['veg-frozen-mixed', 'خضار مجمدة مشكلة'],
		['veg-tomato-sundried', 'طماطم مجففة بالشمس']
	]),
	group('الفطر', [
		['mush-generic-fresh', 'فطر طازج (عام)'],
		['mush-oyster', 'فطر محار'],
		['mush-shiitake', 'شيتاكي'],
		['mush-portobello', 'بورتوبيللو'],
		['mush-button', 'فطر أبيض (زر)']
	]),
	group('الخضروات الجذرية', [
		['root-carrot', 'جزر'],
		['root-radish', 'فجل'],
		['root-beet', 'شمندر']
	]),
	group('الخضروات الصليبية', [
		['cruc-broccoli', 'بروكلي'],
		['cruc-cauliflower', 'قرنبيط'],
		['cruc-cabbage', 'ملفوف'],
		['cruc-red-cabbage', 'ملفوف أحمر'],
		['cruc-brussels', 'كرنب بروكسيل'],
		['cruc-bok-choy', 'بوك تشوي'],
		['cruc-bamboo', 'براعم خيزران'],
		['cruc-collard', 'كرنب أخضر (كولارد)']
	]),
	group('الخضروات الورقية', [
		['leaf-spinach', 'سبانخ'],
		['leaf-kale', 'كيل'],
		['leaf-nori', 'أعشاب بحرية (نوري)'],
		['leaf-chard', 'سلق']
	]),
	group('خضار السلطة', [
		['salad-lettuce', 'خس'],
		['salad-watercress', 'جرجير مائي'],
		['salad-arugula', 'جرجير (روكا)'],
		['salad-cucumber', 'خيار'],
		['salad-romaine', 'خس روماني'],
		['salad-mixed-greens', 'خضار ورقية مشكلة']
	]),
	group('الأعشاب الطازجة', [
		['herb-basil', 'ريحان'],
		['herb-coriander', 'كزبرة ورقية'],
		['herb-parsley', 'بقدونس'],
		['herb-sage', 'ميرمية'],
		['herb-rosemary', 'إكليل الجبل'],
		['herb-tarragon', 'طرخون'],
		['herb-bay', 'ورق غار'],
		['herb-dill', 'شبت'],
		['herb-fenugreek', 'حلبة ورقية'],
		['herb-thyme', 'زعتر بري'],
		['herb-oregano', 'أوريجانو'],
		['herb-generic', 'أعشاب (عام)']
	]),
	group('الكوسة والقرع', [
		['squash-zucchini', 'كوسة'],
		['squash-pumpkin', 'يقطين'],
		['squash-eggplant', 'باذنجان'],
		['squash-butternut', 'قرع عسلي'],
		['squash-yellow-summer', 'كوسة صفراء صيفية']
	]),
	group('الثوميات', [
		['allium-onion', 'بصل'],
		['allium-leek', 'كراث'],
		['allium-spring-onion', 'بصل أخضر'],
		['allium-chives', 'ثوم معمر'],
		['allium-shallot', 'إشلوت'],
		['allium-garlic', 'ثوم']
	]),
	group('الفلفل', [
		['pepper-green', 'فلفل أخضر'],
		['pepper-yellow-red', 'فلفل أصفر/أحمر'],
		['pepper-chili', 'فلفل حار'],
		['pepper-jalapeno', 'هالابينيو']
	]),
	group('الحبوب الكاملة', [
		['grain-brown-rice', 'أرز بني'],
		['grain-quinoa', 'كينوا'],
		['grain-bulgur', 'برغل'],
		['grain-couscous', 'كسكس'],
		['grain-pita-whole', 'خبز بيتا قمح كامل'],
		['grain-rice-noodles', 'نودلز أرز'],
		['grain-semolina', 'سميد'],
		['grain-corn-starch', 'نشا ذرة'],
		['grain-corn-flour', 'دقيق ذرة'],
		['grain-rice-flour-brown', 'دقيق أرز بني'],
		['grain-wild-rice', 'أرز بري'],
		['grain-millet', 'دخن'],
		['grain-farro', 'فارو'],
		['grain-cornmeal', 'دقيق ذرة خشن']
	]),
	group('الحبوب (إفطار)', [
		['cereal-oats', 'شوفان'],
		['cereal-barley', 'شعير'],
		['cereal-corn-tortillas', 'تورتيلا ذرة'],
		['cereal-alfalfa-sprouts', 'براعم برسيم حجازي'],
		['cereal-granola', 'جرانولا']
	]),
	group('الخبز', [
		['bread-wheat-whole', 'خبز قمح كامل'],
		['bread-wrap-whole', 'خبز لفافة قمح كامل'],
		['bread-rye-whole', 'خبز جاودار كامل'],
		['bread-flour-wheat-whole', 'دقيق قمح كامل'],
		['bread-sourdough-whole', 'خبز مخمر قمح كامل'],
		['bread-flour-gluten-free', 'دقيق خالي من الغلوتين'],
		['bread-crackers-whole', 'بسكويت قمح كامل']
	]),
	group('المعكرونة', [['pasta-wheat-whole', 'معكرونة قمح كامل']]),
	group('البطاطس والدرنات', [
		['potato-white', 'بطاطس'],
		['potato-sweet', 'بطاطا حلوة'],
		['potato-yam', 'يام']
	]),
	group('الدواجن', [
		['poultry-turkey-breast', 'صدر ديك رومي'],
		['poultry-chicken-breast', 'صدر دجاج']
	]),
	group('لحم البقر', [
		['beef-lean', 'لحم بقر قليل الدهن'],
		['beef-gelatin', 'جيلاتين']
	]),
	group('لحم الخنزير', [['pork-lean', 'لحم خنزير قليل الدهن']])
];

const _byKey = new Map<string, ExclusionCatalogItem>();
for (const g of EXCLUSION_GROUPS) {
	for (const it of g.items) {
		if (_byKey.has(it.key)) {
			throw new Error(`Duplicate exclusion catalog key: ${it.key}`);
		}
		_byKey.set(it.key, it);
	}
}

export function getExclusionCatalogItem(key: string): ExclusionCatalogItem | undefined {
	return _byKey.get(key);
}

/** Filter groups/items for custom dropdown search (Arabic label, group title, or English key). */
export function filterExclusionCatalog(query: string): ExclusionCatalogGroup[] {
	const t = query.trim();
	if (!t) return EXCLUSION_GROUPS;
	const lower = t.toLowerCase();
	return EXCLUSION_GROUPS.map((g) => ({
		groupAr: g.groupAr,
		items: g.items.filter(
			(it) =>
				it.labelAr.includes(t) ||
				g.groupAr.includes(t) ||
				it.key.toLowerCase().includes(lower)
		)
	})).filter((g) => g.items.length > 0);
}
