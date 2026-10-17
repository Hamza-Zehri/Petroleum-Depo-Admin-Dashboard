// Urdu (RTL) UI dictionary. Urdu is the default language of the dashboard.
// Technical identifiers (invoice numbers, codes) stay Latin and readable.
export const t = {
  appName: "پٹرولیم ڈپو",
  appSub: "مینیجمنٹ سسٹم",
  adminDashboard: "ایڈمن ڈیش بورڈ",

  // Navigation
  nav: {
    dashboard: "ڈیش بورڈ",
    stock: "ٹینک اور اسٹاک",
    purchases: "تیل کی خریداری",
    sales: "گاڑی میں تیل بھرائی",
    customers: "گاہک اور ادھار",
    suppliers: "سپلائرز اور ادائیگیاں",
    cashbook: "کیش بک",
    expenses: "اخراجات",
    profit: "منافع اور نقصان",
    reports: "رپورٹس",
    closing: "روزانہ اختتامی حساب",
    users: "صارفین اور اجازتیں",
    sync: "سنک اور آف لائن ریکارڈ",
    receipts: "رسیدیں اور پرنٹنگ",
    backups: "بیک اپ اور بحالی",
    settings: "ڈپو کی ترتیبات",
  },

  // Actions
  save: "محفوظ کریں",
  cancel: "منسوخ کریں",
  print: "پرنٹ کریں",
  export: "برآمد کریں",
  exportCsv: "CSV برآمد کریں",
  details: "تفصیلات دیکھیں",
  confirm: "تصدیق کریں",
  search: "تلاش کریں",
  clear: "فلٹر ہٹائیں",
  retry: "دوبارہ کوشش",
  review: "جائزہ لیں",
  back: "واپس",
  next: "جاری رکھیں",
  close: "بند کریں",
  post: "تصدیق و درج کریں",
  loading: "لوڈ ہو رہا ہے…",
  noRecords: "کوئی ریکارڈ نہیں ملا",
  noRecordsHint: "موجودہ فلٹر تبدیل کریں یا ہٹا دیں۔",

  // Statuses
  status: {
    posted: "درج",
    synced: "سنک شدہ",
    pending: "زیرِ التوا",
    failed: "ناکام",
    conflict: "تنازع",
    unpaid: "غیر ادا شدہ",
    partial: "جزوی ادائیگی",
    paid: "ادا شدہ",
    active: "فعال",
    inactive: "غیر فعال",
  },

  // Auth
  login: "لاگ ان",
  logout: "لاگ آؤٹ",
  email: "ای میل",
  password: "پاس ورڈ",
  loginTitle: "ڈپو ایڈمن میں خوش آمدید",
  loginSub: "جاری رکھنے کے لیے لاگ ان کریں",
  loginError: "ای میل یا پاس ورڈ درست نہیں",
  bootstrapping: "پہلا مالک اکاؤنٹ بنایا جا رہا ہے…",
  createOwner: "مالک اکاؤنٹ بنائیں",
  createOwnerHint: "یہ پہلا اکاؤنٹ ہے جو ڈپو کا مالک ہوگا۔",

  // Misc
  today: "آج",
  allTypes: "تمام اقسام",
  allFuel: "تمام ایندھن",
  dashboardOverview: "کاروباری جائزہ",
  live: "لائیو",
  provisional: "عارضی",
  requiresReview: "جائزے کی ضرورت",
} as const;
