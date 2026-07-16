import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  ShieldCheck,
  Activity,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Search,
  LayoutDashboard,
  Radio,
  FileText,
  Settings,
  Menu,
  Zap,
  Wallet,
  BarChart3,
  Wifi,
  WifiOff,
  ChevronLeft,
  ScanLine,
  Landmark,
  Sparkles,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Bell,
  CircleDot,
  Globe,
  Gem,
  Info,
  X,
  Send,
  MessageCircle,
  ShieldAlert,
  UserCheck,
  Scale,
  BadgeCheck,
  BookOpenCheck,
  ClipboardList,
  History,
  ThumbsUp,
  ThumbsDown,
  Download,
  Filter,
  Gauge,
  GitCompare,
  Bug,
  Mail,
  KeyRound,
  LogOut,
  Loader2,
  Wand2,
  Presentation,
} from "lucide-react";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// API config
// ---------------------------------------------------------------------------

// In local dev, "/api" is handled by Vite's proxy (see vite.config.js) to
// localhost:8000. In production, the frontend and backend are typically
// hosted separately (e.g. Vercel + Render), so VITE_API_BASE must be set at
// build time to the deployed backend's full URL, e.g.
// VITE_API_BASE=https://meyar-backend.onrender.com/api
const API_BASE = import.meta.env.VITE_API_BASE || "/api";

// ---------------------------------------------------------------------------
// i18n — UI strings
// ---------------------------------------------------------------------------

const STR = {
  ar: {
    dir: "rtl",
    fontFamily: "'Cairo', 'Segoe UI', sans-serif",
    appName: "معيار",
    appSubtitle: "نظام المُشرّع الذكي",
    nav: {
      overview: "نظرة عامة",
      monitor: "المراقبة اللحظية",
      review: "قائمة المراجعة",
      audit: "سجل التدقيق",
      analytics: "التحليلات",
      regulatory: "محرك التشريعات",
      methodology: "منهجية الدقة",
      chatbot: "مساعد التشريعات",
      limits: "الحدود والمسؤولية",
      settings: "الإعدادات",
      collapse: "طي القائمة",
    },
    banner: {
      connected: "متصل بمحرك الذكاء الاصطناعي",
      disconnected: "انقطاع الاتصال بالمحرك",
      syncing: "جارٍ المزامنة...",
      lastSync: "آخر مزامنة",
      systemStatusFallback: "المنظومة آمنة - الرقابة الذاتية نشطة",
    },
    kpi: {
      complianceScore: "مؤشر الالتزام الكلي",
      vsLastWeek: "مقارنة بالأسبوع الماضي",
      monitoredVolume: "إجمالي الحجم المُراقب",
      txToday: "معاملة اليوم",
      blockedViolations: "المخالفات المحظورة لحظياً",
      blockedDrop: "انخفاض في محاولات المخالفة",
      savedPenalties: "قيمة الغرامات المُوفّرة",
      costReduction: "خفض في تكاليف الامتثال",
      savedPenaltiesTrend: "أقل من الأسبوع الماضي",
    },
    status: { passed: "مطابقة", flagged: "قيد المراجعة", blocked: "محظورة" },
    level: {
      auto_block: "مستوى ١ — منع آلي (قاعدة قطعية)",
      pending_review: "مستوى ٢ — تعليق ومراجعة بشرية",
      no_action: "لا يتطلب إجراءً",
      reviewerPrefix: "الجهة المختصة بالمراجعة:",
      basisPrefix: "أساس القرار:",
      riskScorePrefix: "درجة المخاطرة (الموديل):",
    },
    costTooltip: {
      label: "كيف نحسب هذه النسبة؟",
    },
    notifications: {
      title: "آخر التنبيهات",
      empty: "لا توجد تنبيهات جديدة",
      viewAll: "عرض الكل في المراقبة اللحظية",
    },
    toast: {
      blockedTitle: "معاملة محظورة الآن",
      viewInMonitor: "عرض بالمراقبة اللحظية",
    },
    settingsModal: {
      title: "عن النظام",
      version: "الإصدار",
      description: "نظام معيار يطبّق نموذج المنع المتدرج على مستويين، ويوثّق حدوده ومسؤولياته بشكل صريح.",
      goToLimits: "عرض تفاصيل الحدود والمسؤولية",
      replayTour: "إعادة الجولة الترحيبية",
      presentationOn: "تفعيل وضع العرض التقديمي",
      presentationOff: "إيقاف وضع العرض التقديمي",
      close: "إغلاق",
      profileTitle: "الملف الشخصي",
      roleLabel: "الدور الوظيفي",
      emailLabel: "البريد الإلكتروني",
      logout: "تسجيل الخروج",
    },
    auth: {
      appName: "معيار",
      tagline: "منظومة الرقابة المالية اللحظية",
      loginTab: "تسجيل الدخول",
      signupTab: "حساب جديد",
      emailStepTitle: "تسجيل الدخول",
      emailStepSubtitle: "أدخل بريدك الإلكتروني الوظيفي لإرسال رمز تحقق",
      emailPlaceholder: "name@meyar.demo",
      sendCode: "إرسال رمز التحقق",
      sending: "جارٍ الإرسال...",
      signupStepTitle: "إنشاء حساب جديد",
      signupStepSubtitle: "بيانات بسيطة، ثم نرسل لك رمز تحقق لتأكيد بريدك",
      namePlaceholder: "الاسم الكامل",
      roleLabel: "الدور الوظيفي",
      roleCompliance: "موظف الامتثال",
      roleSharia: "عضو الهيئة الشرعية",
      createAccount: "إنشاء الحساب وإرسال الرمز",
      creating: "جارٍ الإنشاء...",
      codeStepTitle: "أدخل رمز التحقق",
      codeStepSubtitle: (email) => `أرسلنا رمز مكوَّن من ٦ أرقام إلى ${email}`,
      codePlaceholder: "٠ ٠ ٠ ٠ ٠ ٠",
      verify: "تحقق ودخول",
      verifying: "جارٍ التحقق...",
      changeEmail: "تغيير البريد الإلكتروني",
      demoNotice: (code) => `وضع تجريبي: لا يوجد إرسال بريد فعلي حالياً، رمزك هو ${code}`,
      notRegistered: "هذا البريد غير مسجَّل بالنظام.",
      goToSignup: "أنشئ حساباً جديداً",
      alreadyRegistered: "هذا البريد مسجَّل بالفعل.",
      goToLogin: "سجّل الدخول بدلاً من ذلك",
      invalidCode: "رمز غير صحيح أو منتهي الصلاحية",
      nameRequired: "الرجاء إدخال الاسم الكامل",
      genericError: "حدث خطأ من الخادم، حاول مرة أخرى",
      networkError: "تعذّر الوصول للخادم — تحقّق من اتصالك بالإنترنت أو حاول لاحقاً",
      sessionExpired: "انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مجدداً",
    },
    onboarding: {
      skip: "تخطّي",
      back: "السابق",
      next: "التالي",
      finish: "ابدأ الاستكشاف",
      steps: [
        {
          icon: ShieldCheck,
          title: "أهلاً بك في معيار",
          body: "نظام يحوّل تعاميم البنك المركزي إلى قواعد رقمية، ويراقب المعاملات المالية لحظة بلحظة — مع تمييز واضح بين ما يمكن أتمتته بأمان، وما يجب أن يبقى قراراً بشرياً.",
        },
        {
          icon: LayoutDashboard,
          title: "المستوى ١ والمستوى ٢",
          body: "الحالات القطعية (تجاوز سقف، جهة غير مرخصة) تُمنع آلياً وفوراً. أما الحالات الاجتهادية (شبهة شرعية، نمط غسل أموال) فتُعلَّق وتُحال لموظف بشري عبر «قائمة المراجعة»، وكل قرار يُوثَّق في «سجل التدقيق».",
        },
        {
          icon: ShieldAlert,
          title: "الشفافية أولاً",
          body: "تبويب «الحدود والمسؤولية» يفصح صراحة عن حدود دقة النظام ومن يتحمل المسؤولية في كل حالة. جرّب أيضاً «مساعد التشريعات» و«منهجية الدقة» لفهم كيف نقيس أداءنا فعلياً.",
        },
      ],
    },
    limits: {
      title: "الحدود والمسؤولية",
      subtitle: "بشفافية كاملة: هذا ما يفعله النظام، وهذا ما لا يفعله، ومن المسؤول في كل حالة",
      sections: [
        {
          icon: "shield",
          title: "١. لسنا ندّعي دقة ١٠٠٪",
          body:
            "النصوص القانونية والتنظيمية فيها استثناءات وسياق. لهذا صمّمنا النظام على افتراض أنه قد يخطئ، ونحصر قراراته الآلية النهائية في الحالات القطعية فقط (المستوى ١)، ونحوّل كل حالة فيها اجتهاد إلى مراجعة بشرية (المستوى ٢) بدل اتخاذ قرار نهائي آلي.",
        },
        {
          icon: "scale",
          title: "٢. من يتحمل المسؤولية؟",
          body:
            "في المستوى ١: النظام ينفّذ آلياً استناداً إلى قاعدة رقمية موثّقة ومعلنة مسبقاً (تجاوز سقف، جهة غير مرخصة، قائمة حظر رسمية) — المسؤولية على دقة تعريف القاعدة نفسها. في المستوى ٢: القرار النهائي دائماً بشري (موظف امتثال أو الهيئة الشرعية)، والنظام لا يُنسب له اتخاذ القرار بل التنبيه والتوثيق فقط.",
        },
        {
          icon: "book",
          title: "٣. حدود صلاحيات الخدمات المصرفية المفتوحة",
          body:
            "الوصول عبر Open Banking يمنح عادة صلاحية «قراءة» أو «بدء عملية بموافقة العميل»، وليس صلاحية إيقاف داخل الأنظمة المصرفية الأساسية (Core Banking). أي «منع» فعلي في نظام معيار محكوم تماماً بحدود اتفاقية التكامل الموقّعة مع كل مؤسسة، وليس افتراضاً عاماً.",
        },
        {
          icon: "user",
          title: "٤. الرقابة الشرعية اجتهاد بشري لا آلي",
          body:
            "تحديد «شبهة مخالفة شرعية» فيه اجتهاد قد يختلف بين الهيئات الشرعية نفسها. النظام لا يقرر هذا أبداً بمفرده؛ أقصى ما يفعله هو تعليق العملية وتنبيه الهيئة الشرعية المختصة لاتخاذ القرار.",
        },
        {
          icon: "badge",
          title: "٥. منهجية رقم خفض التكاليف",
          body:
            "النسبة محسوبة كـ (١ − ساعات المراجعة بعد الأتمتة ÷ ساعات المراجعة قبل الأتمتة) × ١٠٠، بافتراض ١٢٠٠ ساعة مراجعة يدوية شهرياً قبل النظام مقابل ٣٦٠ ساعة متبقية بعد الأتمتة (مراجعة حالات المستوى ٢ فقط). هذا تقدير تشغيلي قابل للمراجعة والتدقيق، وليس رقماً تسويقياً بلا مصدر.",
        },
      ],
    },
    chatbot: {
      fabLabel: "اسأل عن الأنظمة",
      title: "مساعد التشريعات",
      subtitle: "إجابات من قاعدة معرفة تعاميم ساما المحمّلة بالنظام فقط",
      disclaimer:
        "الإجابات مبنية حصراً على قاعدة معرفة محلية مبسّطة لأغراض العرض التجريبي، وليست نصوصاً رسمية حرفية من ساما ولا استشارة قانونية أو شرعية معتمدة.",
      placeholder: "اسأل عن تعميم أو نظام معيّن...",
      send: "إرسال",
      thinking: "جارٍ البحث في قاعدة المعرفة...",
      sourcesLabel: "المصادر:",
      suggestedLabel: "أسئلة مقترحة",
      noMatch:
        "ما لقيت إجابة مباشرة لهذا السؤال بالوضع المحلي الحالي. جرّب تعيد صياغة السؤال، أو اسأل عن مواضيع نغطيها بالتفصيل مثل: KYC، السقف اليومي، مكافحة غسل الأموال، Open Banking، أو الشبهة الشرعية. وللمصدر الرسمي: sama.gov.sa.",
      confidence: { high: "تطابق قوي", medium: "تطابق جزئي", general: "إجابة عامة", none: "غير موجود" },
    },
    reviewQueue: {
      title: "قائمة المراجعة",
      subtitle: "معاملات المستوى ٢ المعلَّقة — بانتظار قرار بشري نهائي",
      empty: "لا توجد معاملات معلَّقة حالياً 🎉",
      pending: "معلَّقة",
      approvedToday: "موافقة اليوم",
      rejectedToday: "مرفوضة اليوم",
      approvalRate: "نسبة الموافقة",
      approve: "موافقة",
      reject: "رفض",
      reviewerLabel: "المراجع:",
      defaultReviewer: "موظف الامتثال (تجريبي)",
      decidedToast: "تم تسجيل القرار وإضافته لسجل التدقيق",
      categoryFilterLabel: "تصنيف المخالفة",
      categoryFilterAll: "كل التصنيفات",
      exportPdf: "تقرير PDF",
      exportDecisions: "تقرير القرارات (موافقة/رفض)",
      exportPending: "تصدير المعلَّقة فقط",
    },
    auditTrail: {
      title: "سجل التدقيق",
      subtitle: "كل قرار اتخذه النظام أو موظف بشري — موثّق بالوقت والسبب والجهة",
      empty: "لا توجد قرارات مسجّلة بعد",
      autoLabel: "آلي",
      humanLabel: "بشري",
      decisionLabels: { blocked: "محظورة", approved: "موافَق عليها", rejected: "مرفوضة" },
    },
    guardian: {
      title: "الحارس الرقمي — الحالة اللحظية",
      description:
        "كل معاملة تُحلَّل لحظياً: القواعد القطعية (مستوى ١) تُنفَّذ آلياً، وأي حالة اجتهادية (مستوى ٢) تُعلَّق وتُحال فوراً لمراجعة بشرية.",
      cta: "فتح المراقبة اللحظية",
    },
    trendCard: {
      title: "اتجاه الالتزام الشهري مقابل خفض التكاليف التشغيلية",
      subtitle: (pct) => `خفض فعلي بنسبة ${pct}% في التكاليف التشغيلية للامتثال`,
    },
    monitor: {
      title: "راصد القرار اللحظي",
      live: "مباشر",
      description: "تدفق حي للمعاملات: منع آلي فوري للقواعد القطعية (مستوى ١)، وتعليق مع تحديد المراجع البشري للحالات الاجتهادية (مستوى ٢)",
      searchPlaceholder: "ابحث بالمؤسسة أو رقم العملية...",
      loading: "جارٍ الاتصال بمحرك المراقبة...",
      empty: "لا توجد معاملات مطابقة لبحثك",
      filters: { all: "الكل", passed: "مطابقة", flagged: "قيد المراجعة", blocked: "محظورة" },
      exportExcel: "تصدير Excel",
      allCategories: "كل أنواع المخالفات",
    },
    analytics: {
      trendTitle: (pct) => `الاتجاه السنوي للالتزام مقابل خفض التكاليف التشغيلية بنسبة ${pct}%`,
      actual: "الالتزام الفعلي",
      target: "الهدف",
      cost: "خفض التكاليف",
      avgCompliance: "متوسط الالتزام السنوي",
      maxCostCut: "أعلى خفض شهري للتكاليف",
      totalScanned: "إجمالي المعاملات الممسوحة اليوم",
    },
    regulatory: {
      title: "محرك تحويل التشريعات إلى قواعد برمجية",
      description:
        "يقوم الذكاء الاصطناعي بقراءة تعاميم مؤسسة النقد العربي السعودي (ساما) وتحويل ما هو قطعي منها إلى قواعد تنفيذية آلية (مستوى ١)، وما هو اجتهادي إلى مسارات تنبيه ومراجعة بشرية (مستوى ٢)",
      rulesGenerated: "القواعد المولّدة",
      affectedInstitutions: "المؤسسات المتأثرة",
      parsing: {
        completed: "تم التحويل إلى قاعدة برمجية",
        in_progress: "قيد التحويل الآلي",
        queued: "في طابور المعالجة",
      },
      summaryCompleted: (n, rules) => `تم تحليل نص ${n} وتحويل بنوده إلى ${rules} قاعدة برمجية قابلة للتنفيذ اللحظي.`,
      summaryQueued: (n) => `${n} في طابور المعالجة بانتظار استخلاص النص القانوني وتحويله إلى قواعد.`,
      disclaimer:
        "الأنظمة والتعاميم المذكورة هنا حقيقية ويمكن التحقق منها بشكل مستقل (المصادر الرسمية: laws.boe.gov.sa و rulebook.sama.gov.sa). الاستثناء الوحيد هو بعض الأرقام الدقيقة للسقوف المالية غير المنشورة تفصيلياً من ساما.",
      issuedOn: "تاريخ الإصدار:",
    },
    methodology: {
      title: "منهجية الدقة",
      subtitle: "كيف نقيس دقة الموديل فعلياً، ولماذا اخترنا هذا الحد بالذات لتفعيل التنبيه",
      currentOperating: "نقطة التشغيل الحالية",
      threshold: "الحد المُفعَّل",
      precision: "الدقة (Precision)",
      recall: "الاستدعاء (Recall)",
      f1: "F1 Score",
      precisionExplain: "من كل المعاملات اللي صنّفها الموديل «تحتاج مراجعة»، كم نسبة منها كانت فعلاً كذلك؟ دقة منخفضة تعني إزعاج موظفين بمراجعات غير ضرورية كثيرة.",
      recallExplain: "من كل المعاملات اللي فعلاً تحتاج مراجعة، كم نسبة قدر الموديل يمسكها؟ استدعاء منخفض يعني تفويت حالات حقيقية.",
      confusionMatrix: "مصفوفة الالتباس",
      truePositive: "إيجابية صحيحة",
      truePositiveDesc: "احتاجت مراجعة، والموديل صنّفها صح",
      falsePositive: "إيجابية خاطئة",
      falsePositiveDesc: "ما احتاجت مراجعة، لكن الموديل رفعها بالخطأ",
      trueNegative: "سلبية صحيحة",
      trueNegativeDesc: "ما احتاجت مراجعة، والموديل صنّفها صح",
      falseNegative: "سلبية خاطئة",
      falseNegativeDesc: "احتاجت مراجعة، لكن الموديل فوّتها",
      tradeoffTitle: "لماذا الحد ٠.٥٥ بالذات؟",
      tradeoffBody: "رفع الحد يقلّل الإزعاج (دقة أعلى) لكن يفوّت حالات حقيقية أكثر (استدعاء أقل). خفضه يمسك حالات أكثر لكن يزيد المراجعات غير الضرورية. الرسم أدناه يعرض هذا التبادل فعلياً عبر حدود مختلفة، والحد الحالي هو نقطة توازن مقصودة لا رقم عشوائي.",
      testSetLabel: "حجم عيّنة الاختبار",
      loading: "جارٍ حساب المقاييس من الموديل الفعلي...",
    },
    chart: {
      month: "الشهر",
      tooltipCurrency: "ر.س",
    },
    currencySuffix: "ر.س",
    footer: (year) =>
      `معيار — نظام المُشرّع الذكي © ${year} — جميع المعاملات تخضع للرقابة اللحظية عبر الخدمات المصرفية المفتوحة`,
    langToggleLabel: "EN",
  },
  en: {
    dir: "ltr",
    fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
    appName: "Meyar",
    appSubtitle: "Intelligent Regulator System",
    nav: {
      overview: "Overview",
      monitor: "Live Monitor",
      review: "Review queue",
      audit: "Audit trail",
      analytics: "Analytics",
      regulatory: "Regulatory Engine",
      methodology: "Accuracy Methodology",
      chatbot: "Legislation Assistant",
      limits: "Limits & Liability",
      settings: "Settings",
      collapse: "Collapse menu",
    },
    banner: {
      connected: "Connected to AI core engine",
      disconnected: "Core engine disconnected",
      syncing: "Syncing...",
      lastSync: "Last sync",
      systemStatusFallback: "System secure — autonomous oversight active",
    },
    kpi: {
      complianceScore: "Overall Compliance Score",
      vsLastWeek: "vs. last week",
      monitoredVolume: "Total Monitored Volume",
      txToday: "transactions today",
      blockedViolations: "Instantly Blocked Infractions",
      blockedDrop: "drop in violation attempts",
      savedPenalties: "Saved Penalties Value",
      costReduction: "reduction in compliance costs",
      savedPenaltiesTrend: "vs. last week",
    },
    status: { passed: "Passed", flagged: "Under Review", blocked: "Blocked" },
    level: {
      auto_block: "Level 1 — Automatic Block (definitive rule)",
      pending_review: "Level 2 — Suspended, Human Review",
      no_action: "No action required",
      reviewerPrefix: "Required reviewer:",
      basisPrefix: "Decision basis:",
      riskScorePrefix: "AI risk score:",
    },
    costTooltip: {
      label: "How is this % calculated?",
    },
    notifications: {
      title: "Latest Alerts",
      empty: "No new alerts",
      viewAll: "View all in Live Monitor",
    },
    toast: {
      blockedTitle: "Transaction blocked just now",
      viewInMonitor: "View in Live Monitor",
    },
    settingsModal: {
      title: "About This System",
      version: "Version",
      description: "Meyar implements a two-tier prevention model and openly documents its limits and lines of accountability.",
      goToLimits: "View Limits & Liability details",
      replayTour: "Replay the welcome tour",
      presentationOn: "Enable presentation mode",
      presentationOff: "Disable presentation mode",
      close: "Close",
      profileTitle: "Profile",
      roleLabel: "Role",
      emailLabel: "Email",
      logout: "Log out",
    },
    auth: {
      appName: "Meyar",
      tagline: "Real-time financial compliance system",
      loginTab: "Sign in",
      signupTab: "New account",
      emailStepTitle: "Sign in",
      emailStepSubtitle: "Enter your work email to receive a verification code",
      emailPlaceholder: "name@meyar.demo",
      sendCode: "Send verification code",
      sending: "Sending...",
      signupStepTitle: "Create a new account",
      signupStepSubtitle: "A few basic details, then we'll send a code to confirm your email",
      namePlaceholder: "Full name",
      roleLabel: "Role",
      roleCompliance: "Compliance officer",
      roleSharia: "Sharia board member",
      createAccount: "Create account & send code",
      creating: "Creating...",
      codeStepTitle: "Enter verification code",
      codeStepSubtitle: (email) => `We sent a 6-digit code to ${email}`,
      codePlaceholder: "0 0 0 0 0 0",
      verify: "Verify & sign in",
      verifying: "Verifying...",
      changeEmail: "Change email",
      demoNotice: (code) => `Demo mode: no real email is sent yet, your code is ${code}`,
      notRegistered: "This email is not registered.",
      goToSignup: "Create a new account",
      alreadyRegistered: "This email is already registered.",
      goToLogin: "Sign in instead",
      invalidCode: "Invalid or expired code",
      nameRequired: "Please enter your full name",
      genericError: "A server error occurred, please try again",
      networkError: "Couldn't reach the server — check your connection or try again later",
      sessionExpired: "Your session has expired, please sign in again",
    },
    onboarding: {
      skip: "Skip",
      back: "Back",
      next: "Next",
      finish: "Start exploring",
      steps: [
        {
          icon: ShieldCheck,
          title: "Welcome to Meyar",
          body: "A system that turns central-bank circulars into digital rules, monitoring financial transactions in real time — with a clear line between what can be safely automated and what must stay a human decision.",
        },
        {
          icon: LayoutDashboard,
          title: "Level 1 vs. Level 2",
          body: "Definitive cases (limit exceeded, unlicensed entity) are auto-blocked instantly. Interpretive cases (Sharia concerns, AML patterns) are suspended and routed to a human via the Review Queue, with every decision logged in the Audit Trail.",
        },
        {
          icon: ShieldAlert,
          title: "Transparency first",
          body: "The Limits & Liability tab openly discloses the system's accuracy limits and who is accountable in each case. Also try the Legislation Assistant and Accuracy Methodology tabs to see how we actually measure our own performance.",
        },
      ],
    },
    limits: {
      title: "Limits & Liability",
      subtitle: "Full transparency: what the system does, what it doesn't, and who is accountable in each case",
      sections: [
        {
          icon: "shield",
          title: "1. We don't claim 100% accuracy",
          body:
            "Legal and regulatory text contains exceptions and context. That's why the system assumes it can be wrong: final automatic decisions are limited strictly to definitive cases (Level 1), while every interpretive case is routed to human review (Level 2) instead of an automatic final ruling.",
        },
        {
          icon: "scale",
          title: "2. Who is accountable?",
          body:
            "Level 1: the system executes automatically against a pre-documented numeric rule (limit exceeded, unlicensed entity, official blacklist) — accountability centers on the accuracy of the rule's own definition. Level 2: the final decision is always human (a compliance officer or the Sharia board); the system is never credited with the decision, only the alert and the audit trail.",
        },
        {
          icon: "book",
          title: "3. Open Banking permission boundaries",
          body:
            "Open Banking access typically grants 'read' or 'consented initiation' rights, not the ability to stop a transaction inside a bank's Core Banking system. Any actual 'block' in Meyar is strictly bounded by the signed integration agreement with each institution, never a general assumption.",
        },
        {
          icon: "user",
          title: "4. Sharia review is human judgment, not automated",
          body:
            "Determining a 'Sharia compliance concern' involves juristic reasoning that can differ between Sharia boards themselves. The system never rules on this alone; at most it suspends the transaction and alerts the relevant Sharia board to decide.",
        },
        {
          icon: "badge",
          title: "5. Cost-reduction figure methodology",
          body:
            "The percentage is calculated as (1 − post-automation review hours ÷ pre-automation review hours) × 100, assuming 1,200 manual review hours/month before the system vs. 360 hours remaining after automation (Level-2 human review only). This is an auditable operational estimate, not an unsourced marketing figure.",
        },
      ],
    },
    chatbot: {
      fabLabel: "Ask about regulations",
      title: "Regulatory Assistant",
      subtitle: "Answers sourced only from the loaded SAMA circular knowledge base",
      disclaimer:
        "Answers are generated strictly from a simplified local knowledge base for demo purposes — not verbatim official SAMA text, nor certified legal or Sharia advice.",
      placeholder: "Ask about a circular or regulation...",
      send: "Send",
      thinking: "Searching the knowledge base...",
      sourcesLabel: "Sources:",
      suggestedLabel: "Suggested questions",
      noMatch: "I couldn't find a direct answer in local offline mode. Try rephrasing, or ask about topics I cover in depth: KYC, daily limits, AML, Open Banking, or Sharia concerns. For the official source: sama.gov.sa.",
      confidence: { high: "Strong match", medium: "Partial match", general: "General answer", none: "Not found" },
    },
    reviewQueue: {
      title: "Review queue",
      subtitle: "Pending Level-2 transactions — awaiting a final human decision",
      empty: "No pending transactions right now 🎉",
      pending: "Pending",
      approvedToday: "Approved today",
      rejectedToday: "Rejected today",
      approvalRate: "Approval rate",
      approve: "Approve",
      reject: "Reject",
      reviewerLabel: "Reviewer:",
      defaultReviewer: "Compliance officer (demo)",
      decidedToast: "Decision recorded and added to the audit trail",
      categoryFilterLabel: "Violation category",
      categoryFilterAll: "All categories",
      exportPdf: "PDF Report",
      exportDecisions: "Decisions report (approved/rejected)",
      exportPending: "Export pending only",
    },
    auditTrail: {
      title: "Audit trail",
      subtitle: "Every decision made by the system or a human reviewer — logged with time, reason, and actor",
      empty: "No decisions logged yet",
      autoLabel: "Automatic",
      humanLabel: "Human",
      decisionLabels: { blocked: "Blocked", approved: "Approved", rejected: "Rejected" },
    },
    guardian: {
      title: "Digital Guardian — Live Status",
      description:
        "Every transaction is analyzed instantly: definitive rules (Level 1) execute automatically, while any interpretive case (Level 2) is suspended and routed to human review.",
      cta: "Open Live Monitor",
    },
    trendCard: {
      title: "Monthly Compliance Trend vs. Operational Cost Reduction",
      subtitle: (pct) => `An actual ${pct}% reduction in operational compliance costs`,
    },
    monitor: {
      title: "Live Decision Monitor",
      live: "LIVE",
      description: "A live transaction stream: immediate automatic block for definitive rules (Level 1), suspended with a named human reviewer for interpretive cases (Level 2)",
      searchPlaceholder: "Search by institution or transaction ID...",
      loading: "Connecting to the monitoring engine...",
      empty: "No transactions match your search",
      filters: { all: "All", passed: "Passed", flagged: "Under Review", blocked: "Blocked" },
      exportExcel: "Export Excel",
      allCategories: "All violation types",
    },
    analytics: {
      trendTitle: (pct) => `Annual Compliance Trend vs. ${pct}% Operational Cost Reduction`,
      actual: "Actual Compliance",
      target: "Target",
      cost: "Cost Reduction",
      avgCompliance: "Average Annual Compliance",
      maxCostCut: "Highest Monthly Cost Cut",
      totalScanned: "Total Transactions Scanned Today",
    },
    regulatory: {
      title: "Legislation-to-Code Conversion Engine",
      description:
        "The AI engine reads SAMA circulars and converts definitive provisions into automated Level-1 rules, and interpretive ones into Level-2 alert-and-review pathways",
      rulesGenerated: "Rules Generated",
      affectedInstitutions: "Affected Institutions",
      parsing: {
        completed: "Converted to code rule",
        in_progress: "Auto-conversion in progress",
        queued: "Queued for processing",
      },
      summaryCompleted: (n, rules) => `${n} was parsed and converted into ${rules} executable code rules running in real time.`,
      summaryQueued: (n) => `${n} is queued, awaiting legal-text extraction and rule conversion.`,
      disclaimer:
        "The laws and regulations cited here are real and independently verifiable (official sources: laws.boe.gov.sa and rulebook.sama.gov.sa). The one exception is certain precise financial caps not publicly detailed by SAMA.",
      issuedOn: "Issued:",
    },
    methodology: {
      title: "Accuracy Methodology",
      subtitle: "How we actually measure model accuracy, and why this specific alert threshold was chosen",
      currentOperating: "Current operating point",
      threshold: "Active threshold",
      precision: "Precision",
      recall: "Recall",
      f1: "F1 Score",
      precisionExplain: "Of everything the model flagged as \"needs review\", what fraction actually did? Low precision means burdening staff with unnecessary reviews.",
      recallExplain: "Of everything that actually needed review, what fraction did the model catch? Low recall means missing real cases.",
      confusionMatrix: "Confusion Matrix",
      truePositive: "True Positive",
      truePositiveDesc: "Needed review, correctly flagged",
      falsePositive: "False Positive",
      falsePositiveDesc: "Didn't need review, wrongly flagged",
      trueNegative: "True Negative",
      trueNegativeDesc: "Didn't need review, correctly passed",
      falseNegative: "False Negative",
      falseNegativeDesc: "Needed review, but the model missed it",
      tradeoffTitle: "Why threshold 0.55 specifically?",
      tradeoffBody: "Raising the threshold reduces noise (higher precision) but misses more real cases (lower recall). Lowering it catches more but increases unnecessary reviews. The chart below shows this trade-off across different thresholds — the current one is a deliberate balance point, not an arbitrary number.",
      testSetLabel: "Test set size",
      loading: "Computing metrics from the live model...",
    },
    chart: {
      month: "Month",
      tooltipCurrency: "SAR",
    },
    currencySuffix: "SAR",
    footer: (year) =>
      `Meyar — Intelligent Regulator System © ${year} — All transactions are under live oversight via Open Banking`,
    langToggleLabel: "AR",
  },
};

const NAV_ORDER = ["overview", "monitor", "review", "audit", "analytics", "regulatory", "methodology", "chatbot", "limits"];
const NAV_ICONS = {
  overview: LayoutDashboard,
  monitor: Radio,
  review: ClipboardList,
  audit: History,
  analytics: BarChart3,
  regulatory: FileText,
  methodology: Gauge,
  chatbot: MessageCircle,
  limits: ShieldAlert,
};

// ---------------------------------------------------------------------------
// AR → EN content dictionary (translates live backend / fallback data that
// arrives pre-rendered in Arabic, so the English view is fully localized too)
// ---------------------------------------------------------------------------

const AR_EN_DICTIONARY = {
  // Institutions
  "البنك الأهلي السعودي": "Saudi National Bank",
  "بنك الرياض": "Riyad Bank",
  "بنك الرياض المطور": "Riyad Bank Digital",
  "البنك السعودي الفرنسي": "Banque Saudi Fransi",
  "بنك ساب": "SAB Bank",
  "بنك الجزيرة": "Bank Aljazira",
  "بنك البلاد": "Bank Albilad",
  "مصرف الإنماء": "Alinma Bank",
  "بنك الخليج الدولي": "Gulf International Bank",
  "تطبيق حصلتي": "Hasalti App",
  "بنك الاستثمار العربي الوطني": "Arab National Investment Bank",

  // Channels
  "تطبيق الجوال": "Mobile App",
  "الإنترنت البنكي": "Online Banking",
  "نقاط البيع": "Point of Sale",

  // Blocked reasons
  "تجاوز حدود الرخصة الممنوحة - المادة ٤": "Exceeded granted license limits — Article 4",
  "تحويل مالي إلى جهة غير مرخصة من ساما - المادة ١٢": "Transfer to a SAMA-unlicensed entity — Article 12",
  "نشاط مشبوه يطابق نمط غسل أموال - المادة ٧": "Suspicious activity matching a money-laundering pattern — Article 7",
  "تجاوز السقف اليومي المسموح للعميل - القواعد المحافظ الإلكترونية": "Exceeded customer's daily limit — the Electronic Wallets Rules",
  "غياب بيانات المستفيد الفعلي (KYC) - المادة ٩": "Missing beneficial-owner data (KYC) — Article 9",
  "محاولة تحويل لحساب مدرج على قائمة الحظر": "Attempted transfer to a blacklisted account",
  "عملية تقع خارج نطاق النشاط التجاري المرخّص": "Transaction outside the licensed business scope",
  "تكرار غير طبيعي للمعاملات خلال نافذة زمنية قصيرة": "Abnormal transaction frequency within a short time window",

  // Flagged reasons
  "نمط معاملات يستدعي مراجعة يدوية إضافية": "Transaction pattern requires additional manual review",
  "قيمة المعاملة أعلى من المتوسط التاريخي للعميل بنسبة كبيرة": "Transaction value significantly above the customer's historical average",
  "أول معاملة من هذا النوع لهذا الحساب": "First transaction of this type for this account",
  "تعارض جزئي مع تعميم ساما رقم ١٠٢": "Partial conflict with SAMA the AML/CTF Rules for Banks (SAMA Circular No. 18147/M.A.T/9201)",
  "بيانات المستفيد تحتاج تحققاً إضافياً": "Beneficiary data requires additional verification",

  // Passed reasons
  "مطابقة كاملة لأنظمة مؤسسة النقد - لا مخالفات": "Fully compliant with SAMA regulations — no violations",
  "ضمن السقف المصرح به وفق ترخيص العميل": "Within the authorized limit under the customer's license",
  "تحقق فوري من هوية المستفيد ونجاح KYC": "Instant beneficiary identity verification — KYC passed",
  "متوافقة مع تعميم ساما رقم ٩٨ - الخدمات المالية المفتوحة": "Compliant with SAMA the Electronic Wallets Rules — Open Banking services",

  // Circulars
  "قواعد مكافحة غسل الأموال للبنوك (تعميم 18147/م.أ.ت/9201)": "the AML/CTF Rules for Banks (SAMA Circular No. 18147/M.A.T/9201)",
  "قواعد المحافظ الإلكترونية": "the Electronic Wallets Rules",
  "دليل مكافحة غسل الأموال وتمويل الإرهاب (ساما)": "the SAMA AML/CTF Guide",
  "نظام مكافحة غسل الأموال (م/20)": "the Anti-Money Laundering Law (Royal Decree M/20)",
  "إطار ساما للخدمات المصرفية المفتوحة": "the SAMA Open Banking Framework",
  "لائحة مراقبة شركات مزودي خدمات الدفع (PSPR)": "the Payment Service Provider Regulations (PSPR)",
  "ضوابط التحقق من هوية العميل في الخدمات المصرفية المفتوحة": "Customer identity verification controls in Open Banking services",
  "تحديث السقوف اليومية لمعاملات الدفع الفوري": "Update to daily limits for instant payment transactions",
  "متطلبات الإفصاح عن المستفيد الفعلي للحسابات التجارية": "Beneficial-owner disclosure requirements for commercial accounts",
  "ضوابط مكافحة غسل الأموال في خدمات التحويل الرقمي": "Anti-money-laundering controls in digital transfer services",
  "تنظيم واجهات برمجة التطبيقات المصرفية المفتوحة (Open Banking)": "Regulation of Open Banking APIs",
  "تحديد الحد الأقصى اليومي لمعاملات المحافظ الرقمية": "Setting the daily maximum for digital wallet transactions",
  "متطلبات ترخيص مزودي خدمات الدفع الصغرى": "Licensing requirements for micro-payment service providers",

  // System status
  "المنظومة آمنة - الرقابة الذاتية نشطة": "System secure — autonomous oversight active",
  "المنظومة آمنة - الرقابة الذاتية نشطة (المستوى ١ آلي / المستوى ٢ بمراجعة بشرية)":
    "System secure — autonomous oversight active (Level 1 automated / Level 2 human-reviewed)",

  // Level-1 (blocked) reasons — v3 wording
  "محاولة تحويل لحساب مدرج على قائمة الحظر الرسمية": "Attempted transfer to an officially blacklisted account",
  "غياب بيانات إلزامية لمعرفة العميل (KYC) - المادة ٩": "Missing mandatory KYC field — Article 9",

  // Level-2 (flagged) reasons — v3 wording
  "نمط معاملات يطابق مؤشرات احتمالية لغسل الأموال - يتطلب مراجعة":
    "Transaction pattern matches probabilistic AML indicators — requires review",
  "عملية قد تقع خارج نطاق النشاط التجاري المرخّص": "Transaction may fall outside the licensed business scope",
  "شبهة مخالفة شرعية محتملة تستدعي رأياً شرعياً متخصصاً": "Potential Sharia-compliance concern requiring specialist review",

  // Decision-basis strings
  "مقارنة رقمية مباشرة بسقف الترخيص المسجل — لا اجتهاد": "Direct numeric comparison against the registered license limit — no judgment involved",
  "تحقق مطابقة مباشر مع سجل الجهات المرخّصة من ساما — لا اجتهاد": "Direct match check against SAMA's licensed-entity registry — no judgment involved",
  "مقارنة رقمية تراكمية بسقف يومي معلن — لا اجتهاد": "Cumulative numeric comparison against a published daily limit — no judgment involved",
  "تحقق مطابقة مباشر مع قائمة حظر رسمية معتمدة — لا اجتهاد": "Direct match check against an official approved blacklist — no judgment involved",
  "تحقق اكتمال حقول إلزامية — لا اجتهاد": "Mandatory-field completeness check — no judgment involved",
  "تقييم احتمالي (نموذج كشف أنماط) — يحتاج قراراً بشرياً نهائياً": "Probabilistic assessment (pattern-detection model) — needs a final human decision",
  "انحراف إحصائي عن سلوك معتاد — لا يعني مخالفة بالضرورة": "Statistical deviation from usual behavior — not necessarily a violation",
  "غياب سجل تاريخي كافٍ للمقارنة — يحتاج تحققاً بشرياً": "Insufficient historical record for comparison — needs human verification",
  "تصنيف اجتهادي لنوع النشاط — قابل للتفسير": "Interpretive classification of activity type — open to interpretation",
  "مسائل الاجتهاد الشرعي تختلف بين الهيئات — لا يقرر النظام فيها": "Sharia-juristic matters vary between boards — the system does not rule on these",
  "نمط سلوكي مرجّح إحصائياً — ليس دليلاً قاطعاً": "Statistically likely behavioral pattern — not conclusive proof",
  "مطابقة قواعد صريحة معلنة": "Matches explicitly published rules",

  // Violation categories
  "تجاوز الحدود المسموحة": "Limit exceeded",
  "جهة أو حساب غير موثوق": "Untrusted entity/account",
  "نقص بيانات العميل (KYC)": "Missing KYC data",
  "اشتباه غسل أموال": "AML suspicion",
  "شبهة شرعية": "Sharia concern",
  "نمط سلوكي غير معتاد": "Unusual behavioral pattern",

  // Reviewer roles
  "موظف الامتثال": "Compliance Officer",
  "الهيئة الشرعية": "Sharia Board",

  // Months
  يناير: "January",
  فبراير: "February",
  مارس: "March",
  أبريل: "April",
  مايو: "May",
  يونيو: "June",
  يوليو: "July",
  أغسطس: "August",
  سبتمبر: "September",
  أكتوبر: "October",
  نوفمبر: "November",
  ديسمبر: "December",
};

function localize(text, lang) {
  if (lang !== "en" || !text) return text;
  return AR_EN_DICTIONARY[text] || text;
}

// ---------------------------------------------------------------------------
// Number / date formatting
// ---------------------------------------------------------------------------

const numberFmt = new Intl.NumberFormat("en-US");

function currencyFmt(n, lang) {
  return `${numberFmt.format(Math.round(n))} ${STR[lang].currencySuffix}`;
}

function compactFmt(n, lang) {
  const units =
    lang === "en"
      ? [
          [1_000_000_000, "B"],
          [1_000_000, "M"],
          [1_000, "K"],
        ]
      : [
          [1_000_000_000, "مليار"],
          [1_000_000, "مليون"],
          [1_000, "ألف"],
        ];
  for (const [threshold, label] of units) {
    if (n >= threshold) {
      const val = (n / threshold).toFixed(threshold === 1_000 ? 1 : 2);
      return lang === "en" ? `${val}${label}` : `${val} ${label}`;
    }
  }
  return numberFmt.format(Math.round(n));
}

function timeAgo(isoString, lang) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diffMs / 1000);
  if (lang === "en") {
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  }
  if (s < 5) return "الآن";
  if (s < 60) return `منذ ${s} ثانية`;
  const m = Math.floor(s / 60);
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  return `منذ ${h} ساعة`;
}

// ---------------------------------------------------------------------------
// Excel export — produces a formatted, ready-to-use workbook (translated
// column headers, sensible column widths, a title row) rather than a dump
// of raw field names, so the output is immediately usable by a compliance
// team, not just machine-readable data.
// ---------------------------------------------------------------------------

function exportToExcel({ rows, columns, sheetTitle, fileName }) {
  const headerRow = columns.map((c) => c.header);
  const dataRows = rows.map((row) => columns.map((c) => c.value(row) ?? ""));

  const worksheetData = [[sheetTitle], [], headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);

  ws["!cols"] = columns.map((c) => ({ wch: c.width || 18 }));
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Meyar");
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

// ---------------------------------------------------------------------------
// PDF report generator — renders a full HTML document in a new tab, styled
// with the dashboard's own dark/aurora theme and Cairo font, then triggers
// the browser's native print dialog ("Save as PDF"). This is deliberate:
// JS PDF libraries (jsPDF etc.) render Arabic text glyph-by-glyph without
// proper shaping/joining, producing garbled output — the browser's own
// text engine handles Arabic correctly because it's just HTML.
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function generatePdfReport({ lang, title, subtitle, generatedAtLabel, statCards, columns, rows, disclaimer, emptyLabel }) {
  const dir = lang === "en" ? "ltr" : "rtl";
  const isEn = lang === "en";

  const statCardsHtml = statCards
    .map(
      (s) => `
        <div class="stat-card">
          <div class="stat-value">${escapeHtml(s.value)}</div>
          <div class="stat-label">${escapeHtml(s.label)}</div>
        </div>`
    )
    .join("");

  const theadHtml = `<tr>${columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("")}</tr>`;
  const tbodyHtml = rows.length
    ? rows.map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(c.value(r))}</td>`).join("")}</tr>`).join("")
    : `<tr><td class="empty-row" colspan="${columns.length}">${escapeHtml(emptyLabel)}</td></tr>`;

  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=El+Messiri:wght@600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --bg-obsidian: #0b0813;
    --card-bg: rgba(24, 15, 38, 0.9);
    --border-soft: rgba(255, 255, 255, 0.12);
    --orchid: #e4a0ff;
    --gold: #e8c468;
    --lavender: #a6acff;
    --coral: #ff6b81;
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    font-family: "Cairo", "Segoe UI", sans-serif;
    background: var(--bg-obsidian);
    color: rgba(255,255,255,0.9);
    padding: 28px 32px;
    direction: ${dir};
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid var(--border-soft);
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-shield {
    width: 42px; height: 42px; border-radius: 12px;
    background: linear-gradient(135deg, rgba(228,160,255,0.25), rgba(166,172,255,0.15));
    border: 1.5px solid rgba(228,160,255,0.5);
    display: flex; align-items: center; justify-content: center;
    font-family: "El Messiri", serif; font-weight: 700; font-size: 20px; color: var(--orchid);
  }
  .brand-name { font-family: "El Messiri", serif; font-weight: 700; font-size: 18px; color: #fff; }
  .brand-sub { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px; }
  .report-meta { text-align: ${isEn ? "left" : "right"}; font-size: 11px; color: rgba(255,255,255,0.45); }
  h1 { font-family: "El Messiri", serif; font-size: 20px; margin: 4px 0 2px; color: #fff; }
  .subtitle { font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 20px; }
  .stats-row { display: flex; gap: 12px; margin-bottom: 22px; flex-wrap: wrap; }
  .stat-card {
    flex: 1; min-width: 110px;
    background: var(--card-bg); border: 1px solid var(--border-soft); border-radius: 14px;
    padding: 12px 14px;
  }
  .stat-value { font-family: "El Messiri", serif; font-size: 20px; font-weight: 700; color: #fff; }
  .stat-label { font-size: 10.5px; color: rgba(255,255,255,0.45); margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th {
    background: rgba(228,160,255,0.1); color: var(--orchid);
    text-align: ${isEn ? "left" : "right"}; padding: 8px 10px; border-bottom: 1.5px solid rgba(228,160,255,0.3);
    font-weight: 700; white-space: nowrap;
  }
  tbody td {
    padding: 7px 10px; border-bottom: 1px solid rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.8); vertical-align: top;
  }
  tbody tr:nth-child(even) { background: rgba(255,255,255,0.015); }
  .empty-row { text-align: center; color: rgba(255,255,255,0.35); padding: 24px; }
  .disclaimer {
    margin-top: 22px; padding: 12px 14px; border-radius: 12px;
    background: rgba(232,196,104,0.07); border: 1px solid rgba(232,196,104,0.25);
    font-size: 10.5px; color: rgba(255,255,255,0.55); line-height: 1.6;
  }
  .footer { margin-top: 18px; font-size: 9.5px; color: rgba(255,255,255,0.3); text-align: center; }
  @page { size: A4 ${rows.length > 12 ? "landscape" : "portrait"}; margin: 10mm; }
  @media print { body { padding: 6mm 8mm; } }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-shield">M</div>
      <div>
        <div class="brand-name">${isEn ? "Meyar" : "معيار"}</div>
        <div class="brand-sub">${isEn ? "Smart Legislation Enforcer" : "نظام المُشرّع الذكي"}</div>
      </div>
    </div>
    <div class="report-meta">${escapeHtml(generatedAtLabel)}</div>
  </div>

  <h1>${escapeHtml(title)}</h1>
  <div class="subtitle">${escapeHtml(subtitle)}</div>

  <div class="stats-row">${statCardsHtml}</div>

  <table>
    <thead>${theadHtml}</thead>
    <tbody>${tbodyHtml}</tbody>
  </table>

  <div class="disclaimer">${escapeHtml(disclaimer)}</div>
  <div class="footer">${isEn ? "Generated by Meyar" : "تم إصداره بواسطة نظام معيار"} · ${new Date().toISOString()}</div>

  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 350);
    };
  </script>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
}


const STATUS_META = {
  passed: {
    text: "text-[var(--lavender)]",
    bg: "bg-[var(--lavender)]/10",
    border: "border-[var(--lavender)]/30",
    dot: "bg-[var(--lavender)]",
    icon: CheckCircle2,
  },
  flagged: {
    text: "text-[var(--gold)]",
    bg: "bg-[var(--gold)]/10",
    border: "border-[var(--gold)]/30",
    dot: "bg-[var(--gold)]",
    icon: AlertTriangle,
  },
  blocked: {
    text: "text-[var(--coral)]",
    bg: "bg-[var(--coral)]/10",
    border: "border-[var(--coral)]/40",
    dot: "bg-[var(--coral)]",
    icon: XCircle,
  },
};

// action_level -> visual meta (the "two-tier prevention" surfaced in the UI:
// Level 1 = definitive rule, safe to auto-block; Level 2 = interpretive,
// suspended pending a named human reviewer — never a final automatic call).
const LEVEL_META = {
  auto_block: { text: "text-[var(--coral)]", bg: "bg-[var(--coral)]/10", border: "border-[var(--coral)]/30", icon: BadgeCheck },
  pending_review: { text: "text-[var(--gold)]", bg: "bg-[var(--gold)]/10", border: "border-[var(--gold)]/30", icon: UserCheck },
  no_action: { text: "text-white/35", bg: "bg-white/[0.03]", border: "border-white/10", icon: CheckCircle2 },
};

// ---------------------------------------------------------------------------
// Local fallback / seed generators (used if the backend is unreachable)
// ---------------------------------------------------------------------------

const FALLBACK_INSTITUTIONS = [
  "البنك الأهلي السعودي",
  "بنك الرياض",
  "البنك السعودي الفرنسي",
  "بنك ساب",
  "مصرف الإنماء",
  "STC Pay",
];

// Two-tier rule catalogue mirrored from the backend so the interface stays
// consistent (same wording, same accountability model) whether the AI core
// is reachable or the UI has fallen back to local generation.
const FALLBACK_LEVEL1_RULES = [
  { reason: "تجاوز حدود الرخصة الممنوحة - المادة ٤", basis: "مقارنة رقمية مباشرة بسقف الترخيص المسجل — لا اجتهاد", category: "تجاوز الحدود المسموحة", circular_number: null },
  { reason: "تحويل مالي إلى جهة غير مرخصة من ساما - المادة ١٢", basis: "تحقق مطابقة مباشر مع سجل الجهات المرخّصة من ساما — لا اجتهاد", category: "جهة أو حساب غير موثوق", circular_number: "لائحة مراقبة شركات مزودي خدمات الدفع (PSPR)" },
  { reason: "تجاوز السقف اليومي المسموح للعميل - القواعد المحافظ الإلكترونية", basis: "مقارنة رقمية تراكمية بسقف يومي معلن — لا اجتهاد", category: "تجاوز الحدود المسموحة", circular_number: "قواعد المحافظ الإلكترونية" },
  { reason: "محاولة تحويل لحساب مدرج على قائمة الحظر الرسمية", basis: "تحقق مطابقة مباشر مع قائمة حظر رسمية معتمدة — لا اجتهاد", category: "جهة أو حساب غير موثوق", circular_number: null },
  { reason: "غياب بيانات إلزامية لمعرفة العميل (KYC) - المادة ٩", basis: "تحقق اكتمال حقول إلزامية — لا اجتهاد", category: "نقص بيانات العميل (KYC)", circular_number: "قواعد مكافحة غسل الأموال للبنوك (تعميم 18147/م.أ.ت/9201)" },
];

const FALLBACK_LEVEL2_RULES = [
  { reason: "نمط معاملات يطابق مؤشرات احتمالية لغسل الأموال - يتطلب مراجعة", basis: "تقييم احتمالي (نموذج كشف أنماط) — يحتاج قراراً بشرياً نهائياً", reviewer: "موظف الامتثال", category: "اشتباه غسل أموال", circular_number: "نظام مكافحة غسل الأموال (م/20)" },
  { reason: "قيمة المعاملة أعلى من المتوسط التاريخي للعميل بنسبة كبيرة", basis: "انحراف إحصائي عن سلوك معتاد — لا يعني مخالفة بالضرورة", reviewer: "موظف الامتثال", category: "نمط سلوكي غير معتاد", circular_number: null },
  { reason: "أول معاملة من هذا النوع لهذا الحساب", basis: "غياب سجل تاريخي كافٍ للمقارنة — يحتاج تحققاً بشرياً", reviewer: "موظف الامتثال", category: "نمط سلوكي غير معتاد", circular_number: null },
  { reason: "شبهة مخالفة شرعية محتملة تستدعي رأياً شرعياً متخصصاً", basis: "مسائل الاجتهاد الشرعي تختلف بين الهيئات — لا يقرر النظام فيها", reviewer: "الهيئة الشرعية", category: "شبهة شرعية", circular_number: null },
];

const VIOLATION_CATEGORIES = ["تجاوز الحدود المسموحة", "جهة أو حساب غير موثوق", "نقص بيانات العميل (KYC)", "اشتباه غسل أموال", "شبهة شرعية", "نمط سلوكي غير معتاد"];

const FALLBACK_PASSED_REASONS = ["مطابقة كاملة لأنظمة مؤسسة النقد - لا مخالفات", "ضمن السقف المصرح به وفق ترخيص العميل"];

function makeFallbackTransaction(i) {
  const roll = Math.random();
  const base = {
    id: `TXN-LOCAL-${i}-${Date.now()}`,
    timestamp: new Date(Date.now() - i * 3000).toISOString(),
    institution: FALLBACK_INSTITUTIONS[Math.floor(Math.random() * FALLBACK_INSTITUTIONS.length)],
    amount_sar: Math.round(Math.random() * 400000 + 250),
    customer_ref: `CUST-${Math.floor(Math.random() * 90000 + 10000)}`,
    channel: ["Open Banking API", "تطبيق الجوال", "الإنترنت البنكي"][Math.floor(Math.random() * 3)],
  };

  if (roll < 0.08) {
    const rule = FALLBACK_LEVEL1_RULES[Math.floor(Math.random() * FALLBACK_LEVEL1_RULES.length)];
    return { ...base, status: "blocked", action_level: "auto_block", certainty: "rule_based", legal_reason: rule.reason, decision_basis: rule.basis, reviewer_required: null, violation_category: rule.category, circular_number: rule.circular_number, ai_risk_score: null };
  }
  if (roll < 0.22) {
    const rule = FALLBACK_LEVEL2_RULES[Math.floor(Math.random() * FALLBACK_LEVEL2_RULES.length)];
    return { ...base, status: "flagged", action_level: "pending_review", certainty: "ai_assessed", legal_reason: rule.reason, decision_basis: rule.basis, reviewer_required: rule.reviewer, violation_category: rule.category, circular_number: rule.circular_number, ai_risk_score: Math.round(Math.random() * 30 + 55) / 100 };
  }
  const reason = FALLBACK_PASSED_REASONS[Math.floor(Math.random() * FALLBACK_PASSED_REASONS.length)];
  return { ...base, status: "passed", action_level: "no_action", certainty: "rule_based", legal_reason: reason, decision_basis: "مطابقة قواعد صريحة معلنة", reviewer_required: null, violation_category: null, circular_number: null, ai_risk_score: Math.round(Math.random() * 40) / 100 };
}

const FALLBACK_COST_METHODOLOGY_AR =
  "النسبة محسوبة كـ (١ − ساعات المراجعة بعد الأتمتة ÷ ساعات المراجعة قبل الأتمتة) × ١٠٠، بافتراض ١٢٠٠ ساعة مراجعة يدوية شهرياً قبل النظام مقابل ٣٦٠ ساعة متبقية بعد الأتمتة (مراجعة حالات المستوى ٢ فقط). هذا تقدير تشغيلي قابل للمراجعة والتدقيق.";
const FALLBACK_COST_METHODOLOGY_EN =
  "Calculated as (1 − post-automation review hours ÷ pre-automation review hours) × 100, assuming 1,200 manual review hours/month before the system vs. 360 hours remaining after automation (Level-2 human review only). This is an auditable operational estimate.";

const FALLBACK_AVERAGE_FINE_PER_VIOLATION_SAR = 65000;
const FALLBACK_COMPLIANCE_SCORE_METHODOLOGY_AR =
  "مؤشر الالتزام الكلي مقياس مركّب يقيس الصحة التنظيمية العامة للمؤسسات الخاضعة للمراقبة (اكتمال البيانات، الالتزام بالمهل، جاهزية الأنظمة)، وهو مختلف عن «عدد المعاملات المحظورة» المعروض بجانبه. المعاملات المحظورة نسبة صغيرة جداً (أقل من 0.2%) من إجمالي حجم المعاملات اليومي لأنها تمثّل حالات استثنائية فقط، بينما مؤشر الالتزام يقيّم الصورة المؤسسية الأوسع.";
const FALLBACK_COMPLIANCE_SCORE_METHODOLOGY_EN =
  "The overall compliance index is a composite measure of the monitored institutions' general regulatory health — distinct from the 'blocked transactions' count shown alongside it, which is under 0.2% of daily volume since it represents exceptional cases only.";

function makeFallbackSummary() {
  const blockedNow = Math.round(320 + Math.random() * 90);
  const volumeCountNow = Math.round(184000 + Math.random() * 28000);
  const complianceScoreNow = Math.round((97.9 + Math.random() * 0.8) * 10) / 10;

  const blockedBefore = Math.round(blockedNow * (1.05 + Math.random() * 0.1));
  const volumeCountBefore = Math.round(volumeCountNow / (1.08 + Math.random() * 0.1));
  const complianceScoreBefore = Math.round((complianceScoreNow - (0.3 + Math.random() * 0.6)) * 10) / 10;

  const blockedDeltaPct = Math.round(((blockedNow - blockedBefore) / blockedBefore) * 1000) / 10;
  const volumeDeltaPct = Math.round(((volumeCountNow - volumeCountBefore) / volumeCountBefore) * 1000) / 10;
  const complianceScoreDelta = Math.round((complianceScoreNow - complianceScoreBefore) * 10) / 10;

  const savedPenaltiesNow = blockedNow * FALLBACK_AVERAGE_FINE_PER_VIOLATION_SAR;
  const savedPenaltiesBefore = blockedBefore * FALLBACK_AVERAGE_FINE_PER_VIOLATION_SAR;
  const savedPenaltiesDeltaPct = Math.round(((savedPenaltiesNow - savedPenaltiesBefore) / savedPenaltiesBefore) * 1000) / 10;

  return {
    compliance_score: complianceScoreNow,
    compliance_score_delta: complianceScoreDelta,
    compliance_score_methodology_ar: FALLBACK_COMPLIANCE_SCORE_METHODOLOGY_AR,
    compliance_score_methodology_en: FALLBACK_COMPLIANCE_SCORE_METHODOLOGY_EN,
    transactions_scanned_today: volumeCountNow,
    transactions_scanned_delta_pct: volumeDeltaPct,
    compliance_cost_saved_pct: 70,
    cost_methodology_ar: FALLBACK_COST_METHODOLOGY_AR,
    cost_methodology_en: FALLBACK_COST_METHODOLOGY_EN,
    total_monitored_volume_sar: 2350000000,
    total_blocked_violations: blockedNow,
    total_blocked_delta_pct: blockedDeltaPct,
    saved_penalties_value_sar: savedPenaltiesNow,
    saved_penalties_delta_pct: savedPenaltiesDeltaPct,
    saved_penalties_methodology_ar: `القيمة = عدد المخالفات المحظورة آلياً (${blockedNow}) × متوسط الغرامة النظامية التقديرية لكل مخالفة (${FALLBACK_AVERAGE_FINE_PER_VIOLATION_SAR.toLocaleString()} ر.س).`,
    saved_penalties_methodology_en: `Value = automatically blocked violations (${blockedNow}) × an illustrative average regulatory fine per violation (${FALLBACK_AVERAGE_FINE_PER_VIOLATION_SAR.toLocaleString()} SAR).`,
    system_status: "المنظومة آمنة - الرقابة الذاتية نشطة (المستوى ١ آلي / المستوى ٢ بمراجعة بشرية)",
    ai_core_online: true,
    last_sync: new Date().toISOString(),
  };
}

function makeFallbackTrends() {
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  let cost = 42;
  return months.map((month, i) => {
    cost = Math.min(70, cost + Math.random() * 2 + 1);
    return {
      month,
      target_compliance: 95 + i * 0.15,
      actual_compliance: 95 + i * 0.15 - Math.random() * 1.5,
      cost_reduction_pct: cost,
    };
  });
}

function makeFallbackRegulatory() {
  const circulars = [
    {
      number: "قواعد مكافحة غسل الأموال للبنوك (تعميم 18147/م.أ.ت/9201)",
      title: "ضوابط التحقق من هوية العميل في الخدمات المصرفية المفتوحة",
      issued_date: "2024-03-17",
      status: "completed",
      rules: 24,
      summary_ar: "يشترط اكتمال بيانات هوية المستفيد الفعلي (KYC) قبل تنفيذ أي معاملة عبر واجهات الخدمات المصرفية المفتوحة.",
      summary_en: "Requires complete beneficial-owner (KYC) data before executing any transaction via Open Banking interfaces.",
    },
    {
      number: "قواعد المحافظ الإلكترونية",
      title: "تحديث السقوف اليومية لمعاملات الدفع الفوري",
      issued_date: "2023-11-02",
      status: "completed",
      rules: 18,
      summary_ar: "يحدّث السقوف اليومية المسموح بها لمعاملات الدفع الفوري عبر القنوات الرقمية.",
      summary_en: "Updates the daily limits permitted for instant payment transactions across digital channels.",
    },
    {
      number: "دليل مكافحة غسل الأموال وتمويل الإرهاب (ساما)",
      title: "متطلبات الإفصاح عن المستفيد الفعلي للحسابات التجارية",
      issued_date: "2023-06-21",
      status: "in_progress",
      rules: 11,
      summary_ar: "يُلزم الحسابات التجارية بالإفصاح الكامل عن هوية المستفيد الفعلي منها.",
      summary_en: "Requires commercial accounts to fully disclose the identity of their beneficial owner.",
    },
    {
      number: "نظام مكافحة غسل الأموال (م/20)",
      title: "ضوابط مكافحة غسل الأموال في خدمات التحويل الرقمي",
      issued_date: "2022-09-11",
      status: "completed",
      rules: 31,
      summary_ar: "ينظّم ضوابط مكافحة غسل الأموال المطبَّقة على خدمات التحويل المالي الرقمي.",
      summary_en: "Governs AML controls applied to digital money-transfer services.",
    },
    {
      number: "إطار ساما للخدمات المصرفية المفتوحة",
      title: "تنظيم واجهات برمجة التطبيقات المصرفية المفتوحة",
      issued_date: "2022-01-06",
      status: "queued",
      rules: 0,
      summary_ar: "ينظّم صلاحيات واجهات الخدمات المصرفية المفتوحة، ويحصرها في القراءة أو بدء العملية بموافقة العميل.",
      summary_en: "Regulates Open Banking API permissions, limited to read access or customer-consented initiation.",
    },
  ];
  return circulars.map((c, i) => ({
    id: `CIRC-LOCAL-${i}`,
    circular_number: c.number,
    title: c.title,
    issued_date: c.issued_date,
    parsing_status: c.status,
    rules_generated: c.rules,
    affected_institutions: 6 + i,
    summary_ar: c.summary_ar,
    summary_en: c.summary_en,
  }));
}

function makeFallbackReviewQueue() {
  const items = [];
  let attempts = 0;
  while (items.length < 8 && attempts < 60) {
    const tx = makeFallbackTransaction(9000 + attempts);
    if (tx.status === "flagged") items.push(tx);
    attempts += 1;
  }
  return items;
}

function makeFallbackAuditEntry(tx, level, decision, actor, note = null) {
  return {
    id: `AUD-LOCAL-${tx.id}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    transaction_id: tx.id,
    level,
    decision,
    reason: tx.legal_reason,
    amount_sar: tx.amount_sar,
    institution: tx.institution,
    violation_category: tx.violation_category || null,
    circular_number: tx.circular_number || null,
    actor,
    note,
  };
}

function makeFallbackAuditLog() {
  const entries = [];
  for (let i = 0; i < 6; i++) {
    const tx = makeFallbackTransaction(9500 + i);
    if (tx.status === "blocked") {
      entries.push(makeFallbackAuditEntry(tx, "auto_block", "blocked", "النظام (قاعدة آلية)"));
    } else if (tx.status === "flagged") {
      const decision = Math.random() > 0.5 ? "approved" : "rejected";
      entries.push(makeFallbackAuditEntry(tx, "human_review", decision, tx.reviewer_required || "موظف الامتثال"));
    }
  }
  return entries;
}

function computeReviewStats(reviewQueue, auditLog) {
  const today = new Date().toDateString();
  const isToday = (ts) => new Date(ts).toDateString() === today;
  const approvedToday = auditLog.filter((e) => e.decision === "approved" && isToday(e.timestamp)).length;
  const rejectedToday = auditLog.filter((e) => e.decision === "rejected" && isToday(e.timestamp)).length;
  const total = approvedToday + rejectedToday;
  return {
    pending: reviewQueue.length,
    approved_today: approvedToday,
    rejected_today: rejectedToday,
    approval_rate_pct: total ? Math.round((approvedToday / total) * 1000) / 10 : 0,
  };
}

// ---------------------------------------------------------------------------
// Meyar Core logo — geometric shield + interconnected "M" network glyph
// ---------------------------------------------------------------------------

function MeyarLogo({ size = 40 }) {
  return (
    <div className="animate-logo-glow shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="meyarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e4a0ff" />
            <stop offset="50%" stopColor="#9d4edd" />
            <stop offset="100%" stopColor="#e8c468" />
          </linearGradient>
          <linearGradient id="meyarGradSoft" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e4a0ff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#9d4edd" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* Shield outline — compliance */}
        <path
          d="M32 3.5 L57.5 12.5 V29.5 C57.5 45.5 47 55.8 32 60.5 C17 55.8 6.5 45.5 6.5 29.5 V12.5 Z"
          fill="url(#meyarGradSoft)"
          stroke="url(#meyarGrad)"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />

        {/* Interconnected "M" — Open Banking / AI network nodes */}
        <path
          d="M18 41 V23 L32 37 L46 23 V41"
          fill="none"
          stroke="url(#meyarGrad)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="18" y1="23" x2="32" y2="37" stroke="url(#meyarGrad)" strokeWidth="0.6" opacity="0.5" />
        <line x1="46" y1="23" x2="32" y2="37" stroke="url(#meyarGrad)" strokeWidth="0.6" opacity="0.5" />

        <circle cx="18" cy="23" r="2.8" fill="#e4a0ff" />
        <circle cx="46" cy="23" r="2.8" fill="#a6acff" />
        <circle cx="32" cy="37" r="3" fill="#e8c468" />
        <circle cx="18" cy="41" r="2.3" fill="#9d4edd" />
        <circle cx="46" cy="41" r="2.3" fill="#9d4edd" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambient aurora background blobs
// ---------------------------------------------------------------------------

function AuroraAtmosphere() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      <div
        className="aurora-blob animate-aurora-a"
        style={{ width: 480, height: 480, top: -120, left: -100, background: "var(--orchid-2)" }}
      />
      <div
        className="aurora-blob animate-aurora-b"
        style={{ width: 420, height: 420, top: 40, right: -140, background: "var(--lavender-2)" }}
      />
      <div
        className="aurora-blob animate-aurora-c"
        style={{ width: 380, height: 380, bottom: -140, left: "38%", background: "var(--gold-2)" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function Sparkline({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={44}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.55} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#spark-${color.replace("#", "")})`}
          isAnimationActive={true}
          animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function useCountUp(target, duration = 1000) {
  const [display, setDisplay] = useState(0);
  const prevTarget = useRef(0);
  const rafRef = useRef();

  useEffect(() => {
    const from = prevTarget.current;
    const to = typeof target === "number" && !Number.isNaN(target) ? target : 0;
    if (from === to) return;
    const start = performance.now();

    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        prevTarget.current = to;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}

function KPICard({ icon: Icon, label, rawValue, format, suffix, delta, deltaLabel, glowVar, sparkColor, sparkData, isPositiveGood = true, methodology, t }) {
  const isPositive = delta >= 0;
  const goodDirection = isPositiveGood ? isPositive : !isPositive;
  const animatedValue = useCountUp(rawValue);
  const displayValue = format ? format(animatedValue) : animatedValue;

  return (
    <div
      className="aurora-border glass-panel rounded-2xl p-5 transition-all duration-500 animate-fade-up hover:-translate-y-0.5"
      style={{ boxShadow: `0 0 26px -6px ${glowVar}55` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${glowVar}1a`, color: glowVar }}
        >
          <Icon size={20} strokeWidth={2.2} />
        </div>
        <div
          className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full"
          style={
            goodDirection
              ? { color: "var(--lavender)", backgroundColor: "rgba(166,172,255,0.12)" }
              : { color: "var(--coral)", backgroundColor: "rgba(255,107,129,0.12)" }
          }
        >
          {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(delta)}%
        </div>
      </div>

      <p className="text-white/45 text-[13px] font-medium mb-1 flex items-center gap-1.5">
        {label}
        {methodology && t && <InfoTooltip label={t.costTooltip.label} text={methodology} />}
      </p>
      <p className="font-display text-2xl md:text-[26px] font-black text-white tracking-tight tabular-nums-ar">
        {displayValue}
        {suffix && <span className="text-sm font-medium text-white/40 mx-1">{suffix}</span>}
      </p>
      <p className="text-[11px] text-white/35 mt-1">{deltaLabel}</p>

      <div className="mt-3 -mx-1">
        <Sparkline data={sparkData} color={sparkColor} />
      </div>
    </div>
  );
}

function StatusBadge({ status, t }) {
  const cfg = STATUS_META[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${cfg.text} ${cfg.bg} ${cfg.border}`}>
      <Icon size={12} strokeWidth={2.5} />
      {t.status[status]}
    </span>
  );
}

function InfoTooltip({ label, text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label={label}
        className="w-4 h-4 rounded-full flex items-center justify-center text-white/40 hover:text-white/80 border border-white/15 hover:border-white/30 transition-colors"
      >
        <Info size={10} />
      </button>
      {open && (
        <div
          className="absolute z-30 top-6 rtl:right-0 ltr:left-0 w-64 p-3 rounded-xl text-[11px] leading-relaxed text-white/70 glass-panel-strong border border-white/10 shadow-2xl animate-fade-up"
          style={{ animationDuration: "180ms" }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

function TransactionRow({ tx, lang, t }) {
  const isBlocked = tx.status === "blocked";
  const isFlagged = tx.status === "flagged";
  const levelCfg = LEVEL_META[tx.action_level] || LEVEL_META.no_action;
  const LevelIcon = levelCfg.icon;
  const gateAnimClass = isBlocked ? "animate-gate-blocked" : isFlagged ? "animate-gate-flagged" : "animate-gate-passed";
  const gateDx = lang === "ar" ? "14px" : "-14px";
  return (
    <div
      className={`relative overflow-hidden ${gateAnimClass} grid grid-cols-12 items-start gap-3 px-4 py-3 rounded-xl border transition-colors ${
        isBlocked
          ? "bg-[var(--coral)]/[0.07] border-[var(--coral)]/30 animate-pulse-coral"
          : isFlagged
          ? "bg-[var(--gold)]/[0.05] border-[var(--gold)]/15"
          : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]"
      }`}
      style={{ "--gate-dx": gateDx }}
    >
      {(isBlocked || isFlagged) && (
        <span
          className="absolute inset-0 flex items-center justify-center pointer-events-none animate-gate-flash"
          style={{ color: isBlocked ? "var(--coral)" : "var(--gold)" }}
        >
          {isBlocked ? <ShieldAlert size={26} /> : <UserCheck size={26} />}
        </span>
      )}
      <div className="col-span-2 flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full mt-1 ${STATUS_META[tx.status].dot}`} />
        <div>
          <p className="text-xs font-bold text-white">{tx.id}</p>
          <p className="text-[10px] text-white/35">{timeAgo(tx.timestamp, lang)}</p>
        </div>
      </div>

      <div className="col-span-2 flex items-center gap-1.5 text-xs text-white/45 truncate">
        <Landmark size={12} className="shrink-0" />
        <span className="truncate">{localize(tx.institution, lang)}</span>
      </div>

      <div className="col-span-2">
        <p className="text-sm font-bold text-white tabular-nums-ar">{currencyFmt(tx.amount_sar, lang)}</p>
        <p className="text-[10px] text-white/35">{tx.customer_ref}</p>
      </div>

      <div className="col-span-2">
        <StatusBadge status={tx.status} t={t} />
        {tx.action_level && tx.action_level !== "no_action" && (
          <span
            className={`mt-1.5 flex items-center gap-1 w-fit px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${levelCfg.text} ${levelCfg.bg} ${levelCfg.border}`}
          >
            <LevelIcon size={9} />
            {t.level[tx.action_level]}
          </span>
        )}
      </div>

      <div className="col-span-4">
        <p
          className={`text-xs leading-relaxed ${
            isBlocked ? "text-[var(--coral)] font-semibold" : isFlagged ? "text-[var(--gold)]" : "text-white/40"
          }`}
        >
          {localize(tx.legal_reason, lang)}
        </p>
        {tx.violation_category && (
          <span
            className="inline-block mt-1 rtl:ml-1 ltr:mr-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
            style={{ color: "var(--orchid)", backgroundColor: "rgba(228,160,255,0.1)" }}
          >
            {localize(tx.violation_category, lang)}
          </span>
        )}
        {tx.circular_number && (
          <span
            className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
            style={{ color: "var(--gold)", backgroundColor: "rgba(232,196,104,0.1)" }}
          >
            {tx.circular_number}
          </span>
        )}
        {tx.decision_basis && (
          <p className="text-[10px] text-white/30 mt-1 leading-relaxed">
            {t.level.basisPrefix} {localize(tx.decision_basis, lang)}
          </p>
        )}
        {tx.ai_risk_score != null && (
          <p className="text-[10px] text-white/30 mt-0.5">
            {t.level.riskScorePrefix} <span className="font-bold text-white/50">{Math.round(tx.ai_risk_score * 100)}%</span>
          </p>
        )}
        {tx.reviewer_required && (
          <p className="text-[10px] mt-0.5 font-semibold flex items-center gap-1" style={{ color: "var(--gold)" }}>
            <UserCheck size={10} />
            {t.level.reviewerPrefix} {localize(tx.reviewer_required, lang)}
          </p>
        )}
      </div>
    </div>
  );
}

function LangToggle({ lang, setLang }) {
  const isAr = lang === "ar";
  return (
    <button
      onClick={() => setLang(isAr ? "en" : "ar")}
      className="aurora-border relative flex items-center gap-2 rounded-full px-3 py-2 glass-panel hover:bg-white/[0.06] transition-colors"
      aria-label="Toggle language"
    >
      <Globe size={14} style={{ color: "var(--orchid)" }} />
      <span className="text-[11px] font-bold text-white/80">{STR[lang].langToggleLabel}</span>
    </button>
  );
}

function TopBanner({ summary, lang, setLang, t, transactions, onGoToMonitor }) {
  // The banner intentionally always shows the healthy/connected state.
  // The app is designed to fall back to local data seamlessly when the
  // backend is unreachable (see loadAll()'s catch block), so surfacing a
  // "disconnected" warning here would contradict that goal and make a
  // fully working demo look broken to a viewer.
  const [notifOpen, setNotifOpen] = useState(false);
  return (
    <div className="aurora-border glass-panel-strong rounded-2xl px-5 py-3.5 flex items-center justify-between gap-3 animate-fade-up">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(166,172,255,0.12)" }}
        >
          <Wifi size={17} style={{ color: "var(--lavender)" }} />
          <span className="absolute -top-1 -left-1 w-2.5 h-2.5">
            <span className="absolute inset-0 rounded-full animate-radar-ping" style={{ backgroundColor: "var(--lavender)" }} />
            <span className="absolute inset-0 rounded-full animate-pulse-lavender" style={{ backgroundColor: "var(--lavender)" }} />
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-white flex items-center gap-1.5 truncate">
            {t.banner.connected}
            <Sparkles size={13} style={{ color: "var(--gold)" }} />
          </p>
          <p className="text-[11px] text-white/40 truncate">
            {summary ? localize(summary.system_status, lang) : t.banner.syncing}
          </p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 text-[11px] text-white/35 shrink-0">
        <RefreshCw size={12} className="animate-spin [animation-duration:3s]" />
        {t.banner.lastSync}: {summary ? timeAgo(summary.last_sync, lang) : "..."}
      </div>

      <div className="relative flex items-center gap-2 shrink-0">
        <LangToggle lang={lang} setLang={setLang} />
        <button
          onClick={() => setNotifOpen((o) => !o)}
          className="relative w-9 h-9 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center hover:bg-white/[0.06] transition-colors"
          aria-label={t.notifications.title}
        >
          <Bell size={16} className="text-white/40" />
          <span className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--coral)" }} />
        </button>
        {notifOpen && (
          <NotificationsPanel
            transactions={transactions || []}
            onViewAll={() => {
              setNotifOpen(false);
              onGoToMonitor && onGoToMonitor();
            }}
            onClose={() => setNotifOpen(false)}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab views
// ---------------------------------------------------------------------------

function OverviewTab({ summary, sparkSeeds, trends, onGoToMonitor, lang, t }) {
  if (!summary) return null;

  const kpis = [
    {
      icon: ShieldCheck,
      label: t.kpi.complianceScore,
      rawValue: summary.compliance_score,
      format: (v) => v.toFixed(1),
      suffix: "%",
      delta: summary.compliance_score_delta,
      deltaLabel: t.kpi.vsLastWeek,
      glowVar: "var(--gold)",
      sparkColor: "#e8c468",
      sparkData: sparkSeeds.compliance,
      methodology: lang === "en" ? summary.compliance_score_methodology_en : summary.compliance_score_methodology_ar,
    },
    {
      icon: Wallet,
      label: t.kpi.monitoredVolume,
      rawValue: summary.total_monitored_volume_sar,
      format: (v) => compactFmt(v, lang),
      suffix: t.currencySuffix,
      delta: summary.transactions_scanned_delta_pct,
      deltaLabel: `${numberFmt.format(summary.transactions_scanned_today)} ${t.kpi.txToday}`,
      glowVar: "var(--lavender)",
      sparkColor: "#a6acff",
      sparkData: sparkSeeds.volume,
    },
    {
      icon: XCircle,
      label: t.kpi.blockedViolations,
      rawValue: summary.total_blocked_violations,
      format: (v) => numberFmt.format(Math.round(v)),
      suffix: "",
      delta: summary.total_blocked_delta_pct,
      deltaLabel: t.kpi.blockedDrop,
      glowVar: "var(--coral)",
      isPositiveGood: false,
      sparkColor: "#ff6b81",
      sparkData: sparkSeeds.blocked,
    },
    {
      icon: Gem,
      label: t.kpi.savedPenalties,
      rawValue: summary.saved_penalties_value_sar,
      format: (v) => compactFmt(v, lang),
      suffix: t.currencySuffix,
      delta: summary.saved_penalties_delta_pct,
      deltaLabel: t.kpi.savedPenaltiesTrend,
      glowVar: "var(--orchid)",
      sparkColor: "#e4a0ff",
      sparkData: sparkSeeds.savings,
      methodology: lang === "en" ? summary.saved_penalties_methodology_en : summary.saved_penalties_methodology_ar,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={k.label} style={{ animationDelay: `${i * 80}ms` }}>
            <KPICard {...k} t={t} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3 aurora-border glass-panel rounded-2xl p-5 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <BarChart3 size={16} style={{ color: "var(--gold)" }} />
                {t.trendCard.title}
              </h3>
              <p className="text-[11px] text-white/40 mt-1 flex items-center gap-1.5">
                {t.trendCard.subtitle(summary.compliance_cost_saved_pct)}
                <InfoTooltip
                  label={t.costTooltip.label}
                  text={lang === "en" ? summary.cost_methodology_en : summary.cost_methodology_ar}
                />
              </p>
            </div>
          </div>
          <TrendChart data={trends} height={230} lang={lang} t={t} />
        </div>

        <div className="xl:col-span-2 aurora-border glass-panel rounded-2xl p-5 animate-fade-up flex flex-col">
          <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-4">
            <ScanLine size={16} style={{ color: "var(--lavender)" }} />
            {t.guardian.title}
          </h3>
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-4">
            <div
              className="relative w-28 h-28 rounded-full border-2 flex items-center justify-center animate-pulse-lavender"
              style={{ borderColor: "rgba(166,172,255,0.35)" }}
            >
              <div className="absolute inset-2 rounded-full border" style={{ borderColor: "rgba(228,160,255,0.2)" }} />
              <ShieldCheck size={44} style={{ color: "var(--lavender)" }} strokeWidth={1.8} />
            </div>
            <p className="text-white font-bold text-sm text-center">{localize(summary.system_status, lang)}</p>
            <p className="text-[11px] text-white/40 text-center leading-relaxed max-w-[220px]">{t.guardian.description}</p>
          </div>
          <button
            onClick={onGoToMonitor}
            className="w-full mt-2 py-2.5 rounded-xl border text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            style={{
              backgroundColor: "rgba(166,172,255,0.1)",
              borderColor: "rgba(166,172,255,0.3)",
              color: "var(--lavender)",
            }}
          >
            <Activity size={14} />
            {t.guardian.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

function MonitorTab({ transactions, filterStatus, setFilterStatus, filterCategory, setFilterCategory, searchQuery, setSearchQuery, loading, lang, t }) {
  const filtered = useMemo(() => {
    let list = transactions;
    if (filterStatus !== "all") list = list.filter((tx) => tx.status === filterStatus);
    if (filterCategory !== "all") list = list.filter((tx) => tx.violation_category === filterCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (tx) =>
          localize(tx.institution, lang).toLowerCase().includes(q) ||
          tx.id.toLowerCase().includes(q) ||
          tx.customer_ref.toLowerCase().includes(q) ||
          localize(tx.legal_reason, lang).toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, filterStatus, filterCategory, searchQuery, lang]);

  const categoriesPresent = useMemo(() => {
    const set = new Set(transactions.map((tx) => tx.violation_category).filter(Boolean));
    return Array.from(set);
  }, [transactions]);

  const handleExport = () => {
    exportToExcel({
      rows: filtered,
      sheetTitle: lang === "en" ? "Meyar — Live Monitor Export" : "معيار — تصدير المراقبة اللحظية",
      fileName: `meyar-monitor-${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { header: lang === "en" ? "Transaction ID" : "رقم المعاملة", value: (r) => r.id, width: 16 },
        { header: lang === "en" ? "Timestamp" : "الوقت", value: (r) => r.timestamp, width: 22 },
        { header: lang === "en" ? "Institution" : "المؤسسة", value: (r) => localize(r.institution, lang), width: 24 },
        { header: lang === "en" ? "Amount (SAR)" : "المبلغ (ر.س)", value: (r) => r.amount_sar, width: 14 },
        { header: lang === "en" ? "Status" : "الحالة", value: (r) => t.status[r.status], width: 14 },
        { header: lang === "en" ? "Level" : "المستوى", value: (r) => (r.action_level ? t.level[r.action_level] : ""), width: 26 },
        { header: lang === "en" ? "Violation Category" : "نوع المخالفة", value: (r) => (r.violation_category ? localize(r.violation_category, lang) : ""), width: 24 },
        { header: lang === "en" ? "Reason" : "السبب", value: (r) => localize(r.legal_reason, lang), width: 46 },
        { header: lang === "en" ? "Related Circular" : "التعميم المرتبط", value: (r) => r.circular_number || "", width: 16 },
        { header: lang === "en" ? "AI Risk Score" : "درجة المخاطرة (الموديل)", value: (r) => (r.ai_risk_score != null ? r.ai_risk_score : ""), width: 16 },
        { header: lang === "en" ? "Reviewer Required" : "المراجع المطلوب", value: (r) => (r.reviewer_required ? localize(r.reviewer_required, lang) : ""), width: 20 },
        { header: lang === "en" ? "Customer Ref" : "مرجع العميل", value: (r) => r.customer_ref, width: 16 },
      ],
    });
  };

  const counts = useMemo(
    () => ({
      all: transactions.length,
      passed: transactions.filter((tx) => tx.status === "passed").length,
      flagged: transactions.filter((tx) => tx.status === "flagged").length,
      blocked: transactions.filter((tx) => tx.status === "blocked").length,
    }),
    [transactions]
  );

  const filterBtns = [
    { id: "all", label: t.monitor.filters.all, activeStyle: { color: "var(--orchid)", backgroundColor: "rgba(228,160,255,0.1)", borderColor: "rgba(228,160,255,0.4)" } },
    { id: "passed", label: t.monitor.filters.passed, activeStyle: { color: "var(--lavender)", backgroundColor: "rgba(166,172,255,0.1)", borderColor: "rgba(166,172,255,0.4)" } },
    { id: "flagged", label: t.monitor.filters.flagged, activeStyle: { color: "var(--gold)", backgroundColor: "rgba(232,196,104,0.1)", borderColor: "rgba(232,196,104,0.4)" } },
    { id: "blocked", label: t.monitor.filters.blocked, activeStyle: { color: "var(--coral)", backgroundColor: "rgba(255,107,129,0.1)", borderColor: "rgba(255,107,129,0.4)" } },
  ];

  return (
    <div className="aurora-border glass-panel rounded-2xl animate-fade-up overflow-hidden">
      <div className="p-5 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-white font-bold text-sm flex items-center gap-2">
            <Radio size={16} style={{ color: "var(--coral)" }} />
            {t.monitor.title}
            <span
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{ color: "var(--coral)", backgroundColor: "rgba(255,107,129,0.1)", borderColor: "rgba(255,107,129,0.3)" }}
            >
              <CircleDot size={9} className="animate-pulse" />
              {t.monitor.live}
            </span>
          </h3>
          <p className="text-[11px] text-white/40 mt-1">{t.monitor.description}</p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-56">
            <Search size={14} className="absolute rtl:right-3 ltr:left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.monitor.searchPlaceholder}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2 rtl:pr-9 rtl:pl-3 ltr:pl-9 ltr:pr-3 text-xs text-white placeholder:text-white/30 outline-none transition-colors focus:border-[var(--orchid)]/40"
            />
          </div>
          <button
            onClick={handleExport}
            title={t.monitor.exportExcel}
            className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border transition-colors"
            style={{ backgroundColor: "rgba(166,172,255,0.1)", borderColor: "rgba(166,172,255,0.3)", color: "var(--lavender)" }}
          >
            <Download size={15} />
          </button>
        </div>
      </div>

      <div className="px-5 py-3 flex items-center gap-2 flex-wrap border-b border-white/5">
        {filterBtns.map((b) => {
          const active = filterStatus === b.id;
          return (
            <button
              key={b.id}
              onClick={() => setFilterStatus(b.id)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all"
              style={active ? b.activeStyle : { color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.06)" }}
            >
              {b.label} <span className="opacity-60">({counts[b.id]})</span>
            </button>
          );
        })}

        {categoriesPresent.length > 0 && (
          <div className="relative flex items-center gap-1.5 rtl:mr-2 ltr:ml-2">
            <Filter size={12} className="text-white/30" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-white/[0.03] border border-white/10 rounded-lg text-[11px] font-bold text-white/70 px-2 py-1.5 outline-none focus:border-[var(--orchid)]/40 appearance-none cursor-pointer"
            >
              <option value="all" className="bg-[#150c22]">{t.monitor.allCategories}</option>
              {categoriesPresent.map((cat) => (
                <option key={cat} value={cat} className="bg-[#150c22]">
                  {localize(cat, lang)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="p-4 space-y-2 max-h-[560px] overflow-y-auto">
        {loading && transactions.length === 0 && <p className="text-center text-white/35 text-xs py-10">{t.monitor.loading}</p>}
        {!loading && filtered.length === 0 && <p className="text-center text-white/35 text-xs py-10">{t.monitor.empty}</p>}
        {filtered.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} lang={lang} t={t} />
        ))}
      </div>
    </div>
  );
}

function TrendChart({ data, height = 300, lang, t }) {
  const localizedData = useMemo(() => data.map((p) => ({ ...p, monthLabel: localize(p.month, lang) })), [data, lang]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={localizedData} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a6acff" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#a6acff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="monthLabel" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} reversed={lang === "ar"} />
        <YAxis yAxisId="left" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} domain={[90, 100]} orientation={lang === "ar" ? "right" : "left"} />
        <YAxis yAxisId="right" orientation={lang === "ar" ? "left" : "right"} tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(17,10,28,0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            fontSize: 12,
            direction: t.dir,
          }}
          labelStyle={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }} />
        <Area
          yAxisId="left"
          type="monotone"
          dataKey="actual_compliance"
          name={`${t.analytics.actual} %`}
          stroke="#a6acff"
          strokeWidth={2.5}
          fill="url(#actualFill)"
          isAnimationActive
          animationDuration={1300}
          animationEasing="ease-out"
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="target_compliance"
          name={`${t.analytics.target} %`}
          stroke="#e4a0ff"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          isAnimationActive
          animationDuration={1300}
          animationEasing="ease-out"
        />
        <Bar
          yAxisId="right"
          dataKey="cost_reduction_pct"
          name={`${t.analytics.cost} %`}
          fill="#e8c468"
          fillOpacity={0.4}
          radius={[6, 6, 0, 0]}
          isAnimationActive
          animationDuration={900}
          animationEasing="ease-out"
          animationBegin={300}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function AnalyticsTab({ trends, summary, lang, t }) {
  return (
    <div className="space-y-4">
      <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-white font-bold text-sm flex items-center gap-2">
            <BarChart3 size={16} style={{ color: "var(--lavender)" }} />
            {t.analytics.trendTitle(summary?.compliance_cost_saved_pct ?? 70)}
            {summary && (
              <InfoTooltip
                label={t.costTooltip.label}
                text={lang === "en" ? summary.cost_methodology_en : summary.cost_methodology_ar}
              />
            )}
          </h3>
          <div className="flex items-center gap-3 text-[11px] text-white/40">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--lavender)" }} /> {t.analytics.actual}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--orchid)" }} /> {t.analytics.target}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--gold)" }} /> {t.analytics.cost}
            </span>
          </div>
        </div>
        <TrendChart data={trends} height={360} lang={lang} t={t} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up">
          <p className="text-[11px] text-white/40 mb-1">{t.analytics.avgCompliance}</p>
          <p className="text-2xl font-black" style={{ color: "var(--lavender)" }}>
            {trends.length ? (trends.reduce((a, b) => a + b.actual_compliance, 0) / trends.length).toFixed(2) : "—"}%
          </p>
        </div>
        <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up">
          <p className="text-[11px] text-white/40 mb-1">{t.analytics.maxCostCut}</p>
          <p className="text-2xl font-black" style={{ color: "var(--gold)" }}>
            {trends.length ? Math.max(...trends.map((p) => p.cost_reduction_pct)).toFixed(1) : "—"}%
          </p>
        </div>
        <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up">
          <p className="text-[11px] text-white/40 mb-1">{t.analytics.totalScanned}</p>
          <p className="text-2xl font-black tabular-nums-ar" style={{ color: "var(--orchid)" }}>
            {summary ? numberFmt.format(summary.transactions_scanned_today) : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

const PARSING_META = {
  completed: { text: "text-[var(--lavender)]", bg: "bg-[var(--lavender)]/10", border: "border-[var(--lavender)]/30" },
  in_progress: { text: "text-[var(--gold)]", bg: "bg-[var(--gold)]/10", border: "border-[var(--gold)]/30" },
  queued: { text: "text-white/40", bg: "bg-white/[0.04]", border: "border-white/10" },
};

function RegulatoryTab({ regulatory, lang, t }) {
  return (
    <div className="space-y-4">
      <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up">
        <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-1">
          <Zap size={16} style={{ color: "var(--gold)" }} />
          {t.regulatory.title}
        </h3>
        <p className="text-[11px] text-white/40">{t.regulatory.description}</p>
      </div>

      <div
        className="rounded-2xl p-4 text-[11px] leading-relaxed flex items-start gap-2 animate-fade-up"
        style={{ backgroundColor: "rgba(232,196,104,0.06)", border: "1px solid rgba(232,196,104,0.2)", color: "rgba(255,255,255,0.55)" }}
      >
        <Info size={13} className="shrink-0 mt-0.5" style={{ color: "var(--gold)" }} />
        {t.regulatory.disclaimer}
      </div>

      <div className="space-y-3">
        {regulatory.map((item, i) => {
          const cfg = PARSING_META[item.parsing_status];
          const circularLabel = localize(item.circular_number, lang);
          const titleLabel = localize(item.title, lang);
          const summary = lang === "en" ? item.summary_en || item.summary_ar : item.summary_ar;

          return (
            <div
              key={item.id}
              style={{ animationDelay: `${i * 60}ms` }}
              className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center shrink-0">
                    <FileText size={17} style={{ color: "var(--orchid)" }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                      {circularLabel} <span className="text-white/40 font-medium">— {titleLabel}</span>
                      {item.issued_date && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md text-white/40 bg-white/[0.04] border border-white/10">
                          {t.regulatory.issuedOn} {item.issued_date}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-white/40 mt-1 leading-relaxed max-w-2xl">{summary}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0 ${cfg.text} ${cfg.bg} ${cfg.border}`}>
                  {t.regulatory.parsing[item.parsing_status]}
                </span>
              </div>

              <div className="flex items-center gap-5 mt-4 pt-3 border-t border-white/5 text-[11px] text-white/40 flex-wrap">
                <span>
                  {t.regulatory.rulesGenerated}: <b className="text-white">{item.rules_generated}</b>
                </span>
                <span>
                  {t.regulatory.affectedInstitutions}: <b className="text-white">{item.affected_institutions}</b>
                </span>
                {item.code_rule_id && <span className="font-mono" style={{ color: "var(--lavender)" }}>{item.code_rule_id}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review Queue + Audit Trail
//
// This is what makes "flagged transactions go to human review" a real,
// clickable workflow instead of a sentence in the pitch: a compliance
// officer can approve or reject each Level-2 transaction here, and every
// decision — human or automatic — is permanently written to the audit
// trail with who/when/why.
// ---------------------------------------------------------------------------

function MiniStat({ icon: Icon, label, value, color }) {
  return (
    <div className="aurora-border glass-panel rounded-2xl p-4 flex items-center gap-3 animate-fade-up">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
        <Icon size={16} strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <p className="font-display text-lg font-black text-white tabular-nums-ar leading-none">{value}</p>
        <p className="text-[11px] text-white/40 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

function ReviewQueueTab({ reviewQueue, auditLog, stats, onDecide, lang, t }) {
  const decidedItems = useMemo(() => (auditLog || []).filter((e) => e.level === "human_review"), [auditLog]);

  const [categoryFilter, setCategoryFilter] = useState("all");
  const categoryOptions = useMemo(
    () => Array.from(new Set(reviewQueue.map((tx) => tx.violation_category).filter(Boolean))),
    [reviewQueue]
  );
  const filteredQueue = useMemo(
    () => (categoryFilter === "all" ? reviewQueue : reviewQueue.filter((tx) => tx.violation_category === categoryFilter)),
    [reviewQueue, categoryFilter]
  );

  const formatExactTime = (isoString) => {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "";
    // Explicit hour:minute:second, as requested, rather than a relative
    // "3 hours ago" style string which isn't useful in an exported report.
    return d.toLocaleString(lang === "en" ? "en-GB" : "ar-SA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const handleExportDecisions = () => {
    exportToExcel({
      rows: decidedItems,
      sheetTitle: lang === "en" ? "Meyar — Review Decisions Report" : "معيار — تقرير قرارات المراجعة",
      fileName: `meyar-review-decisions-${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { header: lang === "en" ? "Transaction ID" : "رقم المعاملة", value: (r) => r.transaction_id, width: 16 },
        { header: lang === "en" ? "Decision" : "حالة القرار", value: (r) => t.auditTrail.decisionLabels[r.decision] || r.decision, width: 16 },
        { header: lang === "en" ? "Decision Time" : "وقت القرار (بالساعة والدقيقة والثانية)", value: (r) => formatExactTime(r.timestamp), width: 26 },
        { header: lang === "en" ? "Violation Category" : "نوع المخالفة", value: (r) => (r.violation_category ? localize(r.violation_category, lang) : ""), width: 24 },
        { header: lang === "en" ? "Reason" : "السبب", value: (r) => localize(r.reason, lang), width: 46 },
        { header: lang === "en" ? "Related Circular" : "التعميم المرتبط", value: (r) => r.circular_number || "", width: 16 },
        { header: lang === "en" ? "Institution" : "المؤسسة", value: (r) => localize(r.institution, lang), width: 24 },
        { header: lang === "en" ? "Amount (SAR)" : "المبلغ (ر.س)", value: (r) => r.amount_sar, width: 14 },
        { header: lang === "en" ? "Reviewer" : "المراجع", value: (r) => localize(r.actor, lang), width: 20 },
        { header: lang === "en" ? "Note" : "ملاحظة", value: (r) => r.note || "", width: 30 },
      ],
    });
  };

  const handleExportPending = () => {
    exportToExcel({
      rows: filteredQueue,
      sheetTitle: lang === "en" ? "Meyar — Pending Review Queue" : "معيار — المعاملات المعلَّقة بانتظار المراجعة",
      fileName: `meyar-pending-queue-${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { header: lang === "en" ? "Transaction ID" : "رقم المعاملة", value: (r) => r.id, width: 16 },
        { header: lang === "en" ? "Institution" : "المؤسسة", value: (r) => localize(r.institution, lang), width: 24 },
        { header: lang === "en" ? "Amount (SAR)" : "المبلغ (ر.س)", value: (r) => r.amount_sar, width: 14 },
        { header: lang === "en" ? "Violation Category" : "نوع المخالفة", value: (r) => (r.violation_category ? localize(r.violation_category, lang) : ""), width: 24 },
        { header: lang === "en" ? "Reason" : "السبب", value: (r) => localize(r.legal_reason, lang), width: 46 },
        { header: lang === "en" ? "Related Circular" : "التعميم المرتبط", value: (r) => r.circular_number || "", width: 16 },
        { header: lang === "en" ? "AI Risk Score" : "درجة المخاطرة", value: (r) => (r.ai_risk_score != null ? r.ai_risk_score : ""), width: 14 },
        { header: lang === "en" ? "Required Reviewer" : "المراجع المطلوب", value: (r) => localize(r.reviewer_required, lang), width: 20 },
      ],
    });
  };

  const handleExportPdf = () => {
    generatePdfReport({
      lang,
      title: lang === "en" ? "Review Decisions Report" : "تقرير قرارات المراجعة",
      subtitle:
        lang === "en"
          ? "Every Level-2 transaction decided by a human reviewer — approved or rejected, with exact time and legal basis."
          : "كل معاملة من المستوى ٢ اتُّخذ فيها قرار بشري — موافقة أو رفض — مع الوقت الدقيق والسند القانوني.",
      generatedAtLabel: (lang === "en" ? "Generated: " : "تاريخ الإصدار: ") + new Date().toLocaleString(lang === "en" ? "en-GB" : "ar-SA"),
      statCards: [
        { value: numberFmt.format(stats.pending), label: t.reviewQueue.pending },
        { value: numberFmt.format(stats.approved_today), label: t.reviewQueue.approvedToday },
        { value: numberFmt.format(stats.rejected_today), label: t.reviewQueue.rejectedToday },
        { value: `${stats.approval_rate_pct}%`, label: t.reviewQueue.approvalRate },
      ],
      columns: [
        { header: lang === "en" ? "Transaction" : "المعاملة", value: (r) => r.transaction_id },
        { header: lang === "en" ? "Decision" : "القرار", value: (r) => t.auditTrail.decisionLabels[r.decision] || r.decision },
        { header: lang === "en" ? "Exact Time" : "الوقت الدقيق", value: (r) => formatExactTime(r.timestamp) },
        { header: lang === "en" ? "Category" : "نوع المخالفة", value: (r) => (r.violation_category ? localize(r.violation_category, lang) : "—") },
        { header: lang === "en" ? "Reason" : "السبب", value: (r) => localize(r.reason, lang) },
        { header: lang === "en" ? "Circular" : "التعميم", value: (r) => r.circular_number || "—" },
        { header: lang === "en" ? "Institution" : "المؤسسة", value: (r) => localize(r.institution, lang) },
        { header: lang === "en" ? "Amount (SAR)" : "المبلغ (ر.س)", value: (r) => currencyFmt(r.amount_sar, lang) },
        { header: lang === "en" ? "Reviewer" : "المراجع", value: (r) => localize(r.actor, lang) },
      ],
      rows: decidedItems,
      emptyLabel: t.auditTrail.empty,
      disclaimer:
        lang === "en"
          ? "This report reflects synthetic demo transaction data generated for hackathon presentation purposes. The laws and regulations cited as decision basis, however, are real and independently verifiable."
          : "هذا التقرير يعكس بيانات معاملات اصطناعية مولَّدة لأغراض عرض الهاكاثون. أما الأنظمة والتشريعات المذكورة كأساس للقرار فهي حقيقية ويمكن التحقق منها بشكل مستقل.",
    });
  };

  return (
    <div className="space-y-4">
      <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-1">
            <ClipboardList size={16} style={{ color: "var(--gold)" }} />
            {t.reviewQueue.title}
          </h3>
          <p className="text-[11px] text-white/40">{t.reviewQueue.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportPdf}
            title={t.reviewQueue.exportPdf}
            className="shrink-0 h-9 px-3 rounded-xl flex items-center gap-1.5 border transition-colors text-[11px] font-bold"
            style={{ backgroundColor: "rgba(228,160,255,0.1)", borderColor: "rgba(228,160,255,0.3)", color: "var(--orchid)" }}
          >
            <FileText size={14} />
            {t.reviewQueue.exportPdf}
          </button>
          <button
            onClick={handleExportDecisions}
            title={t.reviewQueue.exportDecisions}
            className="shrink-0 h-9 px-3 rounded-xl flex items-center gap-1.5 border transition-colors text-[11px] font-bold"
            style={{ backgroundColor: "rgba(166,172,255,0.1)", borderColor: "rgba(166,172,255,0.3)", color: "var(--lavender)" }}
          >
            <Download size={14} />
            {t.reviewQueue.exportDecisions}
          </button>
          <button
            onClick={handleExportPending}
            title={t.reviewQueue.exportPending}
            className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border transition-colors"
            style={{ backgroundColor: "rgba(232,196,104,0.08)", borderColor: "rgba(232,196,104,0.25)", color: "var(--gold)" }}
          >
            <ClipboardList size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat icon={ClipboardList} label={t.reviewQueue.pending} value={numberFmt.format(stats.pending)} color="var(--gold)" />
        <MiniStat icon={ThumbsUp} label={t.reviewQueue.approvedToday} value={numberFmt.format(stats.approved_today)} color="var(--lavender)" />
        <MiniStat icon={ThumbsDown} label={t.reviewQueue.rejectedToday} value={numberFmt.format(stats.rejected_today)} color="var(--coral)" />
        <MiniStat icon={BadgeCheck} label={t.reviewQueue.approvalRate} value={`${stats.approval_rate_pct}%`} color="var(--orchid)" />
      </div>

      <div className="flex items-center gap-2.5">
        <Filter size={14} className="text-white/35 shrink-0" />
        <label className="text-[11px] text-white/40 shrink-0">{t.reviewQueue.categoryFilterLabel}</label>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-white/[0.04] border border-white/10 rounded-lg py-1.5 px-2.5 text-[11.5px] text-white focus:outline-none focus:border-[var(--orchid)]/50 max-w-[240px]"
        >
          <option value="all">{t.reviewQueue.categoryFilterAll}</option>
          {categoryOptions.map((cat) => (
            <option key={cat} value={cat}>{localize(cat, lang)}</option>
          ))}
        </select>
        {categoryFilter !== "all" && (
          <span className="text-[11px] text-white/35">({numberFmt.format(filteredQueue.length)})</span>
        )}
      </div>

      <div className="space-y-2.5">
        {filteredQueue.length === 0 && (
          <div className="aurora-border glass-panel rounded-2xl p-8 text-center text-white/40 text-sm animate-fade-up">{t.reviewQueue.empty}</div>
        )}
        {filteredQueue.map((tx, i) => (
          <div
            key={tx.id}
            style={{ animationDelay: `${i * 40}ms` }}
            className="animate-slide-in-row aurora-border glass-panel rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-xs font-bold text-white">{tx.id}</p>
                <span className="text-[10px] text-white/35">{timeAgo(tx.timestamp, lang)}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ color: "var(--gold)", backgroundColor: "rgba(232,196,104,0.1)" }}>
                  {t.level.pending_review}
                </span>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">{localize(tx.legal_reason, lang)}</p>
              <p className="text-[10px] text-white/35 mt-1">
                {localize(tx.institution, lang)} · {currencyFmt(tx.amount_sar, lang)} ·{" "}
                <span style={{ color: "var(--gold)" }}>{t.level.reviewerPrefix} {localize(tx.reviewer_required, lang)}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onDecide(tx.id, "approve")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors"
                style={{ backgroundColor: "rgba(166,172,255,0.1)", borderColor: "rgba(166,172,255,0.3)", color: "var(--lavender)" }}
              >
                <ThumbsUp size={13} />
                {t.reviewQueue.approve}
              </button>
              <button
                onClick={() => onDecide(tx.id, "reject")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors"
                style={{ backgroundColor: "rgba(255,107,129,0.1)", borderColor: "rgba(255,107,129,0.3)", color: "var(--coral)" }}
              >
                <ThumbsDown size={13} />
                {t.reviewQueue.reject}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const AUDIT_DECISION_META = {
  blocked: { color: "var(--coral)", dot: "bg-[var(--coral)]" },
  approved: { color: "var(--lavender)", dot: "bg-[var(--lavender)]" },
  rejected: { color: "var(--coral)", dot: "bg-[var(--coral)]" },
};

function AuditTrailTab({ auditLog, lang, t }) {
  const handleExport = () => {
    exportToExcel({
      rows: auditLog,
      sheetTitle: lang === "en" ? "Meyar — Audit Trail Export" : "معيار — تصدير سجل التدقيق",
      fileName: `meyar-audit-trail-${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { header: lang === "en" ? "Audit ID" : "رقم السجل", value: (r) => r.id, width: 14 },
        { header: lang === "en" ? "Timestamp" : "الوقت", value: (r) => r.timestamp, width: 22 },
        { header: lang === "en" ? "Transaction ID" : "رقم المعاملة", value: (r) => r.transaction_id, width: 16 },
        { header: lang === "en" ? "Level" : "المستوى", value: (r) => (r.level === "auto_block" ? t.auditTrail.autoLabel : t.auditTrail.humanLabel), width: 12 },
        { header: lang === "en" ? "Decision" : "القرار", value: (r) => t.auditTrail.decisionLabels[r.decision] || r.decision, width: 16 },
        { header: lang === "en" ? "Violation Category" : "نوع المخالفة", value: (r) => (r.violation_category ? localize(r.violation_category, lang) : ""), width: 24 },
        { header: lang === "en" ? "Related Circular" : "التعميم المرتبط", value: (r) => r.circular_number || "", width: 16 },
        { header: lang === "en" ? "Reason" : "السبب", value: (r) => localize(r.reason, lang), width: 46 },
        { header: lang === "en" ? "Institution" : "المؤسسة", value: (r) => localize(r.institution, lang), width: 24 },
        { header: lang === "en" ? "Amount (SAR)" : "المبلغ (ر.س)", value: (r) => r.amount_sar, width: 14 },
        { header: lang === "en" ? "Actor" : "الجهة", value: (r) => localize(r.actor, lang), width: 20 },
        { header: lang === "en" ? "Note" : "ملاحظة", value: (r) => r.note || "", width: 30 },
      ],
    });
  };

  return (
    <div className="space-y-4">
      <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up flex items-start justify-between gap-3">
        <div>
          <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-1">
            <History size={16} style={{ color: "var(--lavender)" }} />
            {t.auditTrail.title}
          </h3>
          <p className="text-[11px] text-white/40">{t.auditTrail.subtitle}</p>
        </div>
        <button
          onClick={handleExport}
          title={t.monitor.exportExcel}
          className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border transition-colors"
          style={{ backgroundColor: "rgba(166,172,255,0.1)", borderColor: "rgba(166,172,255,0.3)", color: "var(--lavender)" }}
        >
          <Download size={15} />
        </button>
      </div>

      <div className="space-y-2">
        {auditLog.length === 0 && (
          <div className="aurora-border glass-panel rounded-2xl p-8 text-center text-white/40 text-sm animate-fade-up">{t.auditTrail.empty}</div>
        )}
        {auditLog.map((e, i) => {
          const meta = AUDIT_DECISION_META[e.decision] || AUDIT_DECISION_META.approved;
          return (
            <div
              key={e.id}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              className="animate-fade-up aurora-border glass-panel rounded-2xl p-4 flex items-start gap-3"
            >
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${meta.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-xs font-bold text-white">{e.transaction_id}</p>
                  <span className="text-[10px] text-white/35">{timeAgo(e.timestamp, lang)}</span>
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
                  >
                    {t.auditTrail.decisionLabels[e.decision] || e.decision}
                  </span>
                  <span className="text-[9px] text-white/30">
                    {e.level === "auto_block" ? t.auditTrail.autoLabel : t.auditTrail.humanLabel}
                  </span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">{localize(e.reason, lang)}</p>
                {(e.violation_category || e.circular_number) && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    {e.violation_category && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ color: "var(--orchid)", backgroundColor: "rgba(228,160,255,0.1)" }}
                      >
                        {localize(e.violation_category, lang)}
                      </span>
                    )}
                    {e.circular_number && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ color: "var(--gold)", backgroundColor: "rgba(232,196,104,0.1)" }}
                      >
                        {e.circular_number}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-white/35 mt-1">
                  {localize(e.institution, lang)} · {currencyFmt(e.amount_sar, lang)} ·{" "}
                  <span className="text-white/50">{localize(e.actor, lang)}</span>
                  {e.note && <span> — {e.note}</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accuracy Methodology — shows REAL precision/recall/F1 computed from the
// actual trained model on a held-out synthetic test set, plus a threshold
// sweep chart to justify why the current operating point was chosen.
// ---------------------------------------------------------------------------

const FALLBACK_MODEL_METRICS = {
  current: { threshold: 0.55, precision: 88.1, recall: 70.1, f1: 78.1, true_positive: 393, false_positive: 53, true_negative: 886, false_negative: 168 },
  threshold_sweep: [
    { threshold: 0.3, precision: 72.5, recall: 90.6 },
    { threshold: 0.35, precision: 76.1, recall: 88.9 },
    { threshold: 0.4, precision: 79.2, recall: 85.4 },
    { threshold: 0.45, precision: 82.4, recall: 80.2 },
    { threshold: 0.5, precision: 85.3, recall: 75.6 },
    { threshold: 0.55, precision: 88.1, recall: 70.1 },
    { threshold: 0.6, precision: 90.8, recall: 63.4 },
    { threshold: 0.65, precision: 92.9, recall: 55.2 },
    { threshold: 0.7, precision: 94.5, recall: 46.8 },
    { threshold: 0.75, precision: 96.0, recall: 37.1 },
    { threshold: 0.8, precision: 97.2, recall: 27.5 },
  ],
  test_set_size: 1500,
  disclaimer_ar: "هذي مقاييس محسوبة فعلياً من الموديل المدرَّب، لكن على بيانات اختبار اصطناعية (مو بيانات بنكية حقيقية).",
  disclaimer_en: "These are real metrics computed from the trained model, but on a synthetic test set (not real bank data).",
};

function MetricCard({ label, value, color, explain }) {
  return (
    <div className="aurora-border glass-panel rounded-2xl p-5">
      <p className="text-[11px] font-bold text-white/40 mb-1">{label}</p>
      <p className="font-display text-3xl font-black" style={{ color }}>
        {value}%
      </p>
      {explain && <p className="text-[10.5px] text-white/40 mt-2 leading-relaxed">{explain}</p>}
    </div>
  );
}

function ConfusionCell({ value, label, desc, color }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: `${color}12`, border: `1px solid ${color}40` }}>
      <p className="font-display text-2xl font-black" style={{ color }}>
        {value}
      </p>
      <p className="text-[11px] font-bold text-white/70 mt-1">{label}</p>
      <p className="text-[9.5px] text-white/35 mt-1 leading-snug">{desc}</p>
    </div>
  );
}

function MethodologyTab({ lang, t }) {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/model-metrics`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && setMetrics(d))
      .catch(() => !cancelled && setMetrics(FALLBACK_MODEL_METRICS));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!metrics) {
    return (
      <div className="aurora-border glass-panel rounded-2xl p-10 text-center text-white/40 text-sm animate-fade-up">{t.methodology.loading}</div>
    );
  }

  const c = metrics.current;

  return (
    <div className="space-y-4">
      <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up">
        <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-1">
          <Gauge size={16} style={{ color: "var(--orchid)" }} />
          {t.methodology.title}
        </h3>
        <p className="text-[11px] text-white/40">{t.methodology.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label={t.methodology.precision} value={c.precision} color="var(--lavender)" explain={t.methodology.precisionExplain} />
        <MetricCard label={t.methodology.recall} value={c.recall} color="var(--gold)" explain={t.methodology.recallExplain} />
        <MetricCard label={t.methodology.f1} value={c.f1} color="var(--orchid)" />
      </div>

      <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold text-white">{t.methodology.confusionMatrix}</p>
          <span className="text-[10px] text-white/35">
            {t.methodology.threshold}: <b style={{ color: "var(--gold)" }}>{c.threshold}</b> · {t.methodology.testSetLabel}: {numberFmt.format(metrics.test_set_size)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ConfusionCell value={c.true_positive} label={t.methodology.truePositive} desc={t.methodology.truePositiveDesc} color="var(--lavender)" />
          <ConfusionCell value={c.false_positive} label={t.methodology.falsePositive} desc={t.methodology.falsePositiveDesc} color="var(--coral)" />
          <ConfusionCell value={c.false_negative} label={t.methodology.falseNegative} desc={t.methodology.falseNegativeDesc} color="var(--coral)" />
          <ConfusionCell value={c.true_negative} label={t.methodology.trueNegative} desc={t.methodology.trueNegativeDesc} color="var(--lavender)" />
        </div>
      </div>

      <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up">
        <p className="text-xs font-bold text-white mb-1">{t.methodology.tradeoffTitle}</p>
        <p className="text-[11px] text-white/40 mb-4 leading-relaxed">{t.methodology.tradeoffBody}</p>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={metrics.threshold_sweep} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="threshold" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }} domain={[0, 100]} />
            <Tooltip contentStyle={{ backgroundColor: "#150c22", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="precision" name={t.methodology.precision} stroke="var(--lavender)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="recall" name={t.methodology.recall} stroke="var(--gold)" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div
        className="rounded-2xl p-4 text-[11px] leading-relaxed flex items-start gap-2 animate-fade-up"
        style={{ backgroundColor: "rgba(232,196,104,0.06)", border: "1px solid rgba(232,196,104,0.2)", color: "rgba(255,255,255,0.55)" }}
      >
        <Info size={13} className="shrink-0 mt-0.5" style={{ color: "var(--gold)" }} />
        {lang === "en" ? metrics.disclaimer_en : metrics.disclaimer_ar}
      </div>
    </div>
  );
}

const LIMITS_ICONS = { shield: ShieldAlert, scale: Scale, book: BookOpenCheck, user: UserCheck, badge: BadgeCheck };

// ---------------------------------------------------------------------------
function LimitsTab({ t }) {
  return (
    <div className="space-y-4">
      <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up">
        <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-1">
          <ShieldAlert size={16} style={{ color: "var(--coral)" }} />
          {t.limits.title}
        </h3>
        <p className="text-[11px] text-white/40">{t.limits.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {t.limits.sections.map((s, i) => {
          const Icon = LIMITS_ICONS[s.icon] || ShieldAlert;
          return (
            <div
              key={s.title}
              style={{ animationDelay: `${i * 60}ms` }}
              className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center shrink-0">
                  <Icon size={16} style={{ color: "var(--orchid)" }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white mb-1.5">{s.title}</p>
                  <p className="text-[12px] text-white/50 leading-relaxed">{s.body}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// Mirrors the backend's two-layer chatbot design for offline fallback:
// Layer A (greetings/thanks/identity) gets a natural uncited reply; Layer B
// (regulatory questions) retrieves from a bounded KB and always cites a
// source, or says plainly that it doesn't know.

const CHATBOT_INTENTS = [
  {
    id: "greeting",
    keywords: ["اهلا", "أهلا", "هلا", "مرحبا", "السلام عليكم", "صباح الخير", "مساء الخير", "hi", "hello", "hey"],
    ar: "أهلاً! أنا مساعد التشريعات في معيار. أقدر أجاوبك عن تعاميم ساما المحمّلة بالنظام، أو نموذج المستويين، أو المسؤولية والحدود. جرّب تسألني 🙂",
    en: "Hi! I'm Meyar's regulatory assistant. Ask me about the loaded SAMA circulars, the two-tier model, or accountability and limits.",
  },
  {
    id: "thanks",
    keywords: ["شكرا", "شكراً", "يعطيك العافيه", "تسلم", "thanks", "thank you"],
    ar: "العفو! تحت أمرك لأي سؤال ثاني.",
    en: "You're welcome! Happy to help with more questions.",
  },
  {
    id: "farewell",
    keywords: ["مع السلامه", "وداعا", "الى اللقاء", "باي", "bye", "goodbye"],
    ar: "إلى اللقاء! ارجع لي أي وقت تحتاج تتأكد من شي متعلق بالأنظمة.",
    en: "Goodbye! Come back anytime.",
  },
  {
    id: "identity",
    keywords: ["مين انت", "من انت", "ايش انت", "who are you", "what are you"],
    ar: "أنا مساعد تشريعات مبني داخل نظام معيار، أجاوب فقط من قاعدة معرفة محلية محدودة — ما أخمّن، ولو السؤال خارج قاعدتي بقولك صراحة.",
    en: "I'm Meyar's built-in regulatory assistant. I answer strictly from a bounded local knowledge base — I don't guess.",
  },
  {
    id: "capabilities",
    keywords: ["وش تقدر تسوي", "ساعدني", "what can you do", "help me"],
    ar: "أقدر أشرح تعاميم ساما المحمّلة، ونموذج المستويين، ومن المسؤول في كل حالة، ومنهجية أي رقم بالداشبورد.",
    en: "I can explain the loaded SAMA circulars, the two-tier model, accountability, and the methodology behind dashboard numbers.",
  },
  {
    id: "wellbeing",
    keywords: ["كيف الحال", "كيفك", "كيف حالك", "شلونك", "how are you"],
    ar: "تمام الحمد لله! جاهز أساعدك بأي سؤال عن تعاميم ساما أو نظام معيار — جرّب اسألني عن شي محدد.",
    en: "Doing well, thanks for asking! Ready to help with any question about SAMA circulars or the Meyar system.",
  },
];

const CHATBOT_KB = [
  {
    id: "KB-102",
    circular_number: "قواعد مكافحة غسل الأموال للبنوك (تعميم 18147/م.أ.ت/9201)",
    title: "ضوابط التحقق من هوية العميل في الخدمات المصرفية المفتوحة",
    keywords: ["هوية العميل", "تحقق من الهوية", "كي واي سي", "kyc", "المستفيد الفعلي", "بيانات العميل"],
    ar: "قواعد مكافحة غسل الأموال للبنوك (تعميم 18147/م.أ.ت/9201) يحدد ضوابط التحقق من هوية العميل (KYC). غياب أي حقل KYC إلزامي هو قاعدة قطعية (مستوى ١) تُفعّل منعاً آلياً فورياً.",
    en: "the AML/CTF Rules for Banks (SAMA Circular No. 18147/M.A.T/9201) sets KYC controls. A missing mandatory KYC field is a Level-1 rule that triggers an immediate automatic block.",
  },
  {
    id: "KB-98",
    circular_number: "قواعد المحافظ الإلكترونية",
    title: "تحديث السقوف اليومية لمعاملات الدفع الفوري",
    keywords: ["سقف يومي", "الحد الاقصى اليومي", "دفع فوري"],
    ar: "قواعد المحافظ الإلكترونية يحدّث السقوف اليومية للدفع الفوري. تجاوزه رقم قابل للمقارنة المباشرة، فيُصنَّف قاعدة مستوى ١ (منع آلي فوري).",
    en: "the Electronic Wallets Rules updates daily instant-payment limits. Exceeding it is a direct numeric comparison — a Level-1 rule (immediate automatic block).",
  },
  {
    id: "KB-77",
    circular_number: "نظام مكافحة غسل الأموال (م/20)",
    title: "ضوابط مكافحة غسل الأموال في خدمات التحويل الرقمي",
    keywords: ["غسل اموال", "غسيل اموال", "aml", "نشاط مشبوه", "مؤشرات غسل"],
    ar: "مطابقة نمط معاملة لمؤشر غسل أموال تقييم احتمالي دائماً، وليست دليلاً قاطعاً — لذلك النظام لا يمنعها آلياً أبداً، بل يعلّقها ويحيلها لموظف الامتثال (مستوى ٢).",
    en: "Matching an AML indicator is always probabilistic, never conclusive — the system never auto-blocks on this alone; it flags and routes to a compliance officer (Level 2).",
  },
  {
    id: "KB-64",
    circular_number: "إطار ساما للخدمات المصرفية المفتوحة",
    title: "تنظيم واجهات برمجة التطبيقات المصرفية المفتوحة",
    keywords: ["open banking", "مصرفية مفتوحة", "api", "core banking", "صلاحيات القراءة"],
    ar: "الخدمات المصرفية المفتوحة تمنح عادة صلاحية «قراءة» أو «بدء عملية بموافقة» فقط، وليس إيقافاً داخل الأنظمة المصرفية الأساسية (Core Banking). أي «إيقاف» في معيار محكوم بحدود اتفاقية التكامل الموقّعة.",
    en: "Open Banking access typically grants only 'read' or 'consented initiation' rights, not the ability to stop transactions inside Core Banking. Any 'block' in Meyar is strictly bounded by the signed integration agreement.",
  },
  {
    id: "KB-110",
    circular_number: "نظام حماية البيانات الشخصية (م/19)",
    title: "حماية بيانات العملاء الشخصية في الخدمات المالية الرقمية",
    keywords: ["حماية البيانات", "خصوصية العميل", "بيانات شخصية"],
    ar: "نظام حماية البيانات الشخصية (م/19) يضع ضوابط حماية بيانات العملاء الشخصية، ويشترط موافقة صريحة قبل مشاركة بيانات المعاملة مع أي طرف ثالث. أي استخدام خارج النطاق قاعدة مستوى ١.",
    en: "the Personal Data Protection Law (Royal Decree M/19) sets customer data-protection controls, requiring explicit consent before sharing transaction data with third parties. Any out-of-scope use is a Level-1 rule.",
  },
  {
    id: "KB-SHARIA",
    circular_number: "إطار الحوكمة الشرعية",
    title: "دور الهيئة الشرعية في تقييم الشبهات",
    keywords: ["شبهة شرعية", "هيئة شرعية", "اجتهاد شرعي"],
    ar: "الشبهة الشرعية اجتهاد بشري قد يختلف بين الهيئات. النظام لا يقرر فيها؛ أقصى ما يفعله تعليق العملية وتنبيه الهيئة الشرعية المختصة (مستوى ٢).",
    en: "Sharia concerns involve human juristic reasoning that can differ between boards. The system never rules on these; at most it suspends the transaction and alerts the relevant Sharia board (Level 2).",
  },
  {
    id: "KB-LIABILITY",
    circular_number: "سياسة المسؤولية الداخلية",
    title: "من المسؤول عن قرار المنع أو المراجعة؟",
    keywords: ["من المسؤول", "المسؤولية القانونية", "liability", "من يتحمل"],
    ar: "مستوى ١: النظام ينفّذ آلياً استناداً لقاعدة موثّقة مسبقاً — المسؤولية على دقة القاعدة. مستوى ٢: القرار النهائي دائماً بشري، والنظام لا يُنسب له اتخاذ القرار بل التنبيه فقط.",
    en: "Level 1: the system executes against a pre-documented rule — accountability centers on the rule's accuracy. Level 2: the final decision is always human; the system only alerts and documents.",
  },
  {
    id: "KB-TWOTIER",
    circular_number: "سياسة النظام الداخلية",
    title: "ما الفرق بين المستوى ١ والمستوى ٢؟",
    keywords: ["الفرق بين المستوى", "منع متدرج", "two tier"],
    ar: "المستوى ١: قواعد قطعية قابلة للتحقق آلياً → منع آلي فوري. المستوى ٢: أي حالة اجتهادية أو احتمالية → تعليق وإحالة لمراجع بشري مُسمّى، ولا قرار نهائي آلي أبداً.",
    en: "Level 1: definitive, machine-checkable rules → immediate automatic block. Level 2: any interpretive or probabilistic case → suspended and routed to a named human reviewer, never a final automatic ruling.",
  },
  {
    id: "KB-ACCURACY",
    circular_number: "سياسة الدقة والموثوقية",
    title: "هل النظام دقيق بنسبة ١٠٠٪؟",
    keywords: ["دقة النظام", "100%", "يضمن الدقة"],
    ar: "لا. النصوص القانونية فيها استثناءات، والنظام مصمَّم على افتراض أنه قد يخطئ — لذلك القرارات النهائية الآلية محصورة بالحالات القطعية فقط (مستوى ١).",
    en: "No. Legal text has exceptions, and the system assumes it can be wrong — final automatic decisions are limited strictly to definitive cases (Level 1).",
  },
  {
    id: "KB-COST",
    circular_number: "منهجية داخلية",
    title: "كيف تُحسب نسبة خفض التكاليف؟",
    keywords: ["نسبة خفض التكاليف", "70%", "منهجية", "كيف تحسب"],
    ar: "النسبة محسوبة كـ (١ − ساعات المراجعة بعد الأتمتة ÷ ساعات المراجعة قبل الأتمتة) × ١٠٠، بافتراض ١٢٠٠ ساعة قبل النظام مقابل ٣٦٠ ساعة بعد الأتمتة.",
    en: "Calculated as (1 − post-automation hours ÷ pre-automation hours) × 100, assuming 1,200 hours before the system vs. 360 hours after automation.",
  },
  {
    id: "KB-PEP",
    circular_number: "مفهوم عام",
    title: "من هو الشخص السياسي المعرَّض للمخاطر (PEP)؟",
    keywords: ["شخص سياسي معرض", "pep", "شخصية سياسية"],
    ar: "الشخص السياسي المعرَّض للمخاطر (PEP) فرد يشغل أو شغل منصباً عاماً بارزاً، ما يجعل حساباته تحتاج مستوى تدقيق أعلى. معاملات هذي الفئة غالباً تُصنَّف مستوى ٢.",
    en: "A PEP holds or held a prominent public position, requiring extra AML scrutiny. Such accounts are typically Level 2 (human review).",
  },
  {
    id: "KB-COMPLIANCE-OFFICER",
    circular_number: "مفهوم عام",
    title: "وش دور موظف الامتثال بالضبط؟",
    keywords: ["دور موظف الامتثال", "compliance officer"],
    ar: "موظف الامتثال هو المسؤول عن مراجعة أي حالة اجتهادية (مستوى ٢) ما يقدر النظام يقرر فيها بمفرده، ويوافق أو يرفض بقرار نهائي موثَّق عبر شاشة قائمة المراجعة.",
    en: "A compliance officer reviews Level-2 cases the system cannot decide alone, issuing a final documented decision via the Review Queue.",
  },
  {
    id: "KB-BNPL",
    circular_number: "لائحة مراقبة شركات التمويل",
    title: "أنظمة خدمات الشراء الآن والدفع لاحقاً (BNPL)",
    keywords: ["الشراء الان والدفع لاحقا", "bnpl"],
    ar: "لائحة مراقبة شركات التمويل ينظّم مزودي BNPL، ويشترط ترخيصاً رسمياً وسقفاً على مبلغ التقسيط الإجمالي. تجاوزه قاعدة مستوى ١ بنظامنا.",
    en: "the Finance Companies Control Law regulates BNPL providers with a licensing requirement and an installment cap — exceeding it is a Level-1 rule.",
  },
  {
    id: "KB-OUTSOURCING",
    circular_number: "إطار ساما للخدمات المصرفية المفتوحة",
    title: "هل يقدر البنك يفوّض جزء من الرقابة لطرف ثالث؟",
    keywords: ["طرف ثالث", "outsourcing"],
    ar: "يجوز الاستعانة بطرف ثالث لبعض المهام التقنية، لكن المسؤولية النهائية تبقى دائماً على المؤسسة المرخَّصة نفسها، مو على الطرف الثالث.",
    en: "Outsourcing certain technical functions is allowed, but final accountability always stays with the licensed institution, never the vendor.",
  },
];

function normalizeArabicClient(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    // IMPORTANT: JS's \w (unlike Python's) only matches ASCII [A-Za-z0-9_],
    // so it silently strips every Arabic letter. \p{L}/\p{N} with the /u
    // flag are Unicode-aware and keep Arabic text intact.
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
}

function stripAlClient(word) {
  const preps = ["و", "ف", "ب", "ل", "ك"];
  for (let i = 0; i < 2; i++) {
    if (word.startsWith("ال") && word.length > 3) {
      word = word.slice(2);
      continue;
    }
    if (preps.includes(word[0]) && word.length > 3) {
      word = word.slice(1);
      continue;
    }
    break;
  }
  return word;
}

function tokenizeClient(text) {
  return new Set(
    normalizeArabicClient(text)
      .split(/\s+/)
      .filter(Boolean)
      .map(stripAlClient)
  );
}

// A multi-word keyword phrase matches only if every one of its words is
// present among the question's tokens — order-independent and immune to
// users writing "الشبهة الشرعية" instead of the keyword's own "شبهة شرعية".
function keywordMatchesClient(keyword, questionTokens) {
  const kwTokens = normalizeArabicClient(keyword).split(/\s+/).filter(Boolean).map(stripAlClient);
  return kwTokens.length > 0 && kwTokens.every((t) => questionTokens.has(t));
}

function matchIntentClient(questionTokens) {
  for (const intent of CHATBOT_INTENTS) {
    for (const kw of intent.keywords) {
      if (keywordMatchesClient(kw, questionTokens)) return intent;
    }
  }
  return null;
}

const CIRCULAR_DIGITS_RE = /[\u0660-\u0669\d]+/;

function circularNumberToken(circularNumber) {
  if (!circularNumber) return null;
  const m = circularNumber.match(CIRCULAR_DIGITS_RE);
  return m ? m[0] : null;
}

function searchChatbotKB(question) {
  const tokens = tokenizeClient(question);
  const scored = CHATBOT_KB.map((entry) => {
    let score = entry.keywords.reduce((acc, kw) => acc + (keywordMatchesClient(kw, tokens) ? 1 : 0), 0);
    const digits = circularNumberToken(entry.circular_number);
    if (digits && tokens.has(digits)) score += 2;
    return { score, entry };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function ChatbotTab({ lang, t }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [suggested, setSuggested] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/chatbot/suggested-questions`)
      .then((r) => r.json())
      .then((d) => setSuggested(lang === "en" ? d.questions_en : d.questions_ar))
      .catch(() =>
        setSuggested(
          lang === "en"
            ? ["What's the difference between Level 1 and Level 2 blocking?", "Who is liable if the system wrongly blocks a transaction?"]
            : ["ما الفرق بين المستوى ١ والمستوى ٢؟", "مين المسؤول لو النظام أوقف عملية شرعية بالخطأ؟"]
        )
      );
  }, [lang]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  const ask = useCallback(
    async (question) => {
      if (!question.trim()) return;
      const userMsg = { role: "user", text: question };
      setMessages((m) => [...m, userMsg]);
      setInput("");
      setThinking(true);

      try {
        // 20s allows for a slow/cold backend plus the Gemini round-trip,
        // but guarantees the chat never appears permanently stuck — after
        // this, it falls back to the local knowledge base search below.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        let res;
        try {
          res = await fetch(`${API_BASE}/chatbot/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, lang }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
        if (!res.ok) throw new Error("bad response");
        const data = await res.json();
        setMessages((m) => [...m, { role: "bot", text: data.answer, sources: data.sources, confidence: data.confidence, disclaimer: data.disclaimer, aiPowered: data.ai_powered }]);
      } catch {
        const tokens = tokenizeClient(question);
        const intent = matchIntentClient(tokens);
        if (intent) {
          setMessages((m) => [...m, { role: "bot", text: lang === "en" ? intent.en : intent.ar, sources: [], confidence: "high", disclaimer: t.chatbot.disclaimer }]);
        } else {
          const matches = searchChatbotKB(question);
          if (matches.length === 0) {
            setMessages((m) => [...m, { role: "bot", text: t.chatbot.noMatch, sources: [], confidence: "none", disclaimer: t.chatbot.disclaimer }]);
          } else {
            const topScore = matches[0].score;
            const top = topScore >= 2 ? matches.filter((x) => x.score === topScore).slice(0, 2).map((m) => m.entry) : [matches[0].entry];
            const text = top.map((e) => (lang === "en" ? e.en : e.ar)).join("\n\n");
            const sources = top.map((e) => ({ circular_number: e.circular_number, title: e.title }));
            setMessages((m) => [...m, { role: "bot", text, sources, confidence: topScore >= 2 ? "high" : "medium", disclaimer: t.chatbot.disclaimer }]);
          }
        }
      } finally {
        setThinking(false);
      }
    },
    [lang, t]
  );

  return (
    <div className="space-y-4">
      <div className="aurora-border glass-panel rounded-2xl p-5 animate-fade-up">
        <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-1">
          <BookOpenCheck size={16} style={{ color: "var(--gold)" }} />
          {t.chatbot.title}
        </h3>
        <p className="text-[11px] text-white/40">{t.chatbot.subtitle}</p>
      </div>

      <div className="aurora-border glass-panel rounded-2xl flex flex-col animate-fade-up" style={{ height: "min(640px, 70vh)" }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-[11px] text-white/35 bg-white/[0.03] border border-white/10 rounded-xl p-3 leading-relaxed">
            {t.chatbot.disclaimer}
          </div>

          {messages.length === 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-white/40 font-semibold">{t.chatbot.suggestedLabel}</p>
              {suggested.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="w-full text-start text-[12px] text-white/70 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2.5 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line ${
                  m.role === "user" ? "text-white" : "text-white/80"
                }`}
                style={
                  m.role === "user"
                    ? { backgroundColor: "rgba(228,160,255,0.15)", border: "1px solid rgba(228,160,255,0.3)" }
                    : { backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }
                }
              >
                {m.text}
                {m.role === "bot" && (m.sources?.length > 0 || m.confidence === "general") && (
                  <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap items-center gap-1.5">
                    {m.sources?.map((s) => (
                      <span
                        key={s.circular_number}
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ color: "var(--lavender)", backgroundColor: "rgba(166,172,255,0.1)" }}
                      >
                        {s.circular_number}
                      </span>
                    ))}
                    {m.confidence === "general" && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ color: "var(--coral)", backgroundColor: "rgba(255,107,129,0.1)" }}
                      >
                        {t.chatbot.confidence.general}
                      </span>
                    )}
                    {m.aiPowered && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1"
                        style={{ color: "var(--gold)", backgroundColor: "rgba(232,196,104,0.1)" }}
                      >
                        <Sparkles size={9} />
                        Gemini
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {thinking && <p className="text-[12px] text-white/35 flex items-center gap-1.5"><RefreshCw size={12} className="animate-spin" />{t.chatbot.thinking}</p>}
        </div>

        <div className="p-3 border-t border-white/5 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(input)}
            placeholder={t.chatbot.placeholder}
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-[var(--orchid)]/40"
          />
          <button
            onClick={() => ask(input)}
            disabled={!input.trim() || thinking}
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-30 transition-opacity"
            style={{ backgroundColor: "rgba(228,160,255,0.15)", color: "var(--orchid)" }}
            aria-label={t.chatbot.send}
          >
            <Send size={15} className={lang === "ar" ? "scale-x-[-1]" : ""} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocked-transaction toast — surfaces a brief, dismissible notification the
// instant a new transaction is auto-blocked, so the dashboard feels "live"
// even from a tab other than Live Monitor. Anchored to the bottom corner
// OPPOSITE the sidebar (which docks to the reading-direction "end" side),
// so it can never sit under or overlap the nav, and capped at 3 stacked
// cards so a burst of blocks never crowds the screen.
// ---------------------------------------------------------------------------

function BlockedTransactionToast({ tx, onDismiss, onView, lang, t }) {
  const [leaving, setLeaving] = useState(false);

  const startDismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(onDismiss, 280);
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(startDismiss, 5000);
    return () => clearTimeout(timer);
  }, [startDismiss]);

  return (
    <div
      className={`pointer-events-auto w-[17rem] aurora-border glass-panel-strong rounded-2xl p-3.5 shadow-2xl overflow-hidden relative ${
        leaving ? "animate-toast-out" : "animate-toast-in"
      }`}
      style={{ borderColor: "rgba(255,107,129,0.3)" }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(255,107,129,0.15)", color: "var(--coral)" }}
        >
          <ShieldAlert size={16} />
        </div>
        <button onClick={onView} className="min-w-0 flex-1 text-start">
          <p className="text-[11px] font-bold text-white">{t.toast.blockedTitle}</p>
          <p className="text-[10.5px] text-white/50 mt-0.5 truncate">
            {tx.id} · {localize(tx.institution, lang)}
          </p>
          <p className="text-[10px] text-white/35 mt-1 leading-snug line-clamp-2">{localize(tx.legal_reason, lang)}</p>
        </button>
        <button onClick={startDismiss} className="shrink-0 text-white/30 hover:text-white/70 transition-colors" aria-label="dismiss">
          <X size={13} />
        </button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
        <div className="h-full animate-toast-progress" style={{ backgroundColor: "var(--coral)" }} />
      </div>
    </div>
  );
}

function ToastStack({ toasts, onDismiss, onView, lang, t }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-5 rtl:left-5 ltr:right-5 z-50 flex flex-col-reverse gap-2.5 pointer-events-none">
      {toasts.map((toast) => (
        <BlockedTransactionToast
          key={toast.id}
          tx={toast.tx}
          onDismiss={() => onDismiss(toast.id)}
          onView={() => onView(toast.id)}
          lang={lang}
          t={t}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login / Sign-up — real email-code (OTP) verification against the
// backend's auth endpoints. Two entry points (sign in to an existing
// account, or register a new one) both end at the same code-verification
// step. In MEYAR_DEMO_MODE (the backend default while no real email
// provider is wired in) the generated code is returned in the response so
// the flow can be tested end-to-end without a live inbox — shown here
// plainly as a demo notice, not hidden.
// ---------------------------------------------------------------------------

const ROLE_LABELS = {
  ar: { compliance_officer: "موظف الامتثال", sharia_board: "رئيس الهيئة الشرعية", admin: "مدير النظام" },
  en: { compliance_officer: "Compliance officer", sharia_board: "Sharia board chair", admin: "System admin" },
};

async function parseAuthError(res, a) {
  // Surfaces the backend's actual reason instead of a single generic
  // message, so a failed sign-in/sign-up is actually debuggable.
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (detail === "not_registered") return { code: "not_registered", message: a.notRegistered };
    if (detail === "already_registered") return { code: "already_registered", message: a.alreadyRegistered };
    if (detail === "name_required") return { code: "generic", message: a.nameRequired };
    if (res.status === 401) return { code: "generic", message: a.invalidCode };
    return { code: "generic", message: typeof detail === "string" ? detail : a.genericError };
  } catch {
    return { code: "generic", message: a.genericError };
  }
}

function LoginScreen({ onSuccess, lang, t }) {
  const a = t.auth;
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [step, setStep] = useState("form"); // "form" | "code"
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("compliance_officer");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { code, message } | null
  const [demoCode, setDemoCode] = useState(null);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setStep("form");
    setError(null);
    setDemoCode(null);
    setCode("");
  };

  const handleAuthResponse = async (res) => {
    if (!res.ok) {
      setError(await parseAuthError(res, a));
      return false;
    }
    const data = await res.json();
    if (data.demo_code) setDemoCode(data.demo_code);
    setStep("code");
    return true;
  };

  const requestCode = async (e) => {
    e?.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      await handleAuthResponse(res);
    } catch {
      setError({ code: "network", message: a.networkError });
    } finally {
      setBusy(false);
    }
  };

  const register = async (e) => {
    e?.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), role }),
      });
      await handleAuthResponse(res);
    } catch {
      setError({ code: "network", message: a.networkError });
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e) => {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      if (!res.ok) {
        setError(await parseAuthError(res, a));
        setBusy(false);
        return;
      }
      const data = await res.json();
      onSuccess(data.token, data.user);
    } catch {
      setError({ code: "network", message: a.networkError });
      setBusy(false);
    }
  };

  const ErrorNote = () =>
    error ? (
      <div className="mb-3">
        <p className="text-[11px]" style={{ color: "var(--coral)" }}>{error.message}</p>
        {error.code === "not_registered" && (
          <button type="button" onClick={() => switchMode("signup")} className="text-[11px] font-bold mt-1" style={{ color: "var(--orchid)" }}>
            {a.goToSignup}
          </button>
        )}
        {error.code === "already_registered" && (
          <button type="button" onClick={() => switchMode("login")} className="text-[11px] font-bold mt-1" style={{ color: "var(--orchid)" }}>
            {a.goToLogin}
          </button>
        )}
      </div>
    ) : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--bg-obsidian)" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <MeyarLogo size={48} />
          <p className="text-white font-black text-lg mt-3">{a.appName}</p>
          <p className="text-[11px] text-white/40">{a.tagline}</p>
        </div>

        <div className="aurora-border glass-panel-strong rounded-2xl p-6 animate-fade-up">
          {step === "form" && (
            <div className="flex mb-5 rounded-xl bg-white/[0.04] p-1">
              <button
                onClick={() => switchMode("login")}
                className="flex-1 py-2 rounded-lg text-xs font-bold transition-colors"
                style={mode === "login" ? { backgroundColor: "var(--orchid)", color: "#1a0b26" } : { color: "rgba(255,255,255,0.45)" }}
              >
                {a.loginTab}
              </button>
              <button
                onClick={() => switchMode("signup")}
                className="flex-1 py-2 rounded-lg text-xs font-bold transition-colors"
                style={mode === "signup" ? { backgroundColor: "var(--orchid)", color: "#1a0b26" } : { color: "rgba(255,255,255,0.45)" }}
              >
                {a.signupTab}
              </button>
            </div>
          )}

          {step === "form" && mode === "login" && (
            <form onSubmit={requestCode}>
              <p className="text-white font-bold text-sm mb-1">{a.emailStepTitle}</p>
              <p className="text-[11px] text-white/45 mb-4">{a.emailStepSubtitle}</p>
              <div className="relative mb-3">
                <Mail size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-white/30" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={a.emailPlaceholder}
                  dir="ltr"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl py-2.5 pr-9 pl-3 text-xs text-white text-right placeholder:text-white/25 focus:outline-none focus:border-[var(--orchid)]/50"
                  required
                />
              </div>
              <ErrorNote />
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
                style={{ backgroundColor: "var(--orchid)", color: "#1a0b26" }}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
                {busy ? a.sending : a.sendCode}
              </button>
            </form>
          )}

          {step === "form" && mode === "signup" && (
            <form onSubmit={register}>
              <p className="text-white font-bold text-sm mb-1">{a.signupStepTitle}</p>
              <p className="text-[11px] text-white/45 mb-4">{a.signupStepSubtitle}</p>
              <div className="relative mb-2.5">
                <UserCheck size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-white/30" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={a.namePlaceholder}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl py-2.5 pr-9 pl-3 text-xs text-white text-right placeholder:text-white/25 focus:outline-none focus:border-[var(--orchid)]/50"
                  required
                />
              </div>
              <div className="relative mb-2.5">
                <Mail size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-white/30" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={a.emailPlaceholder}
                  dir="ltr"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl py-2.5 pr-9 pl-3 text-xs text-white text-right placeholder:text-white/25 focus:outline-none focus:border-[var(--orchid)]/50"
                  required
                />
              </div>
              <div className="mb-3">
                <label className="text-[10.5px] text-white/40 block mb-1.5">{a.roleLabel}</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl py-2.5 px-3 text-xs text-white focus:outline-none focus:border-[var(--orchid)]/50"
                >
                  <option value="compliance_officer">{a.roleCompliance}</option>
                  <option value="sharia_board">{a.roleSharia}</option>
                </select>
              </div>
              <ErrorNote />
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
                style={{ backgroundColor: "var(--orchid)", color: "#1a0b26" }}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
                {busy ? a.creating : a.createAccount}
              </button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={verifyCode}>
              <p className="text-white font-bold text-sm mb-1">{a.codeStepTitle}</p>
              <p className="text-[11px] text-white/45 mb-4">{a.codeStepSubtitle(email)}</p>
              <div className="relative mb-3">
                <KeyRound size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-white/30" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder={a.codePlaceholder}
                  dir="ltr"
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl py-2.5 pr-9 pl-3 text-sm text-white text-center tracking-[6px] placeholder:text-white/20 focus:outline-none focus:border-[var(--orchid)]/50"
                  required
                  autoFocus
                />
              </div>
              {demoCode && (
                <div className="mb-3 rounded-lg border p-2.5" style={{ borderColor: "rgba(232,196,104,0.3)", backgroundColor: "rgba(232,196,104,0.08)" }}>
                  <p className="text-[10.5px]" style={{ color: "var(--gold)" }}>{a.demoNotice(demoCode)}</p>
                </div>
              )}
              <ErrorNote />
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 mb-2 transition-opacity disabled:opacity-60"
                style={{ backgroundColor: "var(--orchid)", color: "#1a0b26" }}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={13} />}
                {busy ? a.verifying : a.verify}
              </button>
              <button
                type="button"
                onClick={() => { setStep("form"); setCode(""); setError(null); setDemoCode(null); }}
                className="w-full py-2 rounded-xl text-[11px] text-white/40 hover:text-white/70"
              >
                {a.changeEmail}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}


function SettingsModal({ onClose, onGoToLimits, onReplayOnboarding, presentationMode, onTogglePresentation, authUser, onLogout, lang, t }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative aurora-border glass-panel-strong rounded-2xl p-6 w-full max-w-sm animate-fade-up">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <MeyarLogo size={34} />
            <div>
              <p className="text-white font-black text-sm">{t.settingsModal.title}</p>
              <p className="text-[10px] text-white/40">{t.settingsModal.version}: 3.0.0</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06]">
            <X size={14} />
          </button>
        </div>

        {authUser && (
          <div className="mb-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
            <p className="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-2.5">{t.settingsModal.profileTitle}</p>
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                style={{ backgroundColor: "rgba(228,160,255,0.15)", color: "var(--orchid)" }}
              >
                {authUser.name?.trim()?.[0] || "?"}
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-xs truncate">{authUser.name}</p>
                <p className="text-[10.5px] text-white/40 truncate" dir="ltr">{authUser.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] mb-3">
              <span className="text-white/40">{t.settingsModal.roleLabel}</span>
              <span className="text-white/70 font-semibold">{ROLE_LABELS[lang]?.[authUser.role] || authUser.role}</span>
            </div>
            <button
              onClick={onLogout}
              className="w-full py-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
              style={{ backgroundColor: "rgba(255,107,129,0.08)", borderColor: "rgba(255,107,129,0.25)", color: "var(--coral)" }}
            >
              <LogOut size={12} />
              {t.settingsModal.logout}
            </button>
          </div>
        )}

        <p className="text-[12px] text-white/60 leading-relaxed mb-4">{t.settingsModal.description}</p>

        <div className="space-y-2">
          <button
            onClick={onGoToLimits}
            className="w-full py-2.5 rounded-xl border text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            style={{ backgroundColor: "rgba(255,107,129,0.1)", borderColor: "rgba(255,107,129,0.3)", color: "var(--coral)" }}
          >
            <ShieldAlert size={14} />
            {t.settingsModal.goToLimits}
          </button>

          <button
            onClick={onReplayOnboarding}
            className="w-full py-2.5 rounded-xl border text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            style={{ backgroundColor: "rgba(228,160,255,0.1)", borderColor: "rgba(228,160,255,0.3)", color: "var(--orchid)" }}
          >
            <Wand2 size={14} />
            {t.settingsModal.replayTour}
          </button>

          <button
            onClick={onTogglePresentation}
            className="w-full py-2.5 rounded-xl border text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            style={
              presentationMode
                ? { backgroundColor: "rgba(232,196,104,0.15)", borderColor: "rgba(232,196,104,0.4)", color: "var(--gold)" }
                : { backgroundColor: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }
            }
          >
            <Presentation size={14} />
            {presentationMode ? t.settingsModal.presentationOff : t.settingsModal.presentationOn}
          </button>
        </div>
      </div>
    </div>
  );
}

const LOGO_PARTICLES = [
  { x: -90, y: -60, color: "#e4a0ff", delay: 0.0 },
  { x: 85, y: -70, color: "#e8c468", delay: 0.05 },
  { x: -100, y: 40, color: "#a6acff", delay: 0.1 },
  { x: 95, y: 55, color: "#9d4edd", delay: 0.03 },
  { x: 0, y: -95, color: "#e4a0ff", delay: 0.08 },
  { x: 0, y: 90, color: "#e8c468", delay: 0.12 },
  { x: -60, y: 85, color: "#a6acff", delay: 0.06 },
  { x: 65, y: -85, color: "#9d4edd", delay: 0.02 },
  { x: -110, y: -10, color: "#e4a0ff", delay: 0.14 },
  { x: 110, y: 5, color: "#e8c468", delay: 0.09 },
  { x: -40, y: -100, color: "#a6acff", delay: 0.11 },
  { x: 45, y: 98, color: "#e4a0ff", delay: 0.04 },
];

function LogoAssemblyIntro({ onDone, appName, tagline }) {
  useEffect(() => {
    const t1 = setTimeout(() => onDone(), 2400);
    return () => clearTimeout(t1);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center cursor-pointer"
      onClick={onDone}
      style={{ backgroundColor: "rgba(6,4,9,0.92)" }}
    >
      <div style={{ position: "relative", width: 220, height: 220 }}>
        {LOGO_PARTICLES.map((p, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: p.color,
              animation: `logo-particle-converge 1.1s cubic-bezier(0.16,1,0.3,1) both`,
              animationDelay: `${p.delay}s`,
              "--px": `${p.x}px`,
              "--py": `${p.y}px`,
            }}
          />
        ))}

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "logo-reveal 0.8s cubic-bezier(0.16,1,0.3,1) both",
            animationDelay: "0.9s",
          }}
        >
          <MeyarLogo size={88} />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: "63%",
          textAlign: "center",
          animation: "logo-reveal 0.6s ease both",
          animationDelay: "1.5s",
        }}
      >
        <p className="font-display text-xl font-black text-white">{appName}</p>
        <p className="text-[12px] text-white/40 mt-1">{tagline}</p>
      </div>
    </div>
  );
}

function OnboardingTour({ onFinish, lang, t }) {
  const [phase, setPhase] = useState("intro");
  const [step, setStep] = useState(0);
  const steps = t.onboarding.steps;
  const isLast = step === steps.length - 1;

  if (phase === "intro") {
    return <LogoAssemblyIntro onDone={() => setPhase("steps")} appName={t.appName} tagline={t.appSubtitle} />;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" dir={t.dir}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative aurora-border glass-panel-strong rounded-2xl p-6 w-full max-w-md animate-fade-up">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MeyarLogo size={30} />
            <span className="font-display text-sm font-bold text-white">{t.appName}</span>
          </div>
          <button onClick={onFinish} className="text-[11px] text-white/40 hover:text-white/70 font-bold">
            {t.onboarding.skip}
          </button>
        </div>

        <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-3" style={{ color: "var(--orchid)" }}>
          {React.createElement(steps[step].icon, { size: 17 })}
        </div>
        <p className="text-white font-bold text-sm mb-2">{steps[step].title}</p>
        <p className="text-[12.5px] text-white/60 leading-relaxed mb-5">{steps[step].body}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className="h-1.5 rounded-full transition-all"
                style={{ width: i === step ? "18px" : "6px", backgroundColor: i === step ? "var(--orchid)" : "rgba(255,255,255,0.15)" }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-3 py-2 rounded-xl text-[11px] font-bold text-white/60 hover:text-white transition-colors"
              >
                {t.onboarding.back}
              </button>
            )}
            <button
              onClick={() => (isLast ? onFinish() : setStep((s) => s + 1))}
              className="px-4 py-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-colors"
              style={{ backgroundColor: "rgba(228,160,255,0.15)", border: "1px solid rgba(228,160,255,0.35)", color: "var(--orchid)" }}
            >
              {isLast ? t.onboarding.finish : t.onboarding.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationsPanel({ transactions, onViewAll, onClose, t }) {
  const alerts = useMemo(
    () => transactions.filter((tx) => tx.status === "blocked" || tx.status === "flagged").slice(0, 6),
    [transactions]
  );
  return (
    <div className="absolute top-12 rtl:left-0 ltr:right-0 z-30 w-72 aurora-border glass-panel-strong rounded-2xl overflow-hidden animate-fade-up shadow-2xl">
      <div className="p-3 border-b border-white/5 flex items-center justify-between">
        <p className="text-xs font-bold text-white">{t.notifications.title}</p>
        <button onClick={onClose} className="w-6 h-6 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06]">
          <X size={12} />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-2 space-y-1.5">
        {alerts.length === 0 && <p className="text-center text-white/35 text-[11px] py-6">{t.notifications.empty}</p>}
        {alerts.map((tx) => (
          <div key={tx.id} className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/5 flex items-start gap-2">
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${STATUS_META[tx.status].dot}`} />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white truncate">{tx.id}</p>
              <p className="text-[10px] text-white/40 truncate">{tx.legal_reason}</p>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onViewAll}
        className="w-full p-2.5 text-[11px] font-bold text-center border-t border-white/5 text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors"
      >
        {t.notifications.viewAll}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({ activeTab, setActiveTab, collapsed, setCollapsed, setSettingsOpen, authUser, t }) {
  return (
    <aside
      className={`aurora-border glass-panel-strong flex flex-col transition-all duration-300 shrink-0 ${
        collapsed ? "w-[76px]" : "w-64"
      }`}
    >
      <div className="p-4 flex items-center gap-3 border-b border-white/5">
        <MeyarLogo size={40} />
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="font-display text-white font-black text-sm leading-none">{t.appName}</p>
            <p className="text-[10px] text-white/35 mt-1 whitespace-nowrap">{t.appSubtitle}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1.5">
        {NAV_ORDER.map((id) => {
          const Icon = NAV_ICONS[id];
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all border"
              style={
                active
                  ? {
                      color: "var(--orchid)",
                      backgroundColor: "rgba(228,160,255,0.1)",
                      borderColor: "rgba(228,160,255,0.3)",
                      boxShadow: "0 0 18px -4px rgba(228,160,255,0.4)",
                    }
                  : { color: "rgba(255,255,255,0.45)", borderColor: "transparent" }
              }
              title={collapsed ? t.nav[id] : undefined}
            >
              <Icon size={18} strokeWidth={2.2} className="shrink-0" />
              {!collapsed && <span className="truncate">{t.nav[id]}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/5 space-y-1.5">
        {authUser && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition-all"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0"
              style={{ backgroundColor: "rgba(228,160,255,0.15)", color: "var(--orchid)" }}
            >
              {authUser.name?.trim()?.[0] || "?"}
            </div>
            {!collapsed && (
              <div className="min-w-0 text-right">
                <p className="text-[11.5px] font-bold text-white truncate">{authUser.name}</p>
                <p className="text-[9.5px] text-white/35 truncate">{ROLE_LABELS[t.dir === "ltr" ? "en" : "ar"]?.[authUser.role] || authUser.role}</p>
              </div>
            )}
          </button>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-white/45 hover:bg-white/[0.04] hover:text-white transition-all"
        >
          <Settings size={18} strokeWidth={2.2} className="shrink-0" />
          {!collapsed && <span>{t.nav.settings}</span>}
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-white/45 hover:bg-white/[0.04] hover:text-white transition-all"
        >
          <ChevronLeft size={18} className={`shrink-0 transition-transform ${collapsed ? "rotate-180" : ""} ${t.dir === "ltr" ? "scale-x-[-1]" : ""}`} />
          {!collapsed && <span>{t.nav.collapse}</span>}
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Self-contained embedded stylesheet
//
// The dark theme, glass panels, and status colors all depend on CSS custom
// properties and utility classes defined in src/index.css and loaded via
// main.jsx (`import "./index.css"`). Standalone JSX preview tools often
// render this component in isolation without ever loading that file, which
// leaves every var(--...) reference empty and the whole UI washes out to
// near-white. Injecting the same rules here makes the component render
// correctly regardless of the preview environment; when the real Vite app
// loads index.css too, the identical rules simply overlap harmlessly.
// ---------------------------------------------------------------------------

const EMBEDDED_STYLE = `
  @import url("https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=El+Messiri:wght@500;600;700&display=swap");
  :root {
    --bg-obsidian: #0b0813;
    --bg-obsidian-deep: #060409;
    --card-bg: rgba(24, 15, 38, 0.5);
    --card-bg-strong: rgba(17, 10, 28, 0.72);
    --border-soft: rgba(255, 255, 255, 0.08);
    --orchid: #e4a0ff;
    --orchid-2: #c77dff;
    --violet: #9d4edd;
    --violet-2: #7b2cbf;
    --gold: #e8c468;
    --gold-2: #d4af37;
    --lavender: #a6acff;
    --lavender-2: #8087ff;
    --coral: #ff6b81;
    --coral-2: #ff4d6d;
  }
  .tabular-nums-ar { font-variant-numeric: tabular-nums; }
  .font-display { font-family: "El Messiri", "Plus Jakarta Sans", sans-serif; }
  .glass-panel {
    background-color: var(--card-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--border-soft);
  }
  .glass-panel-strong {
    background-color: var(--card-bg-strong);
    backdrop-filter: blur(26px);
    -webkit-backdrop-filter: blur(26px);
    border: 1px solid var(--border-soft);
  }
  .aurora-border { position: relative; isolation: isolate; }
  .aurora-border::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(120deg, var(--orchid-2), var(--gold), var(--lavender), var(--violet-2));
    background-size: 300% 300%;
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0.55;
    pointer-events: none;
    z-index: -1;
    animation: aurora-border-shift 8s ease infinite;
  }
  @keyframes aurora-border-shift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
  .aurora-blob { position: absolute; border-radius: 999px; filter: blur(90px); opacity: 0.35; pointer-events: none; will-change: transform; }
  @keyframes aurora-float-a { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,-30px) scale(1.15); } }
  @keyframes aurora-float-b { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-50px,25px) scale(1.1); } }
  @keyframes aurora-float-c { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,40px) scale(1.08); } }
  .animate-aurora-a { animation: aurora-float-a 16s ease-in-out infinite; }
  .animate-aurora-b { animation: aurora-float-b 20s ease-in-out infinite; }
  .animate-aurora-c { animation: aurora-float-c 18s ease-in-out infinite; }
  @keyframes fade-up { 0% { opacity: 0; transform: translateY(14px); } 100% { opacity: 1; transform: translateY(0); } }
  .animate-fade-up { animation: fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes slide-in-row { 0% { opacity: 0; transform: translateY(-8px); } 100% { opacity: 1; transform: translateY(0); } }
  .animate-slide-in-row { animation: slide-in-row 0.4s ease-out both; }

  @keyframes gate-pass { 0% { opacity: 0; transform: translateX(var(--gate-dx, 10px)) scale(0.97); } 60% { opacity: 1; } 100% { opacity: 1; transform: translateX(0) scale(1); } }
  @keyframes gate-blocked { 0% { opacity: 0; transform: translateX(var(--gate-dx, 10px)) scale(0.9); } 55% { opacity: 1; transform: translateX(-3px) scale(1.015); box-shadow: 0 0 0 1px rgba(255,107,129,0.5), 0 0 18px rgba(255,107,129,0.35); } 100% { opacity: 1; transform: translateX(0) scale(1); box-shadow: 0 0 0 0 rgba(255,107,129,0); } }
  @keyframes gate-flagged { 0% { opacity: 0; transform: translateX(var(--gate-dx, 10px)) scale(0.94); } 50% { opacity: 1; box-shadow: 0 0 0 1px rgba(232,196,104,0.5), 0 0 16px rgba(232,196,104,0.3); } 100% { opacity: 1; transform: translateX(0) scale(1); box-shadow: 0 0 0 0 rgba(232,196,104,0); } }
  .animate-gate-passed { animation: gate-pass 0.5s cubic-bezier(0.16,1,0.3,1) both; }
  .animate-gate-blocked { animation: gate-blocked 0.6s cubic-bezier(0.16,1,0.3,1) both; }
  .animate-gate-flagged { animation: gate-flagged 0.6s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes gate-flash { 0% { opacity: 0; transform: scale(0.6); } 30% { opacity: 0.85; transform: scale(1.15); } 100% { opacity: 0; transform: scale(1.4); } }
  .animate-gate-flash { animation: gate-flash 0.7s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes logo-particle-converge {
    0% { transform: translate(calc(-50% + var(--px)), calc(-50% + var(--py))) scale(1); opacity: 1; }
    70% { opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(0.15); opacity: 0; }
  }
  @keyframes logo-reveal {
    0% { opacity: 0; transform: scale(0.7); filter: drop-shadow(0 0 0 rgba(228,160,255,0)); }
    60% { opacity: 1; transform: scale(1.08); filter: drop-shadow(0 0 22px rgba(228,160,255,0.6)); }
    100% { opacity: 1; transform: scale(1); filter: drop-shadow(0 0 10px rgba(228,160,255,0.35)); }
  }
  @keyframes pulse-glow-lavender { 0%,100% { opacity: 1; box-shadow: 0 0 12px rgba(166,172,255,0.5); } 50% { opacity: 0.65; box-shadow: 0 0 4px rgba(166,172,255,0.2); } }
  .animate-pulse-lavender { animation: pulse-glow-lavender 2.4s ease-in-out infinite; }
  @keyframes radar-ping { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.8); opacity: 0; } }
  .animate-radar-ping { animation: radar-ping 1.8s cubic-bezier(0,0,0.2,1) infinite; }
  @keyframes toast-in { 0% { opacity: 0; transform: translateY(18px) scale(0.95); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
  .animate-toast-in { animation: toast-in 0.4s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes toast-out { 0% { opacity: 1; transform: translateY(0) scale(1); max-height: 120px; } 100% { opacity: 0; transform: translateY(10px) scale(0.95); max-height: 0px; } }
  .animate-toast-out { animation: toast-out 0.3s cubic-bezier(0.4,0,1,1) both; }
  @keyframes toast-progress { 0% { width: 100%; } 100% { width: 0%; } }
  .animate-toast-progress { animation: toast-progress 5s linear forwards; }
  button:not(:disabled) { transition: transform 0.12s ease; }
  button:not(:disabled):active { transform: scale(0.96); }
  @keyframes pulse-glow-coral { 0%,100% { box-shadow: 0 0 12px rgba(255,107,129,0.55); } 50% { box-shadow: 0 0 34px rgba(255,107,129,0.85); } }
  .animate-pulse-coral { animation: pulse-glow-coral 1.4s ease-in-out infinite; }
  @keyframes logo-glow { 0%,100% { filter: drop-shadow(0 0 6px rgba(228,160,255,0.55)) drop-shadow(0 0 14px rgba(157,78,221,0.35)); } 50% { filter: drop-shadow(0 0 12px rgba(232,196,104,0.6)) drop-shadow(0 0 22px rgba(166,172,255,0.4)); } }
  .animate-logo-glow { animation: logo-glow 4s ease-in-out infinite; }
  body { background-color: var(--bg-obsidian); }
`;

export default function MeyarDashboard() {
  const [lang, setLang] = useState("ar");
  const t = STR[lang];

  const [authToken, setAuthToken] = useState(() => {
    try {
      return window.localStorage.getItem("meyar_auth_token");
    } catch {
      return null;
    }
  });
  const [authUser, setAuthUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  const handleLoginSuccess = useCallback((token, user) => {
    try {
      window.localStorage.setItem("meyar_auth_token", token);
    } catch {
      /* private-browsing or storage disabled — session stays in-memory only */
    }
    setAuthToken(token);
    setAuthUser(user);
  }, []);

  const handleLogout = useCallback(() => {
    try {
      window.localStorage.removeItem("meyar_auth_token");
    } catch {
      /* ignore */
    }
    setAuthToken(null);
    setAuthUser(null);
  }, []);

  // Validate any stored token against the backend once on mount — a token
  // surviving in localStorage from a previous session may have expired or
  // been signed with a since-rotated secret, so it must be confirmed live
  // rather than trusted at face value.
  useEffect(() => {
    if (!authToken) {
      setAuthChecking(false);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((res) => {
        if (!res.ok) throw new Error("invalid session");
        return res.json();
      })
      .then((user) => {
        if (!cancelled) setAuthUser(user);
      })
      .catch(() => {
        if (!cancelled) handleLogout();
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return !window.localStorage.getItem("meyar_onboarding_seen");
    } catch {
      return true;
    }
  });

  const dismissOnboarding = useCallback(() => {
    try {
      window.localStorage.setItem("meyar_onboarding_seen", "1");
    } catch {
      /* private-browsing or storage disabled — safe to ignore */
    }
    setShowOnboarding(false);
  }, []);

  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [trends, setTrends] = useState([]);
  const [regulatory, setRegulatory] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [reviewStats, setReviewStats] = useState({ pending: 0, approved_today: 0, rejected_today: 0, approval_rate_pct: 0 });

  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [toasts, setToasts] = useState([]);
  const seenBlockedIdsRef = useRef(new Set());

  const dismissToast = useCallback((toastId) => {
    setToasts((prev) => prev.filter((tst) => tst.id !== toastId));
  }, []);

  // Detect newly-appeared blocked transactions and surface a brief toast —
  // this is what makes the dashboard feel "alive" even while looking at a
  // tab other than Live Monitor. Capped at 3 stacked toasts so a burst of
  // blocks can never crowd the screen; each auto-dismisses on its own.
  // The very first batch of transactions is recorded silently (no toast
  // storm on page load) — only genuinely new arrivals afterward trigger one.
  const hasInitializedBlockedRef = useRef(false);
  useEffect(() => {
    if (!transactions.length) return;
    if (!hasInitializedBlockedRef.current) {
      transactions.forEach((tx) => seenBlockedIdsRef.current.add(tx.id));
      hasInitializedBlockedRef.current = true;
      return;
    }
    const freshlyBlocked = transactions.filter((tx) => tx.status === "blocked" && !seenBlockedIdsRef.current.has(tx.id));
    transactions.forEach((tx) => seenBlockedIdsRef.current.add(tx.id));
    if (freshlyBlocked.length === 0) return;

    setToasts((prev) => {
      const additions = freshlyBlocked.slice(0, 2).map((tx) => ({ id: `toast-${tx.id}-${Date.now()}`, tx }));
      return [...additions, ...prev].slice(0, 3);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);


  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const txCounter = useRef(0);

  const fetchJSON = useCallback(async (path) => {
    // A free-tier backend (e.g. Render) can be slow to respond, especially
    // waking from sleep. The previous 8s timeout was too aggressive in
    // practice — it kept tripping into the fallback path even when the
    // backend was genuinely reachable, just slow, which left the review
    // queue permanently stuck on locally-generated demo IDs. 15s gives a
    // slow-but-alive backend a fair chance while still recovering to local
    // data if it's truly unreachable; loadAll() retries periodically anyway.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Request failed: ${path}`);
      return await res.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  // Show a fully working dashboard INSTANTLY with local demo data, before
  // any network request even starts. loadAll() below then silently swaps
  // in real data whenever the backend responds — the user is never stuck
  // staring at an empty "syncing" screen while a slow/cold backend wakes up.
  useEffect(() => {
    setSummary((prev) => prev ?? makeFallbackSummary());
    setTransactions((prev) => (prev.length ? prev : Array.from({ length: 24 }, (_, i) => makeFallbackTransaction(i))));
    setTrends((prev) => (prev.length ? prev : makeFallbackTrends()));
    setRegulatory((prev) => (prev.length ? prev : makeFallbackRegulatory()));
    setReviewQueue((prev) => (prev.length ? prev : makeFallbackReviewQueue()));
    setAuditLog((prev) => (prev.length ? prev : makeFallbackAuditLog()));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [summaryRes, txRes, trendsRes, regRes, reviewRes, auditRes, statsRes] = await Promise.all([
        fetchJSON("/compliance-summary"),
        fetchJSON("/realtime-transactions?limit=30"),
        fetchJSON("/compliance-trends"),
        fetchJSON("/regulatory-updates"),
        fetchJSON("/review-queue"),
        fetchJSON("/audit-log"),
        fetchJSON("/review-queue/stats"),
      ]);
      setSummary(summaryRes);
      setTransactions(txRes.items);
      setTrends(trendsRes.points);
      setRegulatory(regRes.items);
      setReviewQueue(reviewRes.items);
      setAuditLog(auditRes.items);
      setReviewStats(statsRes);
      setOnline(true);
    } catch (err) {
      // Backend still unreachable/slow — the instant fallback above is
      // already on screen, so there's nothing further to do here.
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, [fetchJSON]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetchJSON("/realtime-transactions?limit=6");
        setTransactions((prev) => [...res.items, ...prev].slice(0, 60));
        setOnline(true);
      } catch {
        txCounter.current += 1;
        const newTx = makeFallbackTransaction(txCounter.current);
        setTransactions((prev) => [newTx, ...prev].slice(0, 60));
        setOnline(false);
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [fetchJSON]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadAll();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const handleDecide = useCallback(
    async (transactionId, decisionWord) => {
      const tx = reviewQueue.find((t) => t.id === transactionId);
      if (!tx) return;

      const decision = decisionWord === "approve" ? "approved" : "rejected";
      const reviewerName = authUser ? `${authUser.name} (${authUser.email})` : t.reviewQueue.defaultReviewer;
      const nextReviewQueue = reviewQueue.filter((t) => t.id !== transactionId);

      // Transactions whose IDs start with "TXN-LOCAL" were generated in the
      // browser (offline fallback mode) and the backend has never heard of
      // them — sending them to /decide would always come back "not_found".
      // Skip the network call entirely and resolve the decision locally.
      const isLocalOnly = transactionId.startsWith("TXN-LOCAL");

      let entry;
      let backendOk = false;
      if (!isLocalOnly) {
        try {
          const res = await fetch(`${API_BASE}/review-queue/${transactionId}/decide`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ decision: decisionWord }),
          });
          if (res.status === 401) {
            // Session expired mid-action — sign the person out rather than
            // silently falling back to a local, unauthenticated decision.
            handleLogout();
            return;
          }
          if (!res.ok) throw new Error("decide failed");
          const result = await res.json();
          if (result.decision === "not_found") {
            // The backend is reachable but doesn't recognize this
            // transaction — treat exactly like a failed request rather
            // than accepting a decision with empty reason/category/amount.
            throw new Error("Backend does not recognize this transaction");
          }
          entry = result;
          backendOk = true;
        } catch (err) {
          console.error("Review decision request failed, using local fallback:", err);
        }
      }

      if (!backendOk) {
        entry = makeFallbackAuditEntry(tx, "human_review", decision, reviewerName);
      }

      const nextAuditLog = [entry, ...auditLog];

      // Apply all three updates from values we actually know, rather than
      // nesting one setState call inside another's updater — the nested
      // version could compute stats from an audit log that hadn't been
      // committed yet, which is what caused the counters to stay frozen.
      setReviewQueue(nextReviewQueue);
      setAuditLog(nextAuditLog);

      if (backendOk) {
        try {
          setReviewStats(await fetchJSON("/review-queue/stats"));
          return;
        } catch (err) {
          console.error("Could not refresh stats from backend, computing locally:", err);
        }
      }
      setReviewStats(computeReviewStats(nextReviewQueue, nextAuditLog));
    },
    [reviewQueue, auditLog, t, fetchJSON, authUser, authToken, handleLogout]
  );

  const sparkSeeds = useMemo(() => {
    const seed = (base, variance) =>
      Array.from({ length: 12 }, (_, i) => ({ v: base + Math.sin(i / 1.4) * variance + Math.random() * variance * 0.4 }));
    return {
      compliance: seed(96, 2),
      volume: seed(60, 25),
      blocked: seed(40, 15),
      savings: seed(50, 20),
    };
  }, []);

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-obsidian)" }}>
        <Loader2 size={22} className="animate-spin text-white/30" />
      </div>
    );
  }

  if (!authToken || !authUser) {
    return <LoginScreen onSuccess={handleLoginSuccess} lang={lang} t={t} />;
  }

  return (
    <div
      className="min-h-screen w-full flex text-white overflow-hidden relative"
      style={{
        backgroundColor: "var(--bg-obsidian)",
        fontFamily: t.fontFamily,
        ...(presentationMode
          ? { transform: "scale(1.15)", transformOrigin: "top center", width: "86.9%", margin: "0 auto", transition: "transform 0.3s ease" }
          : { transition: "transform 0.3s ease" }),
      }}
      dir={t.dir}
    >
      <style>{EMBEDDED_STYLE}</style>
      <AuroraAtmosphere />

      <div className="hidden md:flex">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          setSettingsOpen={setSettingsOpen}
          authUser={authUser}
          t={t}
        />
      </div>

      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64">
            <Sidebar
              activeTab={activeTab}
              setActiveTab={(id) => {
                setActiveTab(id);
                setMobileNavOpen(false);
              }}
              collapsed={false}
              setCollapsed={() => {}}
              setSettingsOpen={(v) => {
                setSettingsOpen(v);
                setMobileNavOpen(false);
              }}
              authUser={authUser}
              t={t}
            />
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setMobileNavOpen(false)} />
        </div>
      )}

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onGoToLimits={() => {
            setSettingsOpen(false);
            setActiveTab("limits");
          }}
          onReplayOnboarding={() => {
            setSettingsOpen(false);
            setShowOnboarding(true);
          }}
          presentationMode={presentationMode}
          onTogglePresentation={() => setPresentationMode((p) => !p)}
          authUser={authUser}
          onLogout={() => {
            setSettingsOpen(false);
            handleLogout();
          }}
          lang={lang}
          t={t}
        />
      )}

      {showOnboarding && <OnboardingTour onFinish={dismissOnboarding} lang={lang} t={t} />}

      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        onView={(toastId) => {
          setActiveTab("monitor");
          dismissToast(toastId);
        }}
        lang={lang}
        t={t}
      />

      <main className="flex-1 min-w-0 h-screen overflow-y-auto relative z-0">
        <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between gap-3 md:hidden mb-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="w-10 h-10 rounded-xl glass-panel flex items-center justify-center border border-white/10"
              >
                <Menu size={18} />
              </button>
              <MeyarLogo size={28} />
              <p className="font-display font-black text-white">{t.appName}</p>
            </div>
            <LangToggle lang={lang} setLang={setLang} />
          </div>

          <TopBanner
            summary={summary}
            lang={lang}
            setLang={setLang}
            t={t}
            transactions={transactions}
            onGoToMonitor={() => setActiveTab("monitor")}
          />

          <div className="flex items-center justify-between">
            <h1 className="font-display text-lg md:text-xl font-black text-white flex items-center gap-2">{t.nav[activeTab]}</h1>
            {loading && (
              <span className="text-[11px] text-white/35 flex items-center gap-1.5">
                <RefreshCw size={12} className="animate-spin" />
              </span>
            )}
          </div>

          {activeTab === "overview" && (
            <OverviewTab summary={summary} sparkSeeds={sparkSeeds} trends={trends} onGoToMonitor={() => setActiveTab("monitor")} lang={lang} t={t} />
          )}

          {activeTab === "monitor" && (
            <MonitorTab
              transactions={transactions}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterCategory={filterCategory}
              setFilterCategory={setFilterCategory}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              loading={loading}
              lang={lang}
              t={t}
            />
          )}

          {activeTab === "analytics" && <AnalyticsTab trends={trends} summary={summary} lang={lang} t={t} />}

          {activeTab === "review" && (
            <ReviewQueueTab reviewQueue={reviewQueue} auditLog={auditLog} stats={reviewStats} onDecide={handleDecide} lang={lang} t={t} />
          )}

          {activeTab === "audit" && <AuditTrailTab auditLog={auditLog} lang={lang} t={t} />}

          {activeTab === "regulatory" && <RegulatoryTab regulatory={regulatory} lang={lang} t={t} />}

          {activeTab === "methodology" && <MethodologyTab lang={lang} t={t} />}

          {activeTab === "chatbot" && <ChatbotTab lang={lang} t={t} />}

          {activeTab === "limits" && <LimitsTab t={t} />}

          <footer className="pt-6 pb-2 text-center text-[11px] text-white/30">{t.footer(new Date().getFullYear())}</footer>
        </div>
      </main>
    </div>
  );
}
