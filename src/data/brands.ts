// توحيد أسماء ماركات السيارات: أي كتابة (عربي/إنجليزي/إملاء مختلف) تتحول لاسم واحد ثابت،
// حتى تظهر القطع تحت زر الماركة الصحيح (مثلاً MG و ام جي و إم جي → «إم جي»).

export const DEFAULT_CAR_BRANDS: string[] = [
  'تويوتا', 'هيونداي', 'نيسان', 'كيا', 'فورد', 'مرسيدس', 'شيري', 'إم جي', 'بي إم دبليو', 'شيفروليه',
];

// تطبيع النص: حروف صغيرة، حذف التشكيل والمسافات والرموز، وتوحيد (أإآ→ا، ى→ي، ة→ه، ئ→ي، ؤ→و)
export const normKey = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[\s\-_.()\[\]\/\\,،:؛]/g, '');

// الاسم الثابت ← الكتابات الممكنة
const ALIASES: Record<string, string[]> = {
  'تويوتا': ['toyota', 'تويوتا', 'تيوتا'],
  'هيونداي': ['hyundai', 'hyundia', 'هيونداي', 'هيوندا', 'هونداي', 'هيوندي', 'هيونداى', 'هيونداءي'],
  'نيسان': ['nissan', 'نيسان', 'نيسّان', 'datsun', 'داتسون'],
  'كيا': ['kia', 'كيا', 'كيى'],
  'فورد': ['ford', 'فورد'],
  'مرسيدس': ['mercedes', 'mercedesbenz', 'benz', 'merc', 'مرسيدس', 'ميرسيدس', 'مرسيدسبنز', 'مرسيديس'],
  'شيري': ['chery', 'cherry', 'شيري', 'شيرى', 'تشيري', 'شيريي', 'شيرٍي'],
  'إم جي': ['mg', 'mgmotor', 'emjay', 'امجي', 'ام جي', 'إم جي', 'ام جى', 'ام-جي', 'امجى'],
  'بي إم دبليو': ['bmw', 'بيامدبليو', 'بىامدبليو', 'بي ام دبليو', 'بي إم دبليو', 'بيإمدبليو', 'بي ام دابليو'],
  'شيفروليه': ['chevrolet', 'chevy', 'chevrolt', 'شيفروليه', 'شيفرولية', 'شيفرولت', 'شيفروليت', 'شفروليه', 'شيفورلية', 'شيفورليه', 'شيفرلية', 'شيفرليه', 'شفرولية', 'شيفورليت', 'شيفيورلية'],
  'ميتسوبيشي': ['mitsubishi', 'ميتسوبيشي', 'ميتسبيشي', 'متسوبيشي'],
  'سوزوكي': ['suzuki', 'سوزوكي', 'سوزوكى'],
  'رينو': ['renault', 'رينو', 'رينولت'],
  'بيجو': ['peugeot', 'بيجو', 'بيجوت'],
  'أوبل': ['opel', 'اوبل', 'أوبل'],
  'سكودا': ['skoda', 'سكودا', 'اسكودا'],
  'هوندا': ['honda', 'هوندا'],
  'مازدا': ['mazda', 'مازدا'],
  'جيلي': ['geely', 'جيلي', 'جيلى'],
  'سيتروين': ['citroen', 'سيتروين', 'ستروين'],
  'فيات': ['fiat', 'فيات'],
  'بي واي دي': ['byd', 'بيوايدي', 'بي واي دي'],
  'جيتور': ['jetour', 'جيتور'],
  'هافال': ['haval', 'هافال'],
  'فولكس فاجن': ['volkswagen', 'vw', 'فولكسفاجن', 'فولكسفاجن', 'فولكس'],
  'لادا': ['lada', 'لادا'],
  'دايو': ['daewoo', 'دايو', 'دايوو'],
  'سيات': ['seat', 'سيات'],
  'جيب': ['jeep', 'جيب'],
  'ايسوزو': ['isuzu', 'ايسوزو', 'إيسوزو'],
  'سوبارو': ['subaru', 'سوبارو'],
  'لكزس': ['lexus', 'لكزس', 'لكسس'],
  'دودج': ['dodge', 'دودج'],
};

const LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  Object.entries(ALIASES).forEach(([canon, list]) => {
    m.set(normKey(canon), canon);
    list.forEach((a) => m.set(normKey(a), canon));
  });
  return m;
})();

export const GENERAL_BRAND = 'شامل';

// يرجع الاسم الثابت للماركة. غير المعروف يبقى كما كُتب (بعد حذف المسافات الزائدة).
export const normalizeBrand = (raw: unknown): string => {
  const text = String(raw ?? '').trim();
  if (!text) return text;
  const key = normKey(text);
  if (key === normKey(GENERAL_BRAND) || key === 'all' || key === 'general' || key === 'universal') return GENERAL_BRAND;
  const exact = LOOKUP.get(key);
  if (exact) return exact;
  // كتابة مثل "Kia Cerato" أو "MG ZS": الكلمة الأولى اسم ماركة معروفة
  const firstToken = LOOKUP.get(normKey(text.split(/[\s\/\-_,،]+/)[0]));
  if (firstToken) return firstToken;
  // أو تبدأ باسم ماركة طويل معروف (5 حروف فأكثر) مثل "toyotacorolla"
  for (const [alias, canon] of LOOKUP) {
    if (alias.length >= 5 && key.startsWith(alias)) return canon;
  }
  return text;
};
