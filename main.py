"""
Meyar (معيار) — نظام المُشرّع الذكي
Backend API — FastAPI

منظومة معيار للرقابة المالية اللحظية.

هذا الإصدار يطبّق نموذج "المنع المتدرج" على مستويين:

  المستوى ١ — قواعد صريحة وقطعية وقابلة للتحقق آلياً (سقوف رقمية، قوائم
  حظر رسمية، تراخيص). هذه فقط هي التي يُسمح للنظام بمنعها آلياً وفورياً
  (blocked / auto_block)، لأنها لا تحتمل اجتهاداً بشرياً.

  المستوى ٢ — أي حالة فيها اجتهاد أو غموض (نمط سلوكي، شبهة شرعية، شبهة
  غسل أموال احتمالية) لا تُمنع آلياً أبداً، بل تُعلَّق وتُحال لمراجعة
  بشرية (flagged / pending_review) مع تحديد الجهة المختصة بالمراجعة.

هذا التصميم يعالج صراحة ثلاث نقاط ضعف شائعة في أنظمة الرقابة الآلية:
  1) خطأ الفهم القانوني (Hallucination) — لا قرار نهائي آلي في الحالات الاجتهادية.
  2) المسؤولية القانونية (Liability) — يوجد دائماً طرف بشري مسؤول عن أي قرار اجتهادي.
  3) حدود صلاحيات الخدمات المصرفية المفتوحة — النظام "يوقف" فقط ما تسمح
     قواعد صريحة موثّقة بإيقافه؛ الباقي توصية للمراجعة لا تنفيذ مباشر.

Run:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import random
import re
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

import numpy as np
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.ensemble import RandomForestClassifier

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Meyar Compliance API",
    description="واجهة برمجية لمنظومة معيار للرقابة المالية اللحظية",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RNG = random.Random(42)

# ---------------------------------------------------------------------------
# Risk-scoring model — a real, trained classifier (not a lookup table).
#
# Scope, honestly stated: no real historical bank data is available for a
# hackathon project, so this model is trained on synthetically generated
# feature/label pairs with a deliberately noisy relationship — realistic
# enough to be a genuine learning problem, not a hardcoded rule in disguise.
# The model outputs an actual probability (predict_proba), and that
# probability — not a flat random roll — decides whether a Level-2
# transaction is worth flagging for human review.
#
# Deliberate design boundary: this model is used ONLY to help surface
# candidates for the interpretive Level-2 review queue. It is never used
# for Level-1 decisions, which must stay purely rule-based and
# deterministic (a limit is either exceeded or it isn't) — mixing a
# probabilistic model into a "definitive rule" would break the entire
# accountability argument this system is built on.
# ---------------------------------------------------------------------------

_RISK_FEATURE_NAMES = ["amount_norm", "hour_norm", "deviation", "freq_last_hour_norm", "is_first_time"]


def _make_synthetic_training_data(n: int = 4000, seed: int = 42):
    rng = np.random.default_rng(seed)
    amount = rng.uniform(250, 480_000, n)
    hour = rng.integers(0, 24, n)
    deviation = rng.uniform(0, 1, n)
    freq_last_hour = rng.integers(0, 8, n)
    is_first_time = rng.integers(0, 2, n)

    risk_score = (
        0.35 * (amount / 480_000)
        + 0.30 * deviation
        + 0.20 * (freq_last_hour / 8)
        + 0.15 * is_first_time
        + rng.normal(0, 0.08, n)
    )
    label = (risk_score > 0.55).astype(int)

    X = np.column_stack([amount / 480_000, hour / 24, deviation, freq_last_hour / 8, is_first_time])
    return X, label


def _train_risk_model() -> RandomForestClassifier:
    X, y = _make_synthetic_training_data()
    model = RandomForestClassifier(n_estimators=80, max_depth=6, random_state=42)
    model.fit(X, y)
    return model


RISK_MODEL = _train_risk_model()
RISK_MODEL_TRAINED_AT = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
RISK_FLAG_THRESHOLD = 0.55


def _score_transaction_risk(amount: float, hour: int, deviation: float, freq_last_hour: int, is_first_time: int) -> dict:
    """Runs the actual trained model on one transaction's features and
    returns its probability plus which feature drove that probability most,
    so the UI can show *why* the model flagged something instead of a
    black-box number."""
    features = np.array(
        [[amount / 480_000, hour / 24, deviation, freq_last_hour / 8, is_first_time]]
    )
    prob = float(RISK_MODEL.predict_proba(features)[0][1])

    contributions = RISK_MODEL.feature_importances_ * features[0]
    dominant_idx = int(np.argmax(contributions))
    dominant_feature = _RISK_FEATURE_NAMES[dominant_idx]

    return {"probability": round(prob, 4), "dominant_feature": dominant_feature}


# ---------------------------------------------------------------------------
# Static reference data
# ---------------------------------------------------------------------------

INSTITUTIONS = [
    "البنك الأهلي السعودي",
    "بنك الرياض",
    "بنك الرياض المطور",
    "البنك السعودي الفرنسي",
    "بنك ساب",
    "بنك الجزيرة",
    "بنك البلاد",
    "مصرف الإنماء",
    "بنك الخليج الدولي",
    "STC Pay",
    "تطبيق حصلتي",
    "بنك الاستثمار العربي الوطني",
]

# ---------------------------------------------------------------------------
# Two-tier rule catalogue
#
# LEVEL 1 — definitive / machine-checkable → automatic block is defensible
#           because it requires no interpretation (a number vs. a limit,
#           a lookup against an official list).
# LEVEL 2 — interpretive / probabilistic → the system may never issue a
#           final block on its own; it flags + names the required human
#           reviewer instead.
# ---------------------------------------------------------------------------

LEVEL1_BLOCKED_RULES = [
    {
        "reason": "تجاوز حدود الرخصة الممنوحة - المادة ٤",
        "article": "المادة ٤",
        "circular_number": None,
        "basis": "مقارنة رقمية مباشرة بسقف الترخيص المسجل — لا اجتهاد",
        "category": "تجاوز الحدود المسموحة",
    },
    {
        "reason": "تحويل مالي إلى جهة غير مرخصة من ساما - المادة ١٢",
        "article": "المادة ١٢",
        "circular_number": "تعميم رقم ٤٩",
        "basis": "تحقق مطابقة مباشر مع سجل الجهات المرخّصة من ساما — لا اجتهاد",
        "category": "جهة أو حساب غير موثوق",
    },
    {
        "reason": "تجاوز السقف اليومي المسموح للعميل - التعميم رقم ٥٥",
        "article": "التعميم رقم ٥٥",
        "circular_number": "تعميم رقم ٥٥",
        "basis": "مقارنة رقمية تراكمية بسقف يومي معلن — لا اجتهاد",
        "category": "تجاوز الحدود المسموحة",
    },
    {
        "reason": "محاولة تحويل لحساب مدرج على قائمة الحظر الرسمية",
        "article": None,
        "circular_number": None,
        "basis": "تحقق مطابقة مباشر مع قائمة حظر رسمية معتمدة — لا اجتهاد",
        "category": "جهة أو حساب غير موثوق",
    },
    {
        "reason": "غياب بيانات إلزامية لمعرفة العميل (KYC) - المادة ٩",
        "article": "المادة ٩",
        "circular_number": "تعميم رقم ١٠٢",
        "basis": "تحقق اكتمال حقول إلزامية — لا اجتهاد",
        "category": "نقص بيانات العميل (KYC)",
    },
]

LEVEL2_FLAGGED_RULES = [
    {
        "reason": "نمط معاملات يطابق مؤشرات احتمالية لغسل الأموال - يتطلب مراجعة",
        "article": "المادة ٧",
        "circular_number": "تعميم رقم ٧٧",
        "basis": "تقييم احتمالي (نموذج كشف أنماط) — يحتاج قراراً بشرياً نهائياً",
        "reviewer": "موظف الامتثال",
        "category": "اشتباه غسل أموال",
        "feature_tag": "amount_norm",
    },
    {
        "reason": "قيمة المعاملة أعلى من المتوسط التاريخي للعميل بنسبة كبيرة",
        "article": None,
        "circular_number": None,
        "basis": "انحراف إحصائي عن سلوك معتاد — لا يعني مخالفة بالضرورة",
        "reviewer": "موظف الامتثال",
        "category": "نمط سلوكي غير معتاد",
        "feature_tag": "deviation",
    },
    {
        "reason": "أول معاملة من هذا النوع لهذا الحساب",
        "article": None,
        "circular_number": None,
        "basis": "غياب سجل تاريخي كافٍ للمقارنة — يحتاج تحققاً بشرياً",
        "reviewer": "موظف الامتثال",
        "category": "نمط سلوكي غير معتاد",
        "feature_tag": "is_first_time",
    },
    {
        "reason": "عملية قد تقع خارج نطاق النشاط التجاري المرخّص",
        "article": None,
        "circular_number": None,
        "basis": "تصنيف اجتهادي لنوع النشاط — قابل للتفسير",
        "reviewer": "موظف الامتثال",
        "category": "نمط سلوكي غير معتاد",
        "feature_tag": None,
    },
    {
        "reason": "شبهة مخالفة شرعية محتملة تستدعي رأياً شرعياً متخصصاً",
        "article": None,
        "circular_number": None,
        "basis": "مسائل الاجتهاد الشرعي تختلف بين الهيئات — لا يقرر النظام فيها",
        "reviewer": "الهيئة الشرعية",
        "category": "شبهة شرعية",
        "feature_tag": None,
    },
    {
        "reason": "تكرار غير طبيعي للمعاملات خلال نافذة زمنية قصيرة",
        "article": None,
        "circular_number": None,
        "basis": "نمط سلوكي مرجّح إحصائياً — ليس دليلاً قاطعاً",
        "reviewer": "موظف الامتثال",
        "category": "نمط سلوكي غير معتاد",
        "feature_tag": "freq_last_hour_norm",
    },
]

LEVEL_PASSED_RULES = [
    "مطابقة كاملة لأنظمة مؤسسة النقد - لا مخالفات",
    "ضمن السقف المصرح به وفق ترخيص العميل",
    "تحقق فوري من هوية المستفيد ونجاح KYC",
    "متوافقة مع تعميم ساما رقم ٩٨ - الخدمات المالية المفتوحة",
]

VIOLATION_CATEGORIES = [
    "تجاوز الحدود المسموحة",
    "جهة أو حساب غير موثوق",
    "نقص بيانات العميل (KYC)",
    "اشتباه غسل أموال",
    "شبهة شرعية",
    "نمط سلوكي غير معتاد",
]

CIRCULAR_REGISTRY = [
    {
        "number": "تعميم رقم ١٠٢",
        "title": "ضوابط التحقق من هوية العميل في الخدمات المصرفية المفتوحة",
        "issued_date": "2024-03-17",
        "summary_ar": "يشترط اكتمال بيانات هوية المستفيد الفعلي (KYC) قبل تنفيذ أي معاملة عبر واجهات الخدمات المصرفية المفتوحة.",
        "summary_en": "Requires complete beneficial-owner (KYC) data before executing any transaction via Open Banking interfaces.",
    },
    {
        "number": "تعميم رقم ٩٨",
        "title": "تحديث السقوف اليومية لمعاملات الدفع الفوري",
        "issued_date": "2023-11-02",
        "summary_ar": "يحدّث السقوف اليومية المسموح بها لمعاملات الدفع الفوري عبر القنوات الرقمية.",
        "summary_en": "Updates the daily limits permitted for instant payment transactions across digital channels.",
    },
    {
        "number": "تعميم رقم ٨٥",
        "title": "متطلبات الإفصاح عن المستفيد الفعلي للحسابات التجارية",
        "issued_date": "2023-06-21",
        "summary_ar": "يُلزم الحسابات التجارية بالإفصاح الكامل عن هوية المستفيد الفعلي منها.",
        "summary_en": "Requires commercial accounts to fully disclose the identity of their beneficial owner.",
    },
    {
        "number": "تعميم رقم ٧٧",
        "title": "ضوابط مكافحة غسل الأموال في خدمات التحويل الرقمي",
        "issued_date": "2022-09-11",
        "summary_ar": "ينظّم ضوابط مكافحة غسل الأموال المطبَّقة على خدمات التحويل المالي الرقمي.",
        "summary_en": "Governs AML controls applied to digital money-transfer services.",
    },
    {
        "number": "تعميم رقم ٦٤",
        "title": "تنظيم واجهات برمجة التطبيقات المصرفية المفتوحة (Open Banking)",
        "issued_date": "2022-01-06",
        "summary_ar": "ينظّم صلاحيات واجهات الخدمات المصرفية المفتوحة، ويحصرها في القراءة أو بدء العملية بموافقة العميل.",
        "summary_en": "Regulates Open Banking API permissions, limited to read access or customer-consented initiation.",
    },
    {
        "number": "تعميم رقم ٥٥",
        "title": "تحديد الحد الأقصى اليومي لمعاملات المحافظ الرقمية",
        "issued_date": "2021-08-19",
        "summary_ar": "يحدد الحد الأقصى اليومي المسموح به لمعاملات المحافظ الرقمية الفردية.",
        "summary_en": "Sets the daily maximum permitted for individual digital wallet transactions.",
    },
    {
        "number": "تعميم رقم ٤٩",
        "title": "متطلبات ترخيص مزودي خدمات الدفع الصغرى",
        "issued_date": "2021-02-23",
        "summary_ar": "يحدد شروط ومتطلبات ترخيص الجهات التي تقدّم خدمات الدفع الصغرى.",
        "summary_en": "Sets licensing conditions and requirements for micro-payment service providers.",
    },
    {
        "number": "تعميم رقم ١١٠",
        "title": "حماية بيانات العملاء الشخصية في الخدمات المالية الرقمية",
        "issued_date": "2024-07-02",
        "summary_ar": "يمنع مشاركة بيانات معاملة العميل مع أي طرف ثالث دون موافقته الصريحة.",
        "summary_en": "Prohibits sharing a customer's transaction data with any third party without explicit consent.",
    },
    {
        "number": "تعميم رقم ٣٠",
        "title": "معايير الأمان السيبراني لواجهات الخدمات المصرفية المفتوحة",
        "issued_date": "2020-05-13",
        "summary_ar": "يضع الحد الأدنى من معايير التشفير وسجلات الوصول لواجهات Open Banking.",
        "summary_en": "Sets minimum encryption and access-logging standards for Open Banking interfaces.",
    },
]

CIRCULAR_DATA_DISCLAIMER_AR = (
    "أرقام التعاميم وتواريخ إصدارها أدناه بيانات تجريبية لأغراض العرض، وليست مصدراً رسمياً حرفياً — "
    "لعدم توفر واجهة مجانية رسمية لتعاميم ساما وقت بناء هذا النموذج. للمصدر الرسمي: sama.gov.sa"
)
CIRCULAR_DATA_DISCLAIMER_EN = (
    "Circular numbers and issue dates below are demo data for presentation purposes, not a verbatim "
    "official source — no free official SAMA circular feed was available while building this prototype. "
    "Official source: sama.gov.sa"
)

# Backward-compatible flat list (kept because a few older lookups elsewhere use it)
CIRCULAR_TOPICS = [(c["number"], c["title"]) for c in CIRCULAR_REGISTRY]

_CIRCULAR_BY_NUMBER = {c["number"]: c for c in CIRCULAR_REGISTRY}

# ---------------------------------------------------------------------------
# Compliance-cost-saved % — documented methodology (fixes the "un-sourced
# 70%" gap: the figure is now *derived* from disclosed, editable assumptions
# instead of being a hardcoded marketing number).
# ---------------------------------------------------------------------------

COST_METHODOLOGY = {
    "baseline_manual_hours_per_month": 1200,
    "baseline_note_ar": "تقدير: ساعات المراجعة اليدوية الشهرية لفريق امتثال من ٨ موظفين قبل الأتمتة",
    "automated_review_hours_per_month": 360,
    "automated_note_ar": (
        "ساعات المراجعة البشرية المتبقية بعد الأتمتة — تقتصر على حالات "
        "«المستوى ٢» الاجتهادية فقط، لأن المستوى ١ يُنفَّذ آلياً بالكامل"
    ),
}


def _compliance_cost_saved_pct() -> float:
    baseline = COST_METHODOLOGY["baseline_manual_hours_per_month"]
    automated = COST_METHODOLOGY["automated_review_hours_per_month"]
    return round((1 - automated / baseline) * 100, 1)


COST_METHODOLOGY_TEXT_AR = (
    f"النسبة محسوبة كـ (١ − ساعات المراجعة بعد الأتمتة ÷ ساعات المراجعة قبل الأتمتة) × ١٠٠. "
    f"الافتراض الأساسي: {COST_METHODOLOGY['baseline_manual_hours_per_month']} ساعة مراجعة يدوية شهرياً قبل النظام، "
    f"مقابل {COST_METHODOLOGY['automated_review_hours_per_month']} ساعة متبقية بعد الأتمتة (مراجعة حالات المستوى ٢ فقط). "
    f"هذا تقدير تشغيلي قابل للمراجعة، وليس رقماً مدققاً مالياً."
)

COST_METHODOLOGY_TEXT_EN = (
    "Calculated as (1 − post-automation review hours ÷ pre-automation review hours) × 100. "
    f"Baseline assumption: {COST_METHODOLOGY['baseline_manual_hours_per_month']} manual review hours/month "
    f"before the system, vs. {COST_METHODOLOGY['automated_review_hours_per_month']} hours remaining after "
    "automation (Level-2 human review only). This is an operational estimate, not an audited figure."
)

# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------


class ComplianceSummary(BaseModel):
    compliance_score: float
    compliance_score_delta: float
    transactions_scanned_today: int
    transactions_scanned_delta_pct: float
    compliance_cost_saved_pct: float
    cost_methodology_ar: str
    cost_methodology_en: str
    total_monitored_volume_sar: float
    total_blocked_violations: int
    total_blocked_delta_pct: float
    saved_penalties_value_sar: float
    system_status: str
    ai_core_online: bool
    last_sync: str


TxStatus = Literal["passed", "flagged", "blocked"]
ActionLevel = Literal["auto_block", "pending_review", "no_action"]
Certainty = Literal["rule_based", "ai_assessed"]


class Transaction(BaseModel):
    id: str
    timestamp: str
    institution: str
    amount_sar: float
    status: TxStatus
    action_level: ActionLevel
    certainty: Certainty
    legal_reason: str
    decision_basis: Optional[str] = None
    reviewer_required: Optional[str] = None
    article_reference: Optional[str] = None
    violation_category: Optional[str] = None
    circular_number: Optional[str] = None
    ai_risk_score: Optional[float] = None
    customer_ref: str
    channel: str


class TransactionsResponse(BaseModel):
    items: List[Transaction]
    total: int
    passed_count: int
    flagged_count: int
    blocked_count: int


class TrendPoint(BaseModel):
    month: str
    target_compliance: float
    actual_compliance: float
    operational_cost_index: float
    cost_reduction_pct: float


class ComplianceTrendsResponse(BaseModel):
    points: List[TrendPoint]
    average_compliance: float
    average_cost_reduction_pct: float


class RegulatoryUpdate(BaseModel):
    id: str
    circular_number: str
    title: str
    issued_date: str
    parsing_status: Literal["completed", "in_progress", "queued"]
    rules_generated: int
    affected_institutions: int
    summary_ar: str
    summary_en: str
    code_rule_id: Optional[str] = None


class RegulatoryUpdatesResponse(BaseModel):
    items: List[RegulatoryUpdate]
    total_parsed: int
    total_in_progress: int
    disclaimer_ar: str
    disclaimer_en: str


class ChatbotQuery(BaseModel):
    question: str
    lang: Literal["ar", "en"] = "ar"


class ChatbotSource(BaseModel):
    circular_number: str
    title: str


class ChatbotAnswer(BaseModel):
    answer: str
    confidence: Literal["high", "medium", "none"]
    sources: List[ChatbotSource]
    disclaimer: str


class SuggestedQuestions(BaseModel):
    questions_ar: List[str]
    questions_en: List[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _generate_transaction(idx: int, base_time: datetime) -> Transaction:
    roll = RNG.random()
    ts = base_time - timedelta(seconds=idx * RNG.randint(4, 45))
    amount = round(RNG.uniform(250, 480_000), 2)

    if roll < 0.08:
        rule = RNG.choice(LEVEL1_BLOCKED_RULES)
        return Transaction(
            id=f"TXN-{100000 + idx}",
            timestamp=_iso(ts),
            institution=RNG.choice(INSTITUTIONS),
            amount_sar=amount,
            status="blocked",
            action_level="auto_block",
            certainty="rule_based",
            legal_reason=rule["reason"],
            decision_basis=rule["basis"],
            reviewer_required=None,
            article_reference=rule["article"],
            violation_category=rule["category"],
            circular_number=rule["circular_number"],
            ai_risk_score=None,  # Level 1 is deterministic — a model score has no role here
            customer_ref=f"CUST-{RNG.randint(10000, 99999)}",
            channel=RNG.choice(["Open Banking API", "تطبيق الجوال", "الإنترنت البنكي", "نقاط البيع"]),
        )

    # A rare, independent Sharia-review branch: whether a transaction raises
    # a Sharia concern is a categorical judgment about its nature (e.g. the
    # underlying contract), not something the numeric risk features (amount,
    # frequency, deviation...) can capture — so it's decided separately
    # rather than forced through the statistical model.
    if RNG.random() < 0.03:
        rule = next(r for r in LEVEL2_FLAGGED_RULES if r["category"] == "شبهة شرعية")
        return Transaction(
            id=f"TXN-{100000 + idx}",
            timestamp=_iso(ts),
            institution=RNG.choice(INSTITUTIONS),
            amount_sar=amount,
            status="flagged",
            action_level="pending_review",
            certainty="ai_assessed",
            legal_reason=rule["reason"],
            decision_basis=rule["basis"],
            reviewer_required=rule["reviewer"],
            article_reference=rule["article"],
            violation_category=rule["category"],
            circular_number=rule["circular_number"],
            ai_risk_score=None,
            customer_ref=f"CUST-{RNG.randint(10000, 99999)}",
            channel=RNG.choice(["Open Banking API", "تطبيق الجوال", "الإنترنت البنكي", "نقاط البيع"]),
        )

    # Everything else is scored by the real trained model. These engineered
    # features (deviation, recent frequency, first-time flag) are simulated
    # here since no real customer transaction history exists in this demo —
    # but the probability itself is a genuine model output, not a lookup.
    hour = ts.hour
    deviation = RNG.random()
    freq_last_hour = RNG.randint(0, 7)
    is_first_time = 1 if RNG.random() < 0.15 else 0

    risk = _score_transaction_risk(amount, hour, deviation, freq_last_hour, is_first_time)

    if risk["probability"] > RISK_FLAG_THRESHOLD:
        candidates = [r for r in LEVEL2_FLAGGED_RULES if r["feature_tag"] == risk["dominant_feature"]]
        rule = RNG.choice(candidates) if candidates else RNG.choice(LEVEL2_FLAGGED_RULES)
        return Transaction(
            id=f"TXN-{100000 + idx}",
            timestamp=_iso(ts),
            institution=RNG.choice(INSTITUTIONS),
            amount_sar=amount,
            status="flagged",
            action_level="pending_review",
            certainty="ai_assessed",
            legal_reason=rule["reason"],
            decision_basis=rule["basis"],
            reviewer_required=rule["reviewer"],
            article_reference=rule["article"],
            violation_category=rule["category"],
            circular_number=rule["circular_number"],
            ai_risk_score=risk["probability"],
            customer_ref=f"CUST-{RNG.randint(10000, 99999)}",
            channel=RNG.choice(["Open Banking API", "تطبيق الجوال", "الإنترنت البنكي", "نقاط البيع"]),
        )

    reason = RNG.choice(LEVEL_PASSED_RULES)
    return Transaction(
        id=f"TXN-{100000 + idx}",
        timestamp=_iso(ts),
        institution=RNG.choice(INSTITUTIONS),
        amount_sar=amount,
        status="passed",
        action_level="no_action",
        certainty="rule_based",
        legal_reason=reason,
        decision_basis="مطابقة قواعد صريحة معلنة",
        reviewer_required=None,
        article_reference=None,
        violation_category=None,
        circular_number=None,
        ai_risk_score=risk["probability"],
        customer_ref=f"CUST-{RNG.randint(10000, 99999)}",
        channel=RNG.choice(["Open Banking API", "تطبيق الجوال", "الإنترنت البنكي", "نقاط البيع"]),
    )


# ---------------------------------------------------------------------------
# Endpoints — dashboard data
# ---------------------------------------------------------------------------


@app.get("/")
def root():
    return {
        "service": "Meyar Compliance API",
        "status": "operational",
        "message": "منظومة معيار تعمل بكامل طاقتها",
    }


@app.get("/api/compliance-summary", response_model=ComplianceSummary)
def compliance_summary():
    return ComplianceSummary(
        compliance_score=98.4,
        compliance_score_delta=0.6,
        transactions_scanned_today=RNG.randint(184_000, 212_000),
        transactions_scanned_delta_pct=12.3,
        compliance_cost_saved_pct=_compliance_cost_saved_pct(),
        cost_methodology_ar=COST_METHODOLOGY_TEXT_AR,
        cost_methodology_en=COST_METHODOLOGY_TEXT_EN,
        total_monitored_volume_sar=round(RNG.uniform(2.1e9, 2.6e9), 2),
        total_blocked_violations=RNG.randint(320, 410),
        total_blocked_delta_pct=-8.4,
        saved_penalties_value_sar=round(RNG.uniform(18_000_000, 24_500_000), 2),
        system_status="المنظومة آمنة - الرقابة الذاتية نشطة (المستوى ١ آلي / المستوى ٢ بمراجعة بشرية)",
        ai_core_online=True,
        last_sync=_iso(_now()),
    )


@app.get("/api/realtime-transactions", response_model=TransactionsResponse)
def realtime_transactions(
    limit: int = Query(default=40, ge=1, le=200),
    status: Optional[TxStatus] = Query(default=None),
    category: Optional[str] = Query(default=None),
):
    base_time = _now()
    all_items = [_generate_transaction(i, base_time) for i in range(limit * 3)]

    if status:
        all_items = [t for t in all_items if t.status == status]
    if category:
        all_items = [t for t in all_items if t.violation_category == category]

    items = all_items[:limit]

    return TransactionsResponse(
        items=items,
        total=len(items),
        passed_count=sum(1 for t in items if t.status == "passed"),
        flagged_count=sum(1 for t in items if t.status == "flagged"),
        blocked_count=sum(1 for t in items if t.status == "blocked"),
    )


@app.get("/api/violation-categories")
def get_violation_categories():
    return {"items": VIOLATION_CATEGORIES}


@app.get("/api/compliance-trends", response_model=ComplianceTrendsResponse)
def compliance_trends():
    months = [
        "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
        "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
    ]

    points: List[TrendPoint] = []
    max_reduction = _compliance_cost_saved_pct()
    cumulative_cost_reduction = max_reduction * 0.6
    for i, month in enumerate(months):
        target = 95.0 + (i * 0.15)
        actual = target - RNG.uniform(-2.5, 1.2)
        cumulative_cost_reduction = min(max_reduction, cumulative_cost_reduction + RNG.uniform(1.0, 2.4))
        points.append(
            TrendPoint(
                month=month,
                target_compliance=round(target, 2),
                actual_compliance=round(actual, 2),
                operational_cost_index=round(100 - cumulative_cost_reduction, 2),
                cost_reduction_pct=round(cumulative_cost_reduction, 2),
            )
        )

    avg_compliance = round(sum(p.actual_compliance for p in points) / len(points), 2)
    avg_cost_reduction = round(sum(p.cost_reduction_pct for p in points) / len(points), 2)

    return ComplianceTrendsResponse(
        points=points,
        average_compliance=avg_compliance,
        average_cost_reduction_pct=avg_cost_reduction,
    )


@app.get("/api/regulatory-updates", response_model=RegulatoryUpdatesResponse)
def regulatory_updates():
    items: List[RegulatoryUpdate] = []
    for i, circ in enumerate(CIRCULAR_REGISTRY):
        status_roll = RNG.random()
        if status_roll < 0.7:
            parsing_status: Literal["completed", "in_progress", "queued"] = "completed"
        elif status_roll < 0.9:
            parsing_status = "in_progress"
        else:
            parsing_status = "queued"

        rules_generated = RNG.randint(4, 38) if parsing_status != "queued" else 0

        items.append(
            RegulatoryUpdate(
                id=f"CIRC-{900 + i}",
                circular_number=circ["number"],
                title=circ["title"],
                issued_date=circ["issued_date"],
                parsing_status=parsing_status,
                rules_generated=rules_generated,
                affected_institutions=RNG.randint(6, len(INSTITUTIONS)),
                summary_ar=(
                    f"{circ['summary_ar']} حوّل محرك الذكاء الاصطناعي هذا النص إلى {rules_generated} "
                    f"قاعدة برمجية قابلة للتنفيذ اللحظي."
                    if parsing_status != "queued"
                    else f"{circ['summary_ar']} — لا يزال في طابور المعالجة بانتظار التحويل إلى قواعد."
                ),
                summary_en=(
                    f"{circ['summary_en']} The AI engine converted this text into {rules_generated} "
                    f"executable rules."
                    if parsing_status != "queued"
                    else f"{circ['summary_en']} Still queued, awaiting conversion into rules."
                ),
                code_rule_id=f"RULE-SET-{700 + i}" if parsing_status == "completed" else None,
            )
        )

    return RegulatoryUpdatesResponse(
        items=items,
        total_parsed=sum(1 for i in items if i.parsing_status == "completed"),
        total_in_progress=sum(1 for i in items if i.parsing_status == "in_progress"),
        disclaimer_ar=CIRCULAR_DATA_DISCLAIMER_AR,
        disclaimer_en=CIRCULAR_DATA_DISCLAIMER_EN,
    )


# ---------------------------------------------------------------------------
# Chatbot — two-layer design:
#
#   Layer A — conversational intents (greetings, thanks, farewells, "who are
#   you", "what can you do"). These carry no regulatory claim, so they get a
#   natural canned reply with no citation needed.
#
#   Layer B — regulatory / system questions. These answer ONLY from a bounded
#   local knowledge base and always cite a source. If nothing matches with
#   reasonable confidence, the bot says so explicitly instead of guessing.
#   Multiple sources are only combined when the match is genuinely strong for
#   more than one entry — a single weak keyword hit shared by two unrelated
#   entries no longer produces a confusing merged answer.
# ---------------------------------------------------------------------------

DISCLAIMER_AR = (
    "الإجابات هنا مبنية حصراً على قاعدة معرفة محلية مبسّطة لأغراض العرض التجريبي (Hackathon)، "
    "وليست نصوصاً رسمية حرفية من ساما ولا استشارة قانونية أو شرعية معتمدة. للمصدر الرسمي "
    "يُرجى مراجعة sama.gov.sa مباشرة."
)
DISCLAIMER_EN = (
    "Answers are generated strictly from a simplified local knowledge base for demo purposes, "
    "not verbatim official SAMA text or certified legal/Sharia advice. For the authoritative "
    "source, consult sama.gov.sa directly."
)

# --- Layer A: conversational intents ---------------------------------------

INTENTS = [
    {
        "id": "greeting",
        "keywords": ["اهلا", "أهلا", "هلا", "مرحبا", "السلام عليكم", "صباح الخير", "مساء الخير", "hi", "hello", "hey", "salam"],
        "answer_ar": "أهلاً! أنا مساعد التشريعات في معيار. أقدر أجاوبك عن تعاميم ساما المحمّلة بالنظام، أو عن نموذج المستويين (منع آلي / مراجعة بشرية)، أو المسؤولية والحدود. جرّب تسألني عن أي موضوع منها 🙂",
        "answer_en": "Hi! I'm Meyar's regulatory assistant. I can answer questions about the loaded SAMA circulars, the two-tier model (auto-block vs. human review), or accountability and limits. Ask me anything from those areas.",
    },
    {
        "id": "thanks",
        "keywords": ["شكرا", "شكراً", "يعطيك العافية", "تسلم", "thanks", "thank you", "thx"],
        "answer_ar": "العفو! تحت أمرك لأي سؤال ثاني عن الأنظمة أو النظام نفسه.",
        "answer_en": "You're welcome! Happy to help with more questions about the regulations or the system itself.",
    },
    {
        "id": "farewell",
        "keywords": ["مع السلامة", "وداعا", "الى اللقاء", "باي", "bye", "goodbye", "see you"],
        "answer_ar": "إلى اللقاء! ارجع لي أي وقت تحتاج تتأكد من شي متعلق بتعاميم ساما أو النظام.",
        "answer_en": "Goodbye! Come back anytime you need to check something about SAMA circulars or the system.",
    },
    {
        "id": "identity",
        "keywords": ["مين انت", "من انت", "ايش انت", "مين طورك", "من صنعك", "who are you", "what are you"],
        "answer_ar": "أنا مساعد تشريعات مبني داخل نظام معيار، وأجاوب فقط من قاعدة معرفة محلية محدودة لتعاميم ساما وسياسات النظام — ما أخمّن، ولو السؤال خارج قاعدتي بقولك صراحة بدل ما أختلق جواب.",
        "answer_en": "I'm a regulatory assistant built into the Meyar system. I answer strictly from a bounded local knowledge base of SAMA circulars and system policies — I don't guess, and if a question is outside that base I'll say so plainly instead of making something up.",
    },
    {
        "id": "capabilities",
        "keywords": ["وش تقدر تسوي", "ساعدني", "ايش تعرف", "what can you do", "help me", "capabilities"],
        "answer_ar": "أقدر أساعدك في: (١) شرح تعاميم ساما المحمّلة بالنظام (KYC، السقوف اليومية، مكافحة غسل الأموال، الترخيص...). (٢) توضيح نموذج المستويين ومتى يكون المنع آلياً ومتى يحتاج مراجعة بشرية. (٣) من المسؤول في كل حالة. (٤) منهجية أي رقم أو نسبة تشوفها بالداشبورد.",
        "answer_en": "I can help with: (1) explaining the loaded SAMA circulars (KYC, daily limits, AML, licensing...). (2) the two-tier model and when a block is automatic vs. human-reviewed. (3) who is accountable in each case. (4) the methodology behind any number or percentage on the dashboard.",
    },
    {
        "id": "wellbeing",
        "keywords": ["كيف الحال", "كيفك", "كيف حالك", "شلونك", "how are you", "how's it going"],
        "answer_ar": "تمام الحمد لله! جاهز أساعدك بأي سؤال عن تعاميم ساما أو نظام معيار — جرّب اسألني عن شي محدد.",
        "answer_en": "Doing well, thanks for asking! Ready to help with any question about SAMA circulars or the Meyar system — go ahead and ask.",
    },
]



def _normalize_arabic(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[\u064B-\u0652]", "", text)  # strip tashkeel
    text = re.sub(r"[إأآا]", "ا", text)
    text = re.sub(r"ى", "ي", text)
    text = re.sub(r"ة", "ه", text)
    text = re.sub(r"[^\w\s]", " ", text)
    return text


def _strip_al(word: str) -> str:
    """Strip the Arabic definite article (ال) so 'الشبهة' and 'شبهة' match
    the same token — users type the article inconsistently."""
    if word.startswith("ال") and len(word) > 3:
        return word[2:]
    return word


def _tokenize(text: str) -> set:
    return {_strip_al(w) for w in _normalize_arabic(text).split() if w}


def _keyword_matches(keyword: str, question_tokens: set) -> bool:
    """A multi-word keyword phrase matches if every one of its words is
    present in the question, regardless of order or 'ال' prefixes — a plain
    substring check breaks the moment a user writes 'الشبهة الشرعية' instead
    of the keyword's own 'شبهة شرعية'."""
    kw_tokens = {_strip_al(w) for w in _normalize_arabic(keyword).split() if w}
    return bool(kw_tokens) and kw_tokens.issubset(question_tokens)


def _match_intent(question_tokens: set):
    for intent in INTENTS:
        for kw in intent["keywords"]:
            if _keyword_matches(kw, question_tokens):
                return intent
    return None


def _search_knowledge_base(question: str) -> List[tuple]:
    """Token-overlap retrieval — deliberately simple and fully inspectable
    rather than a black-box embedding search, so the matching logic itself
    can be explained to a committee if asked. Each matched keyword phrase
    counts as one point; longer, more specific phrases (e.g. 'حماية
    البيانات' vs. a single generic word) make accidental cross-topic
    collisions rare."""
    q_tokens = _tokenize(question)
    scored = []
    for entry in SAMA_KNOWLEDGE_BASE:
        score = sum(1 for kw in entry["keywords"] if _keyword_matches(kw, q_tokens))
        if score > 0:
            scored.append((score, entry))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored




SAMA_KNOWLEDGE_BASE = [
    {
        "id": "KB-102",
        "circular_number": "تعميم رقم ١٠٢",
        "title": "ضوابط التحقق من هوية العميل في الخدمات المصرفية المفتوحة",
        "keywords": ["هوية العميل", "تحقق من الهوية", "كي واي سي", "kyc", "المستفيد الفعلي", "بيانات العميل"],
        "answer_ar": (
            "تعميم رقم ١٠٢ يحدد ضوابط التحقق من هوية العميل (KYC) عند استخدام واجهات "
            "الخدمات المصرفية المفتوحة، ويشترط اكتمال بيانات هوية المستفيد الفعلي قبل "
            "تنفيذ أي معاملة. في نظام معيار: غياب أي حقل KYC إلزامي هو قاعدة قطعية "
            "(مستوى ١) تُفعّل منعاً آلياً فورياً، لأن التحقق هنا اكتمال بيانات وليس اجتهاداً."
        ),
        "answer_en": (
            "Circular No. 102 sets identity-verification (KYC) controls for Open Banking "
            "interfaces and requires complete beneficial-owner data before executing any "
            "transaction. In Meyar: a missing mandatory KYC field is a Level-1 rule that "
            "triggers an immediate automatic block, since it's a completeness check, not judgment."
        ),
    },
    {
        "id": "KB-98",
        "circular_number": "تعميم رقم ٩٨",
        "title": "تحديث السقوف اليومية لمعاملات الدفع الفوري",
        "keywords": ["سقف يومي", "الحد الاقصى اليومي", "دفع فوري", "daily limit"],
        "answer_ar": (
            "تعميم رقم ٩٨ يحدّث السقوف اليومية المسموح بها لمعاملات الدفع الفوري. "
            "تجاوز هذا السقف رقم قابل للمقارنة المباشرة، لذلك يُصنَّف في نظام معيار "
            "كقاعدة مستوى ١ (منع آلي فوري) بلا حاجة لمراجعة بشرية."
        ),
        "answer_en": (
            "Circular No. 98 updates daily limits for instant payment transactions. "
            "Exceeding it is a direct numeric comparison, so Meyar classifies it as a "
            "Level-1 rule (immediate automatic block) with no human review needed."
        ),
    },
    {
        "id": "KB-85",
        "circular_number": "تعميم رقم ٨٥",
        "title": "متطلبات الإفصاح عن المستفيد الفعلي للحسابات التجارية",
        "keywords": ["مستفيد فعلي", "افصاح", "حسابات تجارية", "beneficial owner"],
        "answer_ar": (
            "تعميم رقم ٨٥ يلزم الحسابات التجارية بالإفصاح عن هوية المستفيد الفعلي. "
            "عدم توفر هذا الإفصاح يُعامل كقاعدة قطعية (مستوى ١)، أما الشك في صحة "
            "الإفصاح المُقدَّم (لا في وجوده) فهو تقييم اجتهادي يُحال لموظف الامتثال (مستوى ٢)."
        ),
        "answer_en": (
            "Circular No. 85 requires commercial accounts to disclose the beneficial "
            "owner. A missing disclosure is a Level-1 rule; doubt about the accuracy of a "
            "disclosure that was provided is a Level-2 judgment call routed to a compliance officer."
        ),
    },
    {
        "id": "KB-77",
        "circular_number": "تعميم رقم ٧٧",
        "title": "ضوابط مكافحة غسل الأموال في خدمات التحويل الرقمي",
        "keywords": ["غسل اموال", "غسيل اموال", "aml", "مكافحة غسل الاموال", "نشاط مشبوه", "مؤشرات غسل"],
        "answer_ar": (
            "تعميم رقم ٧٧ ينظّم ضوابط مكافحة غسل الأموال في التحويلات الرقمية. مهم: "
            "مطابقة نمط معاملة لمؤشر غسل أموال هي دائماً تقييم احتمالي (نموذج كشف "
            "أنماط)، وليست دليلاً قاطعاً — لذلك نظام معيار لا يمنعها آلياً أبداً، بل "
            "يعلّقها ويحيلها فوراً لموظف الامتثال لاتخاذ القرار النهائي (مستوى ٢)."
        ),
        "answer_en": (
            "Circular No. 77 governs AML controls for digital transfers. Important: "
            "matching a transaction pattern to an AML indicator is always a probabilistic "
            "assessment, never conclusive proof — so Meyar never auto-blocks on this alone; "
            "it flags and routes to a compliance officer for the final decision (Level 2)."
        ),
    },
    {
        "id": "KB-64",
        "circular_number": "تعميم رقم ٦٤",
        "title": "تنظيم واجهات برمجة التطبيقات المصرفية المفتوحة (Open Banking)",
        "keywords": ["open banking", "مصرفية مفتوحة", "واجهة برمجية", "api", "صلاحيات القراءة", "core banking"],
        "answer_ar": (
            "تعميم رقم ٦٤ ينظّم واجهات الخدمات المصرفية المفتوحة، وهي عادة تمنح صلاحية "
            "«قراءة» أو «بدء عملية بموافقة العميل» فقط. مهم جداً: هذه الصلاحية لا تعني "
            "تلقائياً القدرة على إيقاف عملية داخل الأنظمة المصرفية الأساسية (Core Banking) "
            "للمؤسسة المالية. أي «إيقاف» في نظام معيار هو بالضبط بحدود ما تسمح به اتفاقية "
            "التكامل الموقّعة مع كل مؤسسة، وليس افتراضاً عاماً."
        ),
        "answer_en": (
            "Circular No. 64 regulates Open Banking APIs, which typically grant only "
            "'read' or 'consented initiation' access. Critically, this does not automatically "
            "imply the ability to stop a transaction inside a bank's Core Banking system. "
            "Any 'block' in Meyar is strictly limited by the signed integration agreement "
            "with each institution — never a general assumption."
        ),
    },
    {
        "id": "KB-55",
        "circular_number": "تعميم رقم ٥٥",
        "title": "تحديد الحد الأقصى اليومي لمعاملات المحافظ الرقمية",
        "keywords": ["محافظ رقمية", "حد اقصى للمحفظة", "wallet"],
        "answer_ar": "تعميم رقم ٥٥ يحدد الحد الأقصى اليومي لمعاملات المحافظ الرقمية، ويُطبَّق كقاعدة مستوى ١ رقمية صريحة.",
        "answer_en": "Circular No. 55 sets the daily maximum for digital wallet transactions and is applied as an explicit Level-1 rule.",
    },
    {
        "id": "KB-49",
        "circular_number": "تعميم رقم ٤٩",
        "title": "متطلبات ترخيص مزودي خدمات الدفع الصغرى",
        "keywords": ["ترخيص مزودي الخدمات", "دفع صغرى", "license", "جهة مرخصة"],
        "answer_ar": "تعميم رقم ٤٩ يحدد متطلبات ترخيص مزودي خدمات الدفع الصغرى، ويُستخدم للتحقق من كون الجهة المستفيدة مرخّصة (قاعدة مستوى ١).",
        "answer_en": "Circular No. 49 sets licensing requirements for micro-payment providers, used to verify a beneficiary's license status (Level-1 rule).",
    },
    {
        "id": "KB-110",
        "circular_number": "تعميم رقم ١١٠",
        "title": "حماية بيانات العملاء الشخصية في الخدمات المالية الرقمية",
        "keywords": ["حماية البيانات", "خصوصية العميل", "بيانات شخصية", "data protection", "privacy"],
        "answer_ar": (
            "تعميم رقم ١١٠ يضع ضوابط حماية بيانات العملاء الشخصية، ويشترط عدم مشاركة "
            "بيانات المعاملة مع أي طرف خارج نطاق موافقة العميل الصريحة. في نظام معيار، "
            "أي تسريب أو استخدام خارج النطاق هو قاعدة قطعية (مستوى ١) لأنها مخالفة "
            "موثّقة، وليست اجتهاداً."
        ),
        "answer_en": (
            "Circular No. 110 sets customer personal-data protection controls, requiring "
            "explicit customer consent before sharing transaction data with any third party. "
            "In Meyar, any out-of-scope use is a Level-1 rule since it's a documented "
            "violation, not a judgment call."
        ),
    },
    {
        "id": "KB-30",
        "circular_number": "تعميم رقم ٣٠",
        "title": "معايير الأمان السيبراني لواجهات الخدمات المصرفية المفتوحة",
        "keywords": ["امان سيبراني", "cyber security", "تشفير", "اختراق"],
        "answer_ar": "تعميم رقم ٣٠ يضع الحد الأدنى من معايير الأمان السيبراني (التشفير، سجلات الوصول) لواجهات Open Banking. هذه المعايير شرط تشغيلي مسبق للتكامل، وليست جزءاً من قرار المنع اللحظي نفسه.",
        "answer_en": "Circular No. 30 sets minimum cybersecurity standards (encryption, access logs) for Open Banking interfaces. These are a prerequisite for integration, not part of the live blocking decision itself.",
    },
    {
        "id": "KB-SHARIA",
        "circular_number": "إطار الحوكمة الشرعية",
        "title": "دور الهيئة الشرعية في تقييم الشبهات",
        "keywords": ["شبهة شرعية", "هيئة شرعية", "اجتهاد شرعي", "sharia"],
        "answer_ar": (
            "مسائل الشبهة الشرعية تخضع لاجتهاد بشري وتختلف أحياناً بين الهيئات الشرعية "
            "نفسها. لهذا لا يتخذ نظام معيار أي قرار نهائي في هذه الحالات: أقصى ما يفعله "
            "هو رفع تنبيه وتعليق العملية إلى حين مراجعة الهيئة الشرعية المختصة (مستوى ٢)."
        ),
        "answer_en": (
            "Sharia-compliance questions involve human juristic reasoning and can differ "
            "between Sharia boards. Meyar never issues a final ruling on these — it only "
            "raises an alert and suspends the transaction pending review by the relevant "
            "Sharia board (Level 2)."
        ),
    },
    {
        "id": "KB-LIABILITY",
        "circular_number": "سياسة المسؤولية الداخلية",
        "title": "من المسؤول عن قرار المنع أو المراجعة؟",
        "keywords": ["من المسؤول", "المسؤولية القانونية", "liability", "من يتحمل"],
        "answer_ar": (
            "في المستوى ١ (قواعد قطعية): النظام ينفّذ آلياً استناداً لقاعدة موثّقة ومعلنة "
            "مسبقاً، والمسؤولية على دقة تعريف القاعدة نفسها لا على قرار لحظي. "
            "في المستوى ٢ (قواعد اجتهادية): القرار النهائي دائماً بشري (موظف امتثال أو "
            "هيئة شرعية)، والنظام لا يتحمل ولا يُنسب له اتخاذ القرار، بل يقتصر دوره على "
            "التنبيه والتوثيق."
        ),
        "answer_en": (
            "Level 1 (definitive rules): the system executes automatically against a "
            "pre-documented rule; accountability centers on the rule's own accuracy, not "
            "a live judgment call. Level 2 (interpretive rules): the final decision is "
            "always human (compliance officer or Sharia board); the system's role is "
            "limited to alerting and documentation, not decision-making."
        ),
    },
    {
        "id": "KB-TWOTIER",
        "circular_number": "سياسة النظام الداخلية",
        "title": "ما الفرق بين المستوى ١ والمستوى ٢؟",
        "keywords": ["الفرق بين المستوى", "مستوى واحد ومستوى اثنين", "منع متدرج", "two tier", "level 1 level 2"],
        "answer_ar": (
            "المستوى ١ يشمل فقط القواعد القطعية القابلة للتحقق آلياً (سقف رقمي، جهة "
            "غير مرخصة، قائمة حظر رسمية) — هذه تُنفَّذ بمنع آلي فوري لأنها لا تحتمل "
            "اجتهاداً. المستوى ٢ يشمل أي حالة فيها تفسير أو احتمال (شبهة شرعية، نمط "
            "غسل أموال محتمل) — هذه تُعلَّق فقط وتُحال لمراجع بشري مُسمّى، ولا يتخذ "
            "النظام فيها قراراً نهائياً أبداً."
        ),
        "answer_en": (
            "Level 1 covers only definitive, machine-checkable rules (a numeric limit, an "
            "unlicensed entity, an official blacklist) — executed as an immediate automatic "
            "block since no interpretation is involved. Level 2 covers anything interpretive "
            "or probabilistic (a Sharia concern, a possible AML pattern) — these are only "
            "suspended and routed to a named human reviewer; the system never issues a "
            "final ruling on them."
        ),
    },
    {
        "id": "KB-ACCURACY",
        "circular_number": "سياسة الدقة والموثوقية",
        "title": "هل النظام دقيق بنسبة ١٠٠٪؟",
        "keywords": ["دقة النظام", "١٠٠٪", "100%", "accuracy", "يضمن الدقة"],
        "answer_ar": (
            "لا. النصوص القانونية فيها استثناءات وسياق، والنظام مصمَّم على افتراض أنه "
            "قد يخطئ. لهذا القرارات الآلية النهائية محصورة بالحالات القطعية فقط (مستوى "
            "١)، وأي حالة فيها اجتهاد تُحال لمراجعة بشرية بدل قرار آلي نهائي — بدل "
            "الادّعاء بدقة مطلقة غير واقعية."
        ),
        "answer_en": (
            "No. Legal text contains exceptions and context, and the system is designed "
            "assuming it can be wrong. That's why final automatic decisions are limited to "
            "definitive cases only (Level 1), while any interpretive case is routed to "
            "human review instead of claiming unrealistic absolute accuracy."
        ),
    },
    {
        "id": "KB-COST",
        "circular_number": "منهجية داخلية",
        "title": "كيف تُحسب نسبة خفض التكاليف؟",
        "keywords": ["نسبة خفض التكاليف", "70%", "٧٠٪", "منهجية", "كيف تحسب"],
        "answer_ar": (
            f"النسبة محسوبة كـ (١ − ساعات المراجعة بعد الأتمتة ÷ ساعات المراجعة قبل "
            f"الأتمتة) × ١٠٠، بافتراض {COST_METHODOLOGY['baseline_manual_hours_per_month']} "
            f"ساعة مراجعة يدوية شهرياً قبل النظام مقابل "
            f"{COST_METHODOLOGY['automated_review_hours_per_month']} ساعة متبقية بعد "
            f"الأتمتة (مراجعة حالات المستوى ٢ فقط). تقدير تشغيلي قابل للتدقيق."
        ),
        "answer_en": (
            f"Calculated as (1 − post-automation review hours ÷ pre-automation review "
            f"hours) × 100, assuming {COST_METHODOLOGY['baseline_manual_hours_per_month']} "
            f"manual hours/month before the system vs. "
            f"{COST_METHODOLOGY['automated_review_hours_per_month']} hours after automation "
            f"(Level-2 review only). An auditable operational estimate."
        ),
    },
]



@app.post("/api/chatbot/query", response_model=ChatbotAnswer)
def chatbot_query(payload: ChatbotQuery):
    lang = payload.lang
    q_tokens = _tokenize(payload.question)

    # Layer A — small talk / meta questions get a natural, uncited reply.
    intent = _match_intent(q_tokens)
    if intent:
        return ChatbotAnswer(
            answer=intent["answer_en"] if lang == "en" else intent["answer_ar"],
            confidence="high",
            sources=[],
            disclaimer=DISCLAIMER_EN if lang == "en" else DISCLAIMER_AR,
        )

    # Layer B — regulatory questions: cited retrieval, explicit "not found".
    matches = _search_knowledge_base(payload.question)

    if not matches:
        no_match_ar = (
            "لا تتوفر إجابة موثوقة لهذا السؤال ضمن قاعدة المعرفة الحالية للنظام. "
            "بدل التخمين، يُفضَّل الرجوع مباشرة لتعاميم ساما الرسمية على sama.gov.sa، "
            "أو استشارة موظف الامتثال."
        )
        no_match_en = (
            "No reliable answer is available for this question in the system's current "
            "knowledge base. Rather than guessing, please consult SAMA's official circulars "
            "at sama.gov.sa, or a compliance officer."
        )
        return ChatbotAnswer(
            answer=no_match_en if lang == "en" else no_match_ar,
            confidence="none",
            sources=[],
            disclaimer=DISCLAIMER_EN if lang == "en" else DISCLAIMER_AR,
        )

    top_score = matches[0][0]
    # Only merge multiple sources when the top match is itself strong
    # (score >= 2). A lone shared keyword between unrelated entries should
    # never produce a mashed-together answer — return the single best match
    # instead.
    if top_score >= 2:
        top_entries = [e for s, e in matches if s == top_score][:2]
        confidence: Literal["high", "medium", "none"] = "high"
    else:
        top_entries = [matches[0][1]]
        confidence = "medium"

    if lang == "en":
        answer_text = "\n\n".join(e["answer_en"] for e in top_entries)
    else:
        answer_text = "\n\n".join(e["answer_ar"] for e in top_entries)

    return ChatbotAnswer(
        answer=answer_text,
        confidence=confidence,
        sources=[ChatbotSource(circular_number=e["circular_number"], title=e["title"]) for e in top_entries],
        disclaimer=DISCLAIMER_EN if lang == "en" else DISCLAIMER_AR,
    )


@app.get("/api/chatbot/suggested-questions", response_model=SuggestedQuestions)
def chatbot_suggested_questions():
    return SuggestedQuestions(
        questions_ar=[
            "ما الفرق بين المستوى ١ والمستوى ٢ في نظام المنع؟",
            "هل يقدر النظام يوقف عملية داخل الـ Core Banking؟",
            "مين المسؤول لو النظام أوقف عملية شرعية بالخطأ؟",
            "كيف يتعامل النظام مع شبهة غسل الأموال؟",
            "كيف تُحسب نسبة خفض التكاليف؟",
            "هل النظام دقيق بنسبة ١٠٠٪؟",
        ],
        questions_en=[
            "What's the difference between Level 1 and Level 2 blocking?",
            "Can the system stop a transaction inside Core Banking?",
            "Who is liable if the system wrongly blocks a legitimate transaction?",
            "How does the system handle AML suspicion?",
            "How is the cost-reduction percentage calculated?",
            "Is the system 100% accurate?",
        ],
    )



# ---------------------------------------------------------------------------
# Review Queue + Audit Trail
#
# This is what turns "flagged transactions are routed to a human reviewer"
# from a sentence in the pitch into something a committee can actually click.
# Every Level-2 transaction sits in REVIEW_QUEUE until a named human approves
# or rejects it; every decision — automatic Level-1 blocks included — is
# permanently recorded in AUDIT_LOG with who/when/why, so nothing is a black
# box and no decision can silently disappear.
#
# In-memory only (fine for a hackathon demo); a real deployment would back
# this with a database.
# ---------------------------------------------------------------------------

REVIEW_QUEUE: List[dict] = []
AUDIT_LOG: List[dict] = []
_audit_counter = 0


def _new_audit_id() -> str:
    global _audit_counter
    _audit_counter += 1
    return f"AUD-{1000 + _audit_counter}"


def _log_audit(transaction: dict, level: str, decision: str, actor: str, note: Optional[str] = None) -> dict:
    entry = {
        "id": _new_audit_id(),
        "timestamp": _iso(_now()),
        "transaction_id": transaction["id"],
        "level": level,
        "decision": decision,
        "reason": transaction["legal_reason"],
        "amount_sar": transaction["amount_sar"],
        "institution": transaction["institution"],
        "violation_category": transaction.get("violation_category"),
        "circular_number": transaction.get("circular_number"),
        "actor": actor,
        "note": note,
    }
    AUDIT_LOG.insert(0, entry)
    return entry


def _seed_review_and_audit():
    """Populate the queue and log with realistic starting data so both tabs
    have content on first load, instead of an empty state."""
    base_time = _now()

    # A handful of already-resolved historical decisions, so the audit trail
    # isn't empty on first visit.
    for i in range(6):
        tx = _generate_transaction(1000 + i, base_time - timedelta(hours=RNG.randint(2, 48)))
        if tx.status == "blocked":
            _log_audit(tx.model_dump(), "auto_block", "blocked", "النظام (قاعدة آلية)")
        elif tx.status == "flagged":
            outcome = RNG.choice(["approved", "rejected"])
            reviewer = tx.reviewer_required or "موظف الامتثال"
            entry = _log_audit(tx.model_dump(), "human_review", outcome, reviewer)
            entry["timestamp"] = _iso(base_time - timedelta(hours=RNG.randint(1, 40)))

    # Currently pending items awaiting a human decision — keep generating
    # until we have a healthy demo-sized queue instead of leaving it to
    # random chance (which could seed an empty, boring-looking queue).
    attempts = 0
    idx = 2000
    while len(REVIEW_QUEUE) < 8 and attempts < 200:
        tx = _generate_transaction(idx, base_time - timedelta(minutes=RNG.randint(1, 90)))
        if tx.status == "flagged":
            REVIEW_QUEUE.append(tx.model_dump())
        idx += 1
        attempts += 1


_seed_review_and_audit()


class ReviewDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]
    reviewer_name: str
    note: Optional[str] = None


class AuditEntry(BaseModel):
    id: str
    timestamp: str
    transaction_id: str
    level: str
    decision: str
    reason: str
    amount_sar: float
    institution: str
    violation_category: Optional[str] = None
    circular_number: Optional[str] = None
    actor: str
    note: Optional[str] = None


class ReviewStats(BaseModel):
    pending: int
    approved_today: int
    rejected_today: int
    approval_rate_pct: float


@app.get("/api/review-queue")
def get_review_queue():
    return {"items": REVIEW_QUEUE}


@app.post("/api/review-queue/{transaction_id}/decide", response_model=AuditEntry)
def decide_review(transaction_id: str, payload: ReviewDecisionRequest):
    match = next((t for t in REVIEW_QUEUE if t["id"] == transaction_id), None)
    if not match:
        return AuditEntry(
            id=_new_audit_id(),
            timestamp=_iso(_now()),
            transaction_id=transaction_id,
            level="human_review",
            decision="not_found",
            reason="",
            amount_sar=0,
            institution="",
            actor=payload.reviewer_name,
            note="Transaction not found in queue (may have already been decided).",
        )
    REVIEW_QUEUE.remove(match)
    decision_label = "approved" if payload.decision == "approve" else "rejected"
    entry = _log_audit(match, "human_review", decision_label, payload.reviewer_name, payload.note)
    return AuditEntry(**entry)


@app.get("/api/audit-log")
def get_audit_log(limit: int = Query(default=50, ge=1, le=200)):
    return {"items": AUDIT_LOG[:limit]}


@app.get("/api/review-queue/stats", response_model=ReviewStats)
def review_stats():
    today = _now().date()
    approved_today = sum(
        1 for e in AUDIT_LOG if e["decision"] == "approved" and datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")).date() == today
    )
    rejected_today = sum(
        1 for e in AUDIT_LOG if e["decision"] == "rejected" and datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00")).date() == today
    )
    total_decided = approved_today + rejected_today
    approval_rate = round((approved_today / total_decided) * 100, 1) if total_decided else 0.0
    return ReviewStats(
        pending=len(REVIEW_QUEUE),
        approved_today=approved_today,
        rejected_today=rejected_today,
        approval_rate_pct=approval_rate,
    )


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=port == 8000)
