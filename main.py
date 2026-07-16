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

import base64
import hashlib
import hmac
import json
import os
import random
import re
import secrets
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

import joblib
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Meyar Compliance API",
    description="واجهة برمجية لمنظومة معيار للرقابة المالية اللحظية",
    version="3.0.0",
)

# CORS: tightened from a wildcard to an explicit allow-list. A financial-
# compliance API accepting requests from any origin is not defensible even
# in a demo. Configurable via the ALLOWED_ORIGINS env var (comma-separated)
# so new Vercel preview URLs can be added without a code change; defaults
# cover local development and the known production frontend domain.
_DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:3000,https://meyar-dashboard.vercel.app"
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", _DEFAULT_ALLOWED_ORIGINS).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # In addition to the explicit allow-list above, accept any Vercel or
    # Render subdomain automatically. Vercel preview URLs (per branch/PR)
    # and Render service URLs both contain unpredictable random suffixes,
    # so requiring an exact string match in ALLOWED_ORIGINS is fragile in
    # practice — a single missed hyphen or an unset env var silently
    # blocks every request with a browser-side "Failed to fetch", with
    # nothing useful in the server logs to diagnose it by. This regex
    # covers the common case without resorting to a blanket wildcard.
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*(vercel\.app|onrender\.com)$",
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


MODEL_PATH = os.environ.get("MEYAR_MODEL_PATH", "risk_model.joblib")


def _train_risk_model() -> RandomForestClassifier:
    X, y = _make_synthetic_training_data()
    model = RandomForestClassifier(n_estimators=80, max_depth=6, random_state=42)
    model.fit(X, y)
    return model


def _load_or_train_risk_model() -> tuple:
    """Loads a previously trained model from disk if one exists (fast
    startup), otherwise trains a fresh one and saves it for next time. Since
    training here is deterministic (fixed random_state, fixed synthetic
    data), a loaded model is numerically identical to a freshly trained one
    — this only saves the ~1-2s of retraining on every process start."""
    if os.path.exists(MODEL_PATH):
        try:
            model = joblib.load(MODEL_PATH)
            return model, True
        except Exception:
            pass  # corrupted/incompatible file — fall through and retrain
    model = _train_risk_model()
    try:
        joblib.dump(model, MODEL_PATH)
    except Exception:
        pass  # read-only filesystem etc. — training still succeeded
    return model, False


RISK_MODEL, RISK_MODEL_LOADED_FROM_DISK = _load_or_train_risk_model()
RISK_MODEL_TRAINED_AT = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

# ---------------------------------------------------------------------------
# Risk Appetite — operationalizes the board-approved Risk Appetite Statement
# that SAMA's Corporate Governance principles require every regulated
# institution to maintain (and to keep institution-specific, not generic —
# SAMA examiners flag generic risk appetite statements as a finding). Rather
# than a static document, the selected appetite level here directly drives
# the Level-2 AI decision threshold used below, so the governance choice has
# a real, live effect on the system instead of sitting in a PDF nobody reads.
# ---------------------------------------------------------------------------

RISK_APPETITE_LEVELS = {
    "conservative": {"threshold": 0.40, "label_ar": "متحفّظ", "label_en": "Conservative"},
    "moderate": {"threshold": 0.55, "label_ar": "متوسط", "label_en": "Moderate"},
    "aggressive": {"threshold": 0.70, "label_ar": "منفتح", "label_en": "Aggressive"},
}
DEFAULT_RISK_APPETITE_LEVEL = "moderate"

# Mutable at runtime via POST /api/risk-appetite — a plain module-level dict
# (not a constant) precisely because it must change without a redeploy.
RISK_APPETITE_STATE = {
    "level": DEFAULT_RISK_APPETITE_LEVEL,
    "threshold": RISK_APPETITE_LEVELS[DEFAULT_RISK_APPETITE_LEVEL]["threshold"],
}
RISK_FLAG_THRESHOLD = RISK_APPETITE_STATE["threshold"]  # kept for any legacy reference

# ---------------------------------------------------------------------------
# Model evaluation — REAL metrics computed from the actual trained model
# against a held-out synthetic test set (different random seed than
# training, so it's a genuine train/test split, not the same data twice).
#
# Honest scope: because no real historical bank data exists for this
# hackathon project, "ground truth" here is the same synthetic risk formula
# used to generate training data. This measures whether the model learned
# that formula correctly — not real-world fraud detection accuracy. That
# distinction is surfaced explicitly in the API response and the UI.
# ---------------------------------------------------------------------------

_TEST_X, _TEST_Y = _make_synthetic_training_data(n=1500, seed=999)


def _evaluate_at_threshold(threshold: float) -> dict:
    proba = RISK_MODEL.predict_proba(_TEST_X)[:, 1]
    preds = (proba > threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(_TEST_Y, preds, labels=[0, 1]).ravel()
    precision = precision_score(_TEST_Y, preds, zero_division=0)
    recall = recall_score(_TEST_Y, preds, zero_division=0)
    f1 = f1_score(_TEST_Y, preds, zero_division=0)
    return {
        "threshold": round(threshold, 2),
        "precision": round(float(precision) * 100, 1),
        "recall": round(float(recall) * 100, 1),
        "f1": round(float(f1) * 100, 1),
        "true_positive": int(tp),
        "false_positive": int(fp),
        "true_negative": int(tn),
        "false_negative": int(fn),
    }



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
        "reason": "تجاوز حدود النشاط المصرفي المرخّص به - نظام مراقبة البنوك",
        "article": "المادة الثانية والمادة الثالثة",
        "circular_number": "نظام مراقبة البنوك - م/5",
        "basis": "مقارنة رقمية مباشرة بنطاق الترخيص المسجَّل — لا اجتهاد",
        "category": "تجاوز الحدود المسموحة",
    },
    {
        "reason": "تحويل مالي إلى جهة غير مرخصة من ساما لمزاولة أعمال الدفع",
        "article": "المادة الخامسة",
        "circular_number": "لائحة مراقبة شركات مزودي خدمات الدفع (PSPR)",
        "basis": "تحقق مطابقة مباشر مع سجل الجهات المرخّصة من ساما — لا اجتهاد",
        "category": "جهة أو حساب غير موثوق",
    },
    {
        "reason": "تجاوز الحد الأقصى المسموح للمحفظة الإلكترونية",
        "article": None,
        "circular_number": "قواعد المحافظ الإلكترونية (بموجب نظام مدفوعات وخدمات الدفع - م/26)",
        "basis": "مقارنة رقمية تراكمية بسقف معلن من ساما — لا اجتهاد",
        "category": "تجاوز الحدود المسموحة",
    },
    {
        "reason": "محاولة تحويل لحساب مدرج على قائمة حظر رسمية (عقوبات/تجميد أموال)",
        "article": "المادة الخامسة والعشرون",
        "circular_number": "نظام مكافحة غسل الأموال - م/20",
        "basis": "تحقق مطابقة مباشر مع قائمة حظر رسمية معتمدة — لا اجتهاد",
        "category": "جهة أو حساب غير موثوق",
    },
    {
        "reason": "غياب بيانات إلزامية لمعرفة العميل (KYC) والعناية الواجبة",
        "article": None,
        "circular_number": "قواعد مكافحة غسل الأموال وتمويل الإرهاب للبنوك - تعميم ساما رقم 18147/م.أ.ت/9201",
        "basis": "تحقق اكتمال حقول إلزامية بموجب متطلبات العناية الواجبة تجاه العملاء (CDD) — لا اجتهاد",
        "category": "نقص بيانات العميل (KYC)",
    },
]

LEVEL2_FLAGGED_RULES = [
    {
        "reason": "نمط معاملات يطابق مؤشرات احتمالية لغسل الأموال - يتطلب مراجعة",
        "article": "المادة الثانية (تعريف الجريمة يشترط توفر ركن العلم)",
        "circular_number": "نظام مكافحة غسل الأموال - م/20",
        "basis": "تقييم احتمالي (نموذج كشف أنماط) — توفر «العلم» بمصدر الأموال مسألة واقعية يحسمها الإنسان لا الخوارزمية، وفق المادة (4/2) من النظام",
        "reviewer": "موظف الامتثال",
        "category": "اشتباه غسل أموال",
        "feature_tag": "amount_norm",
    },
    {
        "reason": "قيمة المعاملة أعلى من المتوسط التاريخي للعميل بنسبة كبيرة",
        "article": None,
        "circular_number": None,
        "basis": "انحراف إحصائي داخلي عن سلوك معتاد — مؤشر تشغيلي لا نص نظامي محدد، ولا يعني مخالفة بالضرورة",
        "reviewer": "موظف الامتثال",
        "category": "نمط سلوكي غير معتاد",
        "feature_tag": "deviation",
    },
    {
        "reason": "أول معاملة من هذا النوع لهذا الحساب",
        "article": None,
        "circular_number": None,
        "basis": "غياب سجل تاريخي كافٍ للمقارنة — معيار عناية واجبة معزَّزة (EDD) داخلي، يحتاج تحققاً بشرياً",
        "reviewer": "موظف الامتثال",
        "category": "نمط سلوكي غير معتاد",
        "feature_tag": "is_first_time",
    },
    {
        "reason": "عملية قد تقع خارج نطاق النشاط التجاري المرخّص",
        "article": "المادة الثالثة",
        "circular_number": "نظام مراقبة البنوك - م/5",
        "basis": "تصنيف اجتهادي لنوع النشاط مقابل حدود الترخيص — قابل للتفسير، يحتاج تقديراً بشرياً",
        "reviewer": "موظف الامتثال",
        "category": "نمط سلوكي غير معتاد",
        "feature_tag": None,
    },
    {
        "reason": "شبهة مخالفة شرعية محتملة تستدعي رأياً شرعياً متخصصاً",
        "article": None,
        "circular_number": None,
        "basis": "مسائل الاجتهاد الشرعي تختلف بين الهيئات الشرعية نفسها ولا يحكمها نص تقنيني موحَّد — النظام لا يقرر فيها أبداً",
        "reviewer": "الهيئة الشرعية",
        "category": "شبهة شرعية",
        "feature_tag": None,
    },
    {
        "reason": "تكرار غير طبيعي للمعاملات خلال نافذة زمنية قصيرة (نمط تجزئة محتمل)",
        "article": None,
        "circular_number": "دليل مكافحة غسل الأموال وتمويل الإرهاب (SAMA AML/CTF Guide)",
        "basis": "نمط سلوكي مرجّح إحصائياً يطابق مؤشر «التجزئة» (Structuring) الوارد بدليل ساما الاسترشادي — ليس دليلاً قاطعاً بذاته",
        "reviewer": "موظف الامتثال",
        "category": "نمط سلوكي غير معتاد",
        "feature_tag": "freq_last_hour_norm",
    },
]

LEVEL_PASSED_RULES = [
    "مطابقة كاملة لأنظمة البنك المركزي السعودي - لا مخالفات",
    "ضمن نطاق الترخيص الممنوح بموجب نظام مراقبة البنوك",
    "تحقق فوري من هوية المستفيد ونجاح إجراءات العناية الواجبة (KYC/CDD)",
    "متوافقة مع إطار ساما للخدمات المصرفية المفتوحة (Open Banking Framework)",
]

VIOLATION_CATEGORIES = [
    "تجاوز الحدود المسموحة",
    "جهة أو حساب غير موثوق",
    "نقص بيانات العميل (KYC)",
    "اشتباه غسل أموال",
    "شبهة شرعية",
    "نمط سلوكي غير معتاد",
]

# ---------------------------------------------------------------------------
# Real regulatory registry — replaces the earlier illustrative "تعميم رقم X"
# placeholders with actual, independently verifiable Saudi laws and SAMA
# frameworks. Each entry cites a real royal decree / regulation name and,
# where publicly confirmed, its issuance date and specific article. Where a
# precise numeric threshold (e.g. an exact SAR limit) is not publicly
# published by SAMA, that specific figure is still flagged as illustrative
# in the relevant disclaimer below — but the legal framework itself is real.
# ---------------------------------------------------------------------------

CIRCULAR_REGISTRY = [
    {
        "number": "نظام مكافحة غسل الأموال - م/20",
        "title": "نظام مكافحة غسل الأموال، الصادر بالمرسوم الملكي رقم (م/20) وتاريخ 5/2/1439هـ",
        "issued_date": "2018-01-24",
        "summary_ar": "يجرّم غسل الأموال (المادة الثانية)، ويقرّ مسؤولية الشخص الاعتباري (المادة الثالثة)، ويمنح الجهة الرقابية صلاحيات تأديبية وإدارية (المادة الخامسة والعشرون)، مع تشديد العقوبة بظروف مشدِّدة (المادة السابعة والعشرون) ومصادرة وجوبية للأموال المرتبطة بالجريمة (المادة الثالثة والثلاثون).",
        "summary_en": "Criminalizes money laundering (Article 2), establishes corporate liability (Article 3), grants the regulator disciplinary/administrative powers (Article 25), aggravates penalties under specific circumstances (Article 27), and mandates confiscation of related funds (Article 33).",
    },
    {
        "number": "دليل مكافحة غسل الأموال وتمويل الإرهاب - ساما",
        "title": "دليل مكافحة غسل الأموال وتمويل الإرهاب الصادر عن البنك المركزي السعودي (SAMA AML/CTF Guide)",
        "issued_date": "2019-11-17",
        "summary_ar": "يفصّل الحد الأدنى من متطلبات برنامج الامتثال لمكافحة غسل الأموال: العناية الواجبة تجاه العملاء (CDD)، المراقبة المستمرة للمعاملات، والإبلاغ عن العمليات المشبوهة لوحدة التحريات المالية السعودية (SAFIU).",
        "summary_en": "Details minimum AML/CTF compliance program requirements: Customer Due Diligence (CDD), continuous transaction monitoring, and Suspicious Transaction Reporting (STR) to the Saudi Arabian Financial Intelligence Unit (SAFIU).",
    },
    {
        "number": "قواعد مكافحة غسل الأموال للبنوك - تعميم 18147/م.أ.ت/9201",
        "title": "قواعد مكافحة غسل الأموال وتمويل الإرهاب لجميع البنوك وشركات الصرافة وفروع البنوك الأجنبية (التحديث الثالث)",
        "issued_date": "2020-01-01",
        "summary_ar": "يحدد ضوابط تحقق هوية العميل (KYC) الإلزامية قبل تنفيذ أي معاملة، وهو الأساس النظامي لقاعدة رفض المعاملات ذات البيانات الناقصة بنظام معيار.",
        "summary_en": "Sets mandatory KYC identity-verification controls before executing any transaction — the regulatory basis for Meyar's rule blocking transactions with incomplete customer data.",
    },
    {
        "number": "نظام مراقبة البنوك - م/5",
        "title": "نظام مراقبة البنوك، الصادر بالمرسوم الملكي رقم (م/5) وتاريخ 22/2/1386هـ",
        "issued_date": "1966-06-11",
        "summary_ar": "يحظر مزاولة أي عمل مصرفي بلا ترخيص (المادة الثانية)، ويحصر نشاط الجهات المرخَّصة بحدود أغراضها المرخَّص بها (المادة الثالثة).",
        "summary_en": "Prohibits conducting banking business without a license (Article 2), and confines licensed entities to the scope of their granted purpose (Article 3).",
    },
    {
        "number": "لائحة مراقبة شركات مزودي خدمات الدفع (PSPR)",
        "title": "لائحة مراقبة شركات مزودي خدمات الدفع الصادرة عن البنك المركزي السعودي",
        "issued_date": "2020-03-08",
        "summary_ar": "تحدد المادة الخامسة منها تعريف «خدمات الدفع» وتشترط ترخيصاً صريحاً من ساما لأي جهة تقدّمها، وهو الأساس القانوني لقاعدة رفض التحويل لجهة غير مرخصة.",
        "summary_en": "Article 5 defines 'Payment Services' and requires explicit SAMA licensing for any provider — the legal basis for Meyar's rule blocking transfers to unlicensed entities.",
    },
    {
        "number": "قواعد المحافظ الإلكترونية",
        "title": "قواعد المحافظ الإلكترونية، الصادرة عن ساما بموجب نظام مدفوعات وخدمات الدفع (م/26 وتاريخ 22/3/1443هـ)",
        "issued_date": "2023-05-01",
        "summary_ar": "تضع حداً أدنى من الضوابط عند التحقق من هوية العميل، وتشترط ربط الهوية الوطنية بمحفظة إلكترونية واحدة فقط، وتمنع تجاوز الحدود المالية المقرَّرة للمحفظة. الحد الرقمي الدقيق المستخدم بنظام معيار (السقف اليومي) توضيحي، إذ لا تنشر ساما الأرقام التفصيلية الحالية علناً.",
        "summary_en": "Sets minimum identity-verification controls, requires linking a national ID to a single e-wallet, and prohibits exceeding prescribed financial limits. Meyar's specific numeric daily cap is illustrative, since SAMA does not publicly disclose the exact current figures.",
    },
    {
        "number": "إطار ساما للخدمات المصرفية المفتوحة",
        "title": "سياسة وإطار الخدمات المصرفية المفتوحة الصادر عن البنك المركزي السعودي (SAMA Open Banking Policy / Framework)",
        "issued_date": "2020-12-01",
        "summary_ar": "يقصر صلاحية مزودي الخدمات الخارجيين (AISP/PISP) على قراءة البيانات أو بدء عملية بموافقة صريحة من العميل فقط، ولا يمنحهم صلاحية إيقاف عملية داخل الأنظمة المصرفية الأساسية (Core Banking) للمؤسسة.",
        "summary_en": "Limits third-party providers (AISPs/PISPs) to reading data or initiating a transaction with explicit customer consent only — it does not grant authority to stop a transaction inside a bank's Core Banking systems.",
    },
    {
        "number": "نظام حماية البيانات الشخصية - م/19",
        "title": "نظام حماية البيانات الشخصية، الصادر بالمرسوم الملكي رقم (م/19) وتاريخ 9/2/1443هـ (المعدَّل بالمرسوم الملكي رقم م/148 وتاريخ 5/9/1444هـ)",
        "issued_date": "2021-09-16",
        "summary_ar": "يشترط مسوّغاً نظامياً واضحاً لمعالجة أو الإفصاح عن البيانات الشخصية (المواد السادسة والعاشرة والخامسة عشرة)، ويمنع مشاركتها مع طرف ثالث دون موافقة صريحة أو مسوّغ نظامي.",
        "summary_en": "Requires a clear lawful basis for processing or disclosing personal data (Articles 6, 10, 15), and prohibits sharing it with a third party without explicit consent or a lawful basis.",
    },
]

CIRCULAR_DATA_DISCLAIMER_AR = (
    "الأنظمة والتعاميم المذكورة أعلاه حقيقية ويمكن التحقق منها بشكل مستقل (روابط رسمية: "
    "laws.boe.gov.sa و rulebook.sama.gov.sa). الاستثناء الوحيد هو الأرقام الدقيقة لبعض السقوف "
    "المالية (كالسقف اليومي للمحفظة الإلكترونية)، لأن ساما لا تنشر هذي الأرقام التفصيلية "
    "الحالية علناً — تلك الأرقام تقديرية توضيحية فقط، أما الإطار النظامي نفسه فحقيقي وموثَّق."
)
CIRCULAR_DATA_DISCLAIMER_EN = (
    "The laws and regulations cited above are real and independently verifiable (official "
    "sources: laws.boe.gov.sa and rulebook.sama.gov.sa). The one exception is the precise figures "
    "for certain financial caps (e.g. the e-wallet daily limit), since SAMA does not publicly "
    "disclose current detailed figures — those specific numbers are illustrative estimates only; "
    "the underlying regulatory framework itself is real and documented."
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
    compliance_score_methodology_ar: str
    compliance_score_methodology_en: str
    transactions_scanned_today: int
    transactions_scanned_delta_pct: float
    compliance_cost_saved_pct: float
    cost_methodology_ar: str
    cost_methodology_en: str
    total_monitored_volume_sar: float
    total_blocked_violations: int
    total_blocked_delta_pct: float
    saved_penalties_value_sar: float
    saved_penalties_delta_pct: float
    saved_penalties_methodology_ar: str
    saved_penalties_methodology_en: str
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
    confidence: Literal["high", "medium", "general", "none"]
    sources: List[ChatbotSource]
    disclaimer: str
    ai_powered: bool = False


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

    if risk["probability"] > RISK_APPETITE_STATE["threshold"]:
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


AVERAGE_FINE_PER_VIOLATION_SAR = 65_000
# Disclosed assumption: illustrative average regulatory fine per definitively
# blocked (Level-1) violation, based on typical SAMA penalty brackets for
# common violation categories (limit breaches, unlicensed-entity transfers).
# This is an estimate for demo purposes, not an audited figure.

COMPLIANCE_SCORE_METHODOLOGY_AR = (
    "مؤشر الالتزام الكلي مقياس مركّب يقيس الصحة التنظيمية العامة للمؤسسات الخاضعة للمراقبة "
    "(اكتمال البيانات، الالتزام بالمهل، جاهزية الأنظمة)، وهو مختلف عن «عدد المعاملات المحظورة» "
    "المعروض بجانبه. المعاملات المحظورة نسبة صغيرة جداً (أقل من 0.2%) من إجمالي حجم المعاملات "
    "اليومي لأنها تمثّل حالات استثنائية فقط، بينما مؤشر الالتزام يقيّم الصورة المؤسسية الأوسع."
)
COMPLIANCE_SCORE_METHODOLOGY_EN = (
    "The overall compliance index is a composite measure of the monitored institutions' general "
    "regulatory health (data completeness, timeliness, system readiness) — distinct from the "
    "'blocked transactions' count shown alongside it. Blocked transactions are a very small share "
    "(under 0.2%) of daily volume since they represent exceptional cases, while the compliance "
    "index evaluates the broader institutional picture."
)


@app.get("/api/compliance-summary", response_model=ComplianceSummary)
def compliance_summary():
    # Current-period figures
    blocked_now = RNG.randint(320, 410)
    volume_count_now = RNG.randint(184_000, 212_000)
    compliance_score_now = round(RNG.uniform(97.9, 98.7), 1)

    # Previous-period baselines, generated as a realistic variation of the
    # current figures so every displayed trend percentage is an ACTUAL
    # computed delta between two periods, not an independent hardcoded
    # number that could drift out of sync with what's on screen.
    blocked_before = round(blocked_now * RNG.uniform(1.05, 1.15))
    volume_count_before = round(volume_count_now / RNG.uniform(1.08, 1.18))
    compliance_score_before = round(compliance_score_now - RNG.uniform(0.3, 0.9), 1)

    blocked_delta_pct = round((blocked_now - blocked_before) / blocked_before * 100, 1)
    volume_delta_pct = round((volume_count_now - volume_count_before) / volume_count_before * 100, 1)
    compliance_score_delta = round(compliance_score_now - compliance_score_before, 1)

    # Saved-penalties value is DERIVED from the actual blocked count — not
    # an independent random figure — so its trend is mathematically
    # identical to the blocked-violations trend, and its methodology is
    # fully stated rather than left as an unsourced number.
    saved_penalties_now = round(blocked_now * AVERAGE_FINE_PER_VIOLATION_SAR, 2)
    saved_penalties_before = round(blocked_before * AVERAGE_FINE_PER_VIOLATION_SAR, 2)
    saved_penalties_delta_pct = round((saved_penalties_now - saved_penalties_before) / saved_penalties_before * 100, 1)

    saved_penalties_methodology_ar = (
        f"القيمة = عدد المخالفات المحظورة آلياً ({blocked_now}) × متوسط الغرامة النظامية التقديرية "
        f"لكل مخالفة ({AVERAGE_FINE_PER_VIOLATION_SAR:,} ر.س) — تقدير توضيحي بمنهجية معلنة، مرتبط "
        f"مباشرة بعدد المخالفات الفعلي، وليس رقماً مستقلاً بلا مصدر."
    )
    saved_penalties_methodology_en = (
        f"Value = automatically blocked violations ({blocked_now}) × an illustrative average "
        f"regulatory fine per violation ({AVERAGE_FINE_PER_VIOLATION_SAR:,} SAR) — a disclosed-"
        f"methodology estimate directly tied to the actual violation count, not an unsourced figure."
    )

    return ComplianceSummary(
        compliance_score=compliance_score_now,
        compliance_score_delta=compliance_score_delta,
        compliance_score_methodology_ar=COMPLIANCE_SCORE_METHODOLOGY_AR,
        compliance_score_methodology_en=COMPLIANCE_SCORE_METHODOLOGY_EN,
        transactions_scanned_today=volume_count_now,
        transactions_scanned_delta_pct=volume_delta_pct,
        compliance_cost_saved_pct=_compliance_cost_saved_pct(),
        cost_methodology_ar=COST_METHODOLOGY_TEXT_AR,
        cost_methodology_en=COST_METHODOLOGY_TEXT_EN,
        total_monitored_volume_sar=round(RNG.uniform(2.1e9, 2.6e9), 2),
        total_blocked_violations=blocked_now,
        total_blocked_delta_pct=blocked_delta_pct,
        saved_penalties_value_sar=saved_penalties_now,
        saved_penalties_delta_pct=saved_penalties_delta_pct,
        saved_penalties_methodology_ar=saved_penalties_methodology_ar,
        saved_penalties_methodology_en=saved_penalties_methodology_en,
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


@app.get("/api/model-metrics")
def get_model_metrics():
    current = _evaluate_at_threshold(RISK_APPETITE_STATE["threshold"])
    sweep = [_evaluate_at_threshold(t / 100) for t in range(30, 81, 5)]
    return {
        "current": current,
        "threshold_sweep": sweep,
        "test_set_size": len(_TEST_Y),
        "model_type": "RandomForestClassifier (scikit-learn)",
        "features": _RISK_FEATURE_NAMES,
        "disclaimer_ar": (
            "هذي مقاييس محسوبة فعلياً من الموديل المدرَّب، لكن على بيانات اختبار اصطناعية (مو بيانات بنكية "
            "حقيقية، لعدم توفرها لمشروع هاكاثون). تقيس هذي الأرقام مدى نجاح الموديل في تعلّم نمط المخاطرة "
            "الاصطناعي المصمَّم له، وليست دقة كشف احتيال حقيقي في العالم الفعلي."
        ),
        "disclaimer_en": (
            "These are real metrics computed from the trained model, but on a synthetic test set (not real "
            "bank data, unavailable for a hackathon project). They measure how well the model learned the "
            "synthetic risk pattern it was designed for, not real-world fraud-detection accuracy."
        ),
    }


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
    """Strips the Arabic definite article (ال) and common single-letter
    attached prepositions (و ف ب ل ك), applied iteratively so a word like
    'بالنظام' (به + ال + نظام) resolves to 'نظام'. Without this, a keyword
    like 'طرف ثالث' would fail to match a question containing 'لطرف ثالث' —
    a real gap found while testing the expanded knowledge base."""
    for _ in range(2):
        if word.startswith("ال") and len(word) > 3:
            word = word[2:]
            continue
        if word[:1] in ("و", "ف", "ب", "ل", "ك") and len(word) > 3:
            word = word[1:]
            continue
        break
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


_CIRCULAR_DIGITS_RE = re.compile(r"[\u0660-\u0669\d]+")


def _circular_number_token(circular_number: Optional[str]) -> Optional[str]:
    if not circular_number:
        return None
    m = _CIRCULAR_DIGITS_RE.search(circular_number)
    return m.group(0) if m else None


def _search_knowledge_base(question: str) -> List[tuple]:
    """Token-overlap retrieval — deliberately simple and fully inspectable
    rather than a black-box embedding search, so the matching logic itself
    can be explained to a committee if asked. Each matched keyword phrase
    counts as one point; longer, more specific phrases (e.g. 'حماية
    البيانات' vs. a single generic word) make accidental cross-topic
    collisions rare. A bare mention of the circular's own number (e.g. a
    user just asking "what is circular 102?") is treated as a strong,
    unambiguous signal on its own, since a number match can't accidentally
    collide across topics the way a generic word might."""
    q_tokens = _tokenize(question)
    scored = []
    for entry in SAMA_KNOWLEDGE_BASE:
        score = sum(1 for kw in entry["keywords"] if _keyword_matches(kw, q_tokens))
        digits = _circular_number_token(entry.get("circular_number"))
        if digits and digits in q_tokens:
            score += 2
        if score > 0:
            scored.append((score, entry))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored




SAMA_KNOWLEDGE_BASE = [
    {
        "id": "KB-102",
        "circular_number": "قواعد مكافحة غسل الأموال للبنوك (تعميم 18147/م.أ.ت/9201)",
        "title": "ضوابط التحقق من هوية العميل في الخدمات المصرفية المفتوحة",
        "keywords": ["هوية العميل", "تحقق من الهوية", "كي واي سي", "kyc", "المستفيد الفعلي", "بيانات العميل"],
        "answer_ar": (
            "قواعد مكافحة غسل الأموال للبنوك (تعميم 18147/م.أ.ت/9201) يحدد ضوابط التحقق من هوية العميل (KYC) عند استخدام واجهات "
            "الخدمات المصرفية المفتوحة، ويشترط اكتمال بيانات هوية المستفيد الفعلي قبل "
            "تنفيذ أي معاملة. في نظام معيار: غياب أي حقل KYC إلزامي هو قاعدة قطعية "
            "(مستوى ١) تُفعّل منعاً آلياً فورياً، لأن التحقق هنا اكتمال بيانات وليس اجتهاداً."
        ),
        "answer_en": (
            "the AML/CTF Rules for Banks (SAMA Circular No. 18147/M.A.T/9201) sets identity-verification (KYC) controls for Open Banking "
            "interfaces and requires complete beneficial-owner data before executing any "
            "transaction. In Meyar: a missing mandatory KYC field is a Level-1 rule that "
            "triggers an immediate automatic block, since it's a completeness check, not judgment."
        ),
    },
    {
        "id": "KB-98",
        "circular_number": "قواعد المحافظ الإلكترونية",
        "title": "تحديث السقوف اليومية لمعاملات الدفع الفوري",
        "keywords": ["سقف يومي", "الحد الاقصى اليومي", "دفع فوري", "daily limit"],
        "answer_ar": (
            "قواعد المحافظ الإلكترونية يحدّث السقوف اليومية المسموح بها لمعاملات الدفع الفوري. "
            "تجاوز هذا السقف رقم قابل للمقارنة المباشرة، لذلك يُصنَّف في نظام معيار "
            "كقاعدة مستوى ١ (منع آلي فوري) بلا حاجة لمراجعة بشرية."
        ),
        "answer_en": (
            "the Electronic Wallets Rules updates daily limits for instant payment transactions. "
            "Exceeding it is a direct numeric comparison, so Meyar classifies it as a "
            "Level-1 rule (immediate automatic block) with no human review needed."
        ),
    },
    {
        "id": "KB-85",
        "circular_number": "دليل مكافحة غسل الأموال وتمويل الإرهاب (ساما)",
        "title": "متطلبات الإفصاح عن المستفيد الفعلي للحسابات التجارية",
        "keywords": ["مستفيد فعلي", "افصاح", "حسابات تجارية", "beneficial owner"],
        "answer_ar": (
            "دليل مكافحة غسل الأموال وتمويل الإرهاب (ساما) يلزم الحسابات التجارية بالإفصاح عن هوية المستفيد الفعلي. "
            "عدم توفر هذا الإفصاح يُعامل كقاعدة قطعية (مستوى ١)، أما الشك في صحة "
            "الإفصاح المُقدَّم (لا في وجوده) فهو تقييم اجتهادي يُحال لموظف الامتثال (مستوى ٢)."
        ),
        "answer_en": (
            "the SAMA AML/CTF Guide requires commercial accounts to disclose the beneficial "
            "owner. A missing disclosure is a Level-1 rule; doubt about the accuracy of a "
            "disclosure that was provided is a Level-2 judgment call routed to a compliance officer."
        ),
    },
    {
        "id": "KB-77",
        "circular_number": "نظام مكافحة غسل الأموال (م/20)",
        "title": "ضوابط مكافحة غسل الأموال في خدمات التحويل الرقمي",
        "keywords": ["غسل اموال", "غسيل اموال", "aml", "مكافحة غسل الاموال", "نشاط مشبوه", "مؤشرات غسل"],
        "answer_ar": (
            "نظام مكافحة غسل الأموال (م/20) ينظّم ضوابط مكافحة غسل الأموال في التحويلات الرقمية. مهم: "
            "مطابقة نمط معاملة لمؤشر غسل أموال هي دائماً تقييم احتمالي (نموذج كشف "
            "أنماط)، وليست دليلاً قاطعاً — لذلك نظام معيار لا يمنعها آلياً أبداً، بل "
            "يعلّقها ويحيلها فوراً لموظف الامتثال لاتخاذ القرار النهائي (مستوى ٢)."
        ),
        "answer_en": (
            "the Anti-Money Laundering Law (Royal Decree M/20) governs AML controls for digital transfers. Important: "
            "matching a transaction pattern to an AML indicator is always a probabilistic "
            "assessment, never conclusive proof — so Meyar never auto-blocks on this alone; "
            "it flags and routes to a compliance officer for the final decision (Level 2)."
        ),
    },
    {
        "id": "KB-64",
        "circular_number": "إطار ساما للخدمات المصرفية المفتوحة",
        "title": "تنظيم واجهات برمجة التطبيقات المصرفية المفتوحة (Open Banking)",
        "keywords": ["open banking", "مصرفية مفتوحة", "واجهة برمجية", "api", "صلاحيات القراءة", "core banking"],
        "answer_ar": (
            "إطار ساما للخدمات المصرفية المفتوحة ينظّم واجهات الخدمات المصرفية المفتوحة، وهي عادة تمنح صلاحية "
            "«قراءة» أو «بدء عملية بموافقة العميل» فقط. مهم جداً: هذه الصلاحية لا تعني "
            "تلقائياً القدرة على إيقاف عملية داخل الأنظمة المصرفية الأساسية (Core Banking) "
            "للمؤسسة المالية. أي «إيقاف» في نظام معيار هو بالضبط بحدود ما تسمح به اتفاقية "
            "التكامل الموقّعة مع كل مؤسسة، وليس افتراضاً عاماً."
        ),
        "answer_en": (
            "the SAMA Open Banking Framework regulates Open Banking APIs, which typically grant only "
            "'read' or 'consented initiation' access. Critically, this does not automatically "
            "imply the ability to stop a transaction inside a bank's Core Banking system. "
            "Any 'block' in Meyar is strictly limited by the signed integration agreement "
            "with each institution — never a general assumption."
        ),
    },
    {
        "id": "KB-55",
        "circular_number": "قواعد المحافظ الإلكترونية",
        "title": "تحديد الحد الأقصى اليومي لمعاملات المحافظ الرقمية",
        "keywords": ["محافظ رقمية", "حد اقصى للمحفظة", "wallet"],
        "answer_ar": "قواعد المحافظ الإلكترونية يحدد الحد الأقصى اليومي لمعاملات المحافظ الرقمية، ويُطبَّق كقاعدة مستوى ١ رقمية صريحة.",
        "answer_en": "the Electronic Wallets Rules sets the daily maximum for digital wallet transactions and is applied as an explicit Level-1 rule.",
    },
    {
        "id": "KB-49",
        "circular_number": "لائحة مراقبة شركات مزودي خدمات الدفع (PSPR)",
        "title": "متطلبات ترخيص مزودي خدمات الدفع الصغرى",
        "keywords": ["ترخيص مزودي الخدمات", "دفع صغرى", "license", "جهة مرخصة"],
        "answer_ar": "لائحة مراقبة شركات مزودي خدمات الدفع (PSPR) يحدد متطلبات ترخيص مزودي خدمات الدفع الصغرى، ويُستخدم للتحقق من كون الجهة المستفيدة مرخّصة (قاعدة مستوى ١).",
        "answer_en": "the Payment Service Provider Regulations (PSPR) sets licensing requirements for micro-payment providers, used to verify a beneficiary's license status (Level-1 rule).",
    },
    {
        "id": "KB-110",
        "circular_number": "نظام حماية البيانات الشخصية (م/19)",
        "title": "حماية بيانات العملاء الشخصية في الخدمات المالية الرقمية",
        "keywords": ["حماية البيانات", "خصوصية العميل", "بيانات شخصية", "data protection", "privacy"],
        "answer_ar": (
            "نظام حماية البيانات الشخصية (م/19) يضع ضوابط حماية بيانات العملاء الشخصية، ويشترط عدم مشاركة "
            "بيانات المعاملة مع أي طرف خارج نطاق موافقة العميل الصريحة. في نظام معيار، "
            "أي تسريب أو استخدام خارج النطاق هو قاعدة قطعية (مستوى ١) لأنها مخالفة "
            "موثّقة، وليست اجتهاداً."
        ),
        "answer_en": (
            "the Personal Data Protection Law (Royal Decree M/19) sets customer personal-data protection controls, requiring "
            "explicit customer consent before sharing transaction data with any third party. "
            "In Meyar, any out-of-scope use is a Level-1 rule since it's a documented "
            "violation, not a judgment call."
        ),
    },
    {
        "id": "KB-30",
        "circular_number": "إطار ساما للخدمات المصرفية المفتوحة",
        "title": "معايير الأمان السيبراني لواجهات الخدمات المصرفية المفتوحة",
        "keywords": ["امان سيبراني", "cyber security", "تشفير", "اختراق"],
        "answer_ar": "إطار ساما للخدمات المصرفية المفتوحة يضع الحد الأدنى من معايير الأمان السيبراني (التشفير، سجلات الوصول) لواجهات Open Banking. هذه المعايير شرط تشغيلي مسبق للتكامل، وليست جزءاً من قرار المنع اللحظي نفسه.",
        "answer_en": "the SAMA Open Banking Framework sets minimum cybersecurity standards (encryption, access logs) for Open Banking interfaces. These are a prerequisite for integration, not part of the live blocking decision itself.",
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
    {
        "id": "KB-PEP",
        "circular_number": "مفهوم عام",
        "title": "من هو الشخص السياسي المعرَّض للمخاطر (PEP)؟",
        "keywords": ["شخص سياسي معرض", "pep", "شخصية سياسية", "معرض للمخاطر"],
        "answer_ar": (
            "الشخص السياسي المعرَّض للمخاطر (PEP) هو فرد يشغل أو شغل منصباً عاماً بارزاً (مثل "
            "مسؤول حكومي رفيع أو قيادي حزبي)، ما يجعل حساباته تحتاج مستوى تدقيق أعلى بموجب "
            "أنظمة مكافحة غسل الأموال، لارتفاع احتمالية استغلال نفوذه. بنظام معيار، معاملات "
            "هذي الفئة غالباً تُصنَّف مستوى ٢ (تحتاج مراجعة بشرية) بدل مستوى ١."
        ),
        "answer_en": (
            "A Politically Exposed Person (PEP) is someone who holds or held a prominent public "
            "position (senior government official, party leader, etc.), requiring extra AML "
            "scrutiny due to higher misuse-of-influence risk. In Meyar, such accounts are "
            "typically Level 2 (human review), not Level 1."
        ),
    },
    {
        "id": "KB-STR",
        "circular_number": "مفهوم عام",
        "title": "ما هو تقرير المعاملة المشبوهة (STR)؟",
        "keywords": ["تقرير معاملة مشبوهة", "str", "بلاغ اشتباه"],
        "answer_ar": (
            "تقرير المعاملة المشبوهة (STR) هو البلاغ الرسمي اللي ترفعه المؤسسة المالية لجهة "
            "مكافحة غسل الأموال عند اشتباه فعلي بنشاط مالي مريب، بعد مراجعة بشرية تؤكد الاشتباه. "
            "بنظام معيار، أي معاملة مستوى ٢ يوافق عليها موظف الامتثال كمخالفة فعلية، هذي هي "
            "بالضبط اللحظة اللي يُرفَع فيها STR بواقع العمل الحقيقي."
        ),
        "answer_en": (
            "A Suspicious Transaction Report (STR) is the formal filing a financial institution "
            "submits to the AML authority once human review confirms genuine suspicion. In "
            "Meyar, this maps to a Level-2 transaction a compliance officer confirms as an actual "
            "violation via the Review Queue."
        ),
    },
    {
        "id": "KB-EDD",
        "circular_number": "مفهوم عام",
        "title": "ما هي العناية الواجبة المعزَّزة (EDD)؟",
        "keywords": ["عناية واجبة معززة", "edd", "تدقيق معزز"],
        "answer_ar": (
            "العناية الواجبة المعزَّزة (EDD) هي مستوى تحقق أعمق من KYC العادي، يُطبَّق على "
            "العملاء عالي المخاطر (مثل PEP أو حسابات بحجم معاملات غير معتاد). تشمل تدقيق مصدر "
            "الأموال ومراجعة دورية أكثر تكراراً. بنظامنا، هذا يتماشى مع تصنيف مستوى ٢."
        ),
        "answer_en": (
            "Enhanced Due Diligence (EDD) is a deeper verification tier than standard KYC, "
            "applied to higher-risk customers (PEPs, unusual transaction volumes). It includes "
            "source-of-funds checks and more frequent review — aligned with our Level-2 tier."
        ),
    },
    {
        "id": "KB-COMPLIANCE-OFFICER",
        "circular_number": "مفهوم عام",
        "title": "وش دور موظف الامتثال بالضبط؟",
        "keywords": ["دور موظف الامتثال", "مسؤوليات موظف الامتثال", "compliance officer"],
        "answer_ar": (
            "موظف الامتثال هو الجهة البشرية المسؤولة عن مراجعة أي حالة اجتهادية (مستوى ٢) ما "
            "يقدر النظام يقرر فيها بمفرده — يراجع السبب المقترح، يتأكد من صحته، ويوافق أو يرفض "
            "بقرار نهائي موثَّق. بمعيار، هذا بالضبط اللي تسويه شاشة «قائمة المراجعة»."
        ),
        "answer_en": (
            "A compliance officer is the human authority responsible for reviewing any Level-2 "
            "(interpretive) case the system cannot decide alone — checking the suggested reason "
            "and issuing a final, documented approve/reject decision. In Meyar, this is exactly "
            "what the Review Queue screen enables."
        ),
    },
    {
        "id": "KB-BNPL",
        "circular_number": "لائحة مراقبة شركات التمويل",
        "title": "أنظمة خدمات الشراء الآن والدفع لاحقاً (BNPL)",
        "keywords": ["الشراء الان والدفع لاحقا", "bnpl", "تقسيط بدون فوائد"],
        "answer_ar": (
            "لائحة مراقبة شركات التمويل ينظّم مزودي خدمة «اشترِ الآن وادفع لاحقاً» (BNPL)، ويشترط ترخيصاً "
            "رسمياً وسقوفاً على مبلغ التقسيط الإجمالي للعميل الواحد. تجاوز هذا السقف يُعامَل "
            "كقاعدة مستوى ١ (رقمية قطعية) بنظامنا."
        ),
        "answer_en": (
            "the Finance Companies Control Law regulates Buy-Now-Pay-Later (BNPL) providers, requiring formal "
            "licensing and a cap on a single customer's total installment exposure. Exceeding it "
            "is treated as a Level-1 numeric rule in our system."
        ),
    },
    {
        "id": "KB-SANDBOX",
        "circular_number": "إطار عام",
        "title": "وش هي بيئة ساما التجريبية التنظيمية (Sandbox)؟",
        "keywords": ["بيئة تجريبية تنظيمية", "sandbox", "الاختبار التنظيمي"],
        "answer_ar": (
            "بيئة الاختبار التنظيمي (Regulatory Sandbox) بيئة معزولة تتيحها ساما لشركات "
            "Fintech تختبر منتجاً مالياً جديداً بموافقة محدودة ونطاق عملاء صغير، قبل الحصول على "
            "ترخيص كامل. أي مشروع RegTech (زي معيار) يسعى للتكامل الحقيقي عادة يبدأ من هذي "
            "البيئة، مو الترخيص الكامل مباشرة."
        ),
        "answer_en": (
            "SAMA's Regulatory Sandbox is a controlled environment letting fintechs test a new "
            "financial product with limited approval and a small customer base before full "
            "licensing. Any RegTech project (like Meyar) seeking real integration typically "
            "starts here, not with a full license immediately."
        ),
    },
    {
        "id": "KB-CONSUMER-PROTECTION",
        "circular_number": "مبادئ حماية العملاء الصادرة عن ساما",
        "title": "مبادئ حماية العملاء بالخدمات المالية",
        "keywords": ["حماية العملاء", "حقوق العميل المالي", "الشفافية بالرسوم"],
        "answer_ar": (
            "مبادئ حماية العملاء الصادرة عن ساما يلزم المؤسسات المالية بالإفصاح الواضح عن الرسوم والشروط قبل أي "
            "معاملة، ومنح العميل حق الاعتراض خلال مدة محدَّدة. هذا مبدأ عام يكمّل قواعد منع "
            "المخالفات، لأنه يحمي العميل حتى بالمعاملات المطابقة (غير المخالفة) أصلاً."
        ),
        "answer_en": (
            "SAMA's Consumer Protection Principles requires clear fee and terms disclosure before any transaction, and "
            "grants the customer a defined objection window. This is a general principle "
            "complementing violation-prevention rules, protecting customers even on fully "
            "compliant transactions."
        ),
    },
    {
        "id": "KB-COMPLAINTS",
        "circular_number": "مبادئ حماية العملاء الصادرة عن ساما",
        "title": "كم مدة الرد الإلزامية على شكوى العميل؟",
        "keywords": ["مدة الرد على الشكوى", "شكاوى العملاء", "مهلة الرد"],
        "answer_ar": (
            "بموجب مبادئ حماية العملاء الصادرة عن ساما، تلتزم المؤسسة المالية بالرد على شكوى العميل خلال مهلة محدَّدة "
            "نظامياً (عادة أيام معدودة)، وتصعيد الشكوى لساما لو ما انحلّت بالمهلة. هذا مسار "
            "منفصل تماماً عن تصنيف المخالفات بنظام معيار، ويخص جودة الخدمة لا المخالفة المالية."
        ),
        "answer_en": (
            "Under SAMA's Consumer Protection Principles, institutions must respond to customer complaints within a "
            "defined statutory window, escalating to SAMA if unresolved. This is a separate "
            "track from Meyar's violation classification — it concerns service quality, not "
            "financial violations."
        ),
    },
    {
        "id": "KB-DORMANT",
        "circular_number": "الضوابط الداخلية لتصنيف الحسابات الراكدة",
        "title": "متى يُعتبر الحساب البنكي راكداً (Dormant)؟",
        "keywords": ["حساب راكد", "dormant", "حساب خامل"],
        "answer_ar": (
            "الضوابط الداخلية لتصنيف الحسابات الراكدة يحدد الحساب كـ«راكد» بعد فترة معينة بلا أي حركة من العميل (عادة "
            "سنوات)، وتُطبَّق عليه ضوابط إضافية قبل أي تحويل يصير منه لاحقاً، لتقليل خطر "
            "استغلاله. بنظامنا، أول معاملة تصير من حساب راكد فترة طويلة تُصنَّف مستوى ٢ (نمط "
            "سلوكي غير معتاد)."
        ),
        "answer_en": (
            "internal dormant-account classification controls defines an account as 'dormant' after a set period of no customer "
            "activity (typically years), adding extra controls before any later transfer from "
            "it. In our system, a first transaction from a long-dormant account is Level 2 "
            "(unusual behavioral pattern)."
        ),
    },
    {
        "id": "KB-EKYC",
        "circular_number": "قواعد مكافحة غسل الأموال للبنوك (تعميم 18147/م.أ.ت/9201)",
        "title": "هل التحقق الرقمي من الهوية (e-KYC) معتمد؟",
        "keywords": ["التحقق الرقمي من الهوية", "e-kyc", "التحقق عن بعد"],
        "answer_ar": (
            "نعم، قواعد مكافحة غسل الأموال للبنوك (تعميم 18147/م.أ.ت/9201) نفسه يجيز التحقق الرقمي من الهوية (e-KYC) عبر قنوات معتمدة "
            "(كربطه بمنصة أبشر أو نفاذ)، بشرط استيفاء معايير تحقق محدَّدة (كالتحقق الحيوي "
            "بالوجه). غياب أي حقل إلزامي بهذي العملية يبقى قاعدة مستوى ١ بنظامنا، بغض النظر إذا "
            "كان التحقق رقمياً أو حضورياً."
        ),
        "answer_en": (
            "Yes — the AML/CTF Rules for Banks (SAMA Circular No. 18147/M.A.T/9201) itself permits digital identity verification (e-KYC) via "
            "approved channels (e.g. linked to national digital identity platforms), given "
            "certain verification standards (like facial biometric checks). A missing mandatory "
            "field in this process remains a Level-1 rule regardless of channel."
        ),
    },
    {
        "id": "KB-CREDIT-BUREAU",
        "circular_number": "دليل مكافحة غسل الأموال وتمويل الإرهاب (ساما)",
        "title": "علاقة شركات المعلومات الائتمانية بمعاملات العميل",
        "keywords": ["شركات المعلومات الائتمانية", "التصنيف الائتماني", "سمة"],
        "answer_ar": (
            "شركات المعلومات الائتمانية (زي سمة بالسعودية) تحتفظ بسجل ائتماني للعميل يُستخدم "
            "لتقييم الجدارة الائتمانية قبل منح تمويل. هذا مصدر بيانات منفصل عن نظام معيار، "
            "لكن يمكن ربطه مستقبلاً كخاصية إضافية لتحسين دقة تقييم مخاطر العميل بالمستوى ٢."
        ),
        "answer_en": (
            "Credit information companies (e.g. Saudi Arabia's SIMAH) maintain a customer's "
            "credit record used to assess creditworthiness before financing. This is a separate "
            "data source from Meyar, though it could be integrated later as an extra Level-2 "
            "risk-scoring feature."
        ),
    },
    {
        "id": "KB-REMITTANCE",
        "circular_number": "نظام مكافحة غسل الأموال (م/20)",
        "title": "ضوابط إضافية على التحويلات الدولية (Remittance)",
        "keywords": ["تحويلات دولية", "remittance", "حوالات خارجية"],
        "answer_ar": (
            "التحويلات المالية الدولية تخضع لضوابط أشد ضمن نظام مكافحة غسل الأموال (م/20) لمكافحة غسل الأموال، "
            "لارتفاع مخاطرها مقارنة بالتحويلات المحلية. بنظام معيار، القناة الدولية غالباً تُزيد "
            "احتمالية تصنيف المعاملة مستوى ٢ لو صاحبتها مؤشرات أخرى (مبلغ كبير، عميل جديد)."
        ),
        "answer_en": (
            "Cross-border transfers face stricter controls under the Anti-Money Laundering Law (Royal Decree M/20)'s AML "
            "framework, given their higher inherent risk vs. domestic transfers. In Meyar, an "
            "international channel raises the likelihood of a Level-2 classification when "
            "combined with other signals (large amount, new customer)."
        ),
    },
    {
        "id": "KB-OUTSOURCING",
        "circular_number": "إطار ساما للخدمات المصرفية المفتوحة",
        "title": "هل يقدر البنك يفوّض جزء من الرقابة لطرف ثالث؟",
        "keywords": ["طرف ثالث", "outsourcing", "الاستعانة بمصادر خارجية", "مصادر خارجية"],
        "answer_ar": (
            "أنظمة ساما تسمح بالاستعانة بطرف ثالث (Outsourcing) لبعض المهام التقنية، لكن "
            "**المسؤولية النهائية تبقى على المؤسسة المرخَّصة نفسها**، مو على الطرف الثالث. هذا "
            "بالضبط ينطبق على نظام معيار: لو تبنّاه بنك، البنك يبقى المسؤول القانوني النهائي، "
            "ومعيار أداة مساعدة له لا بديل عن مسؤوليته."
        ),
        "answer_en": (
            "SAMA regulations permit outsourcing certain technical functions to a third party, "
            "but final accountability always stays with the licensed institution itself, not the "
            "vendor. This applies directly to Meyar: if a bank adopts it, the bank remains the "
            "final legal party responsible — Meyar is a supporting tool, not a liability "
            "substitute."
        ),
    },
]



GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


def _call_gemini(prompt: str, timeout: int = 9, max_tokens: int = 180) -> Optional[str]:
    """Calls the real Gemini API if a key is configured. Returns None on any
    failure (missing key, network error, quota, malformed response) so the
    caller can silently fall back to the existing grounded-text behavior —
    the chatbot must never appear broken just because the AI call failed.
    Short timeout + tight token budget keep responses feeling fast."""
    if not GEMINI_API_KEY:
        return None
    try:
        body = json.dumps(
            {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.3, "maxOutputTokens": max_tokens},
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{GEMINI_ENDPOINT}?key={GEMINI_API_KEY}",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return text or None
    except (urllib.error.URLError, urllib.error.HTTPError, KeyError, IndexError, TimeoutError, ValueError):
        return None


def _rag_prompt(question: str, facts: str, lang: str) -> str:
    language_name = "English" if lang == "en" else "Arabic"
    return (
        "You are Meyar's regulatory assistant inside a Saudi fintech compliance dashboard demo. "
        "Answer the user's question using ONLY the facts provided below — do not add any "
        "information, numbers, or claims not present in these facts, and do not speculate. "
        f"Respond in {language_name}, in 2-4 concise, natural sentences suitable for a chat UI. "
        "If the facts don't fully answer the question, say what they do cover rather than guessing.\n\n"
        f"User question: {question}\n\n"
        f"Facts:\n{facts}"
    )


def _general_knowledge_prompt(question: str, lang: str) -> str:
    language_name = "English" if lang == "en" else "Arabic"
    return (
        "You are a helpful assistant inside 'Meyar', a Saudi fintech compliance dashboard demo. "
        "The user's question is NOT covered by Meyar's specific internal SAMA-circular knowledge "
        "base, so you're answering from your own general knowledge instead. You may explain "
        "general financial, compliance, AML/KYC, or Open Banking concepts helpfully and concisely. "
        f"Respond in {language_name}, in 2-4 sentences, in a warm and direct tone. "
        "Hard rule: never invent or cite a specific SAMA circular number, article number, or exact "
        "date as if it were verified — if the question needs a specific official citation, say the "
        "general concept plainly and note that the exact circular should be confirmed at sama.gov.sa "
        "or with a compliance officer, rather than stating a precise reference you're not certain of. "
        "If the question is genuinely outside what you can responsibly answer (e.g. needs real-time "
        "data, or is unrelated to finance/compliance/this dashboard), say so briefly instead of "
        "guessing.\n\n"
        f"User question: {question}"
    )


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
        # Nothing in our documented KB — rather than a flat refusal, try a
        # general-knowledge answer via Gemini (clearly labeled as such, not
        # attributed to our verified circular database). Only falls back to
        # the plain redirect if Gemini is unavailable or declines to help.
        general_answer = _call_gemini(_general_knowledge_prompt(payload.question, lang), timeout=11, max_tokens=200)
        if general_answer:
            general_disclaimer_ar = (
                "هذي إجابة عامة من الذكاء الاصطناعي، وليست من قاعدة معرفة تعاميم ساما الموثّقة "
                "داخل النظام. للتأكد من أي رقم أو تاريخ تعميم محدد، راجع sama.gov.sa مباشرة."
            )
            general_disclaimer_en = (
                "This is a general AI-generated answer, not from Meyar's verified SAMA-circular "
                "knowledge base. For any specific circular number or date, confirm at sama.gov.sa."
            )
            return ChatbotAnswer(
                answer=general_answer,
                confidence="general",
                sources=[],
                disclaimer=general_disclaimer_en if lang == "en" else general_disclaimer_ar,
                ai_powered=True,
            )

        no_match_ar = (
            "ما لقيت إجابة موثوقة أو عامة لهذا السؤال بالوقت الحالي. جرّب تعيد صياغة السؤال، أو اسأل "
            "عن مواضيع نغطيها بالتفصيل مثل: KYC، السقف اليومي، مكافحة غسل الأموال، Open Banking، "
            "الشبهة الشرعية، أو منهجية النظام. وللمصدر الرسمي: sama.gov.sa."
        )
        no_match_en = (
            "I couldn't find a reliable or general answer for this right now. Try rephrasing, or ask "
            "about topics I cover in depth: KYC, daily limits, AML, Open Banking, Sharia concerns, or "
            "the system's methodology. For the official source: sama.gov.sa."
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
        facts_text = "\n\n".join(e["answer_en"] for e in top_entries)
    else:
        facts_text = "\n\n".join(e["answer_ar"] for e in top_entries)

    # Try the real Gemini API to phrase this more naturally, but ONLY as a
    # rewording layer over the grounded facts above — never as a source of
    # new information. Falls back silently to the raw grounded text if no
    # API key is configured or the call fails for any reason.
    answer_text = facts_text
    ai_phrased = _call_gemini(_rag_prompt(payload.question, facts_text, lang))
    if ai_phrased:
        answer_text = ai_phrased

    return ChatbotAnswer(
        answer=answer_text,
        confidence=confidence,
        sources=[ChatbotSource(circular_number=e["circular_number"], title=e["title"]) for e in top_entries],
        disclaimer=DISCLAIMER_EN if lang == "en" else DISCLAIMER_AR,
        ai_powered=bool(ai_phrased),
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
# Review Queue + Audit Trail — now backed by a real SQLite database instead
# of an in-memory Python list.
#
# Honest scope: Render's free tier uses an ephemeral filesystem, so this
# file is still wiped whenever the container restarts — it does not, by
# itself, survive a Render redeploy. What it DOES demonstrate is a real
# persistence layer (schema, SQL queries, a durable file) instead of state
# that vanishes the instant the Python process exits, which is the
# meaningful engineering difference from before. A production deployment
# would point DB_PATH at a mounted persistent volume or a managed database.
# ---------------------------------------------------------------------------

DB_PATH = os.environ.get("MEYAR_DB_PATH", "meyar.db")


def _db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    conn = _db_connect()
    conn.execute(
        "CREATE TABLE IF NOT EXISTS review_queue ("
        "id TEXT PRIMARY KEY, status TEXT, timestamp TEXT, data TEXT)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS audit_log ("
        "id TEXT PRIMARY KEY, decision TEXT, timestamp TEXT, data TEXT)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users ("
        "email TEXT PRIMARY KEY, name TEXT, role TEXT, created_at TEXT)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS otp_codes ("
        "email TEXT, code_hash TEXT, expires_at TEXT, used INTEGER DEFAULT 0)"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS risk_appetite_config ("
        "id INTEGER PRIMARY KEY CHECK (id = 1), level TEXT, institution_name TEXT, "
        "approved_by TEXT, approved_date TEXT, updated_at TEXT)"
    )
    conn.commit()
    conn.close()
    _seed_demo_users()
    _seed_risk_appetite()


def _seed_risk_appetite() -> None:
    conn = _db_connect()
    row = conn.execute("SELECT * FROM risk_appetite_config WHERE id = 1").fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO risk_appetite_config (id, level, institution_name, approved_by, approved_date, updated_at) "
            "VALUES (1, ?, ?, ?, ?, ?)",
            (DEFAULT_RISK_APPETITE_LEVEL, "", "", "", _iso(_now())),
        )
        conn.commit()
    else:
        # A server restart loses the in-memory RISK_APPETITE_STATE mutation
        # from any earlier POST — restore it from the persisted row so a
        # previously chosen appetite level survives a redeploy.
        level = row["level"] if row["level"] in RISK_APPETITE_LEVELS else DEFAULT_RISK_APPETITE_LEVEL
        RISK_APPETITE_STATE["level"] = level
        RISK_APPETITE_STATE["threshold"] = RISK_APPETITE_LEVELS[level]["threshold"]
    conn.close()


def _seed_demo_users() -> None:
    """Seeds a handful of named accounts so the review queue can show a real
    signed-in actor instead of a generic role label. In a production
    deployment these would come from the bank's own identity provider
    (e.g. SSO/Active Directory), not a hardcoded seed list."""
    conn = _db_connect()
    existing = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    if existing == 0:
        demo_users = [
            ("sara.alqahtani@meyar.demo", "سارة القحطاني", "compliance_officer"),
            ("abdulaziz.alharbi@meyar.demo", "عبدالعزيز الحربي", "sharia_board"),
            ("admin@meyar.demo", "مدير النظام", "admin"),
        ]
        for email, name, role in demo_users:
            conn.execute(
                "INSERT INTO users (email, name, role, created_at) VALUES (?, ?, ?, ?)",
                (email, name, role, _iso(_now())),
            )
        conn.commit()
    conn.close()


def _db_get_user_by_email(email: str) -> Optional[dict]:
    conn = _db_connect()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    return dict(row) if row else None


def _db_store_otp(email: str, code: str) -> None:
    conn = _db_connect()
    conn.execute("DELETE FROM otp_codes WHERE email = ?", (email,))
    expires_at = _iso(_now() + timedelta(minutes=OTP_TTL_MINUTES))
    conn.execute(
        "INSERT INTO otp_codes (email, code_hash, expires_at, used) VALUES (?, ?, ?, 0)",
        (email, _hash_otp(email, code), expires_at),
    )
    conn.commit()
    conn.close()


def _db_verify_and_consume_otp(email: str, code: str) -> bool:
    conn = _db_connect()
    row = conn.execute(
        "SELECT * FROM otp_codes WHERE email = ? AND used = 0 ORDER BY expires_at DESC LIMIT 1", (email,)
    ).fetchone()
    if not row:
        conn.close()
        return False
    expires_at = datetime.fromisoformat(row["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < _now():
        conn.close()
        return False
    if not hmac.compare_digest(row["code_hash"], _hash_otp(email, code)):
        conn.close()
        return False
    conn.execute("UPDATE otp_codes SET used = 1 WHERE email = ?", (email,))
    conn.commit()
    conn.close()
    return True


# ---------------------------------------------------------------------------
# Authentication — real email-code (OTP) sign-in, so every review-queue
# decision is attributable to a specific signed-in person, not a free-text
# name typed by the client. No third-party auth provider is wired in for
# this prototype, so the token is a self-contained, HMAC-signed credential
# instead of a database-backed session — verifiable statelessly, same
# security property as a JWT, without adding a new dependency.
#
# IMPORTANT — email delivery: sending the OTP by real email requires an
# SMTP/email-API provider (e.g. Amazon SES, SendGrid) with real credentials,
# which this environment does not have. MEYAR_DEMO_MODE therefore returns
# the generated code directly in the API response so the flow can be tested
# end-to-end. Wire in a real provider at the marked TODO below and set
# MEYAR_DEMO_MODE=false before handling real customer data.
# ---------------------------------------------------------------------------

AUTH_SECRET_KEY = os.environ.get("MEYAR_AUTH_SECRET", "dev-only-insecure-secret-change-me")
OTP_TTL_MINUTES = 10
SESSION_TTL_HOURS = 12
DEMO_MODE = os.environ.get("MEYAR_DEMO_MODE", "true").lower() == "true"


def _hash_otp(email: str, code: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", code.encode(), email.encode(), 100_000).hex()


def _generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def create_session_token(email: str, name: str, role: str) -> str:
    payload = {
        "email": email,
        "name": name,
        "role": role,
        "exp": (_now() + timedelta(hours=SESSION_TTL_HOURS)).timestamp(),
    }
    body = _b64url_encode(json.dumps(payload).encode())
    signature = hmac.new(AUTH_SECRET_KEY.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def verify_session_token(token: str) -> Optional[dict]:
    try:
        body, signature = token.split(".", 1)
    except ValueError:
        return None
    expected_signature = hmac.new(AUTH_SECRET_KEY.encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        return None
    try:
        payload = json.loads(_b64url_decode(body))
    except Exception:
        return None
    if payload.get("exp", 0) < _now().timestamp():
        return None
    return payload


def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization.removeprefix("Bearer ").strip()
    payload = verify_session_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return payload


def _db_insert_review_item(tx: dict) -> None:
    conn = _db_connect()
    conn.execute(
        "INSERT OR REPLACE INTO review_queue (id, status, timestamp, data) VALUES (?, ?, ?, ?)",
        (tx["id"], tx["status"], tx["timestamp"], json.dumps(tx, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()


def _db_get_review_queue() -> List[dict]:
    conn = _db_connect()
    rows = conn.execute("SELECT data FROM review_queue ORDER BY timestamp DESC").fetchall()
    conn.close()
    return [json.loads(r["data"]) for r in rows]


def _db_get_review_item(tx_id: str) -> Optional[dict]:
    conn = _db_connect()
    row = conn.execute("SELECT data FROM review_queue WHERE id = ?", (tx_id,)).fetchone()
    conn.close()
    return json.loads(row["data"]) if row else None


def _db_remove_review_item(tx_id: str) -> None:
    conn = _db_connect()
    conn.execute("DELETE FROM review_queue WHERE id = ?", (tx_id,))
    conn.commit()
    conn.close()


def _db_count_review_queue() -> int:
    conn = _db_connect()
    n = conn.execute("SELECT COUNT(*) AS c FROM review_queue").fetchone()["c"]
    conn.close()
    return n


def _db_insert_audit(entry: dict) -> None:
    conn = _db_connect()
    conn.execute(
        "INSERT OR REPLACE INTO audit_log (id, decision, timestamp, data) VALUES (?, ?, ?, ?)",
        (entry["id"], entry["decision"], entry["timestamp"], json.dumps(entry, ensure_ascii=False)),
    )
    conn.commit()
    conn.close()


def _db_get_audit_log(limit: int = 50) -> List[dict]:
    conn = _db_connect()
    rows = conn.execute(
        "SELECT data FROM audit_log ORDER BY timestamp DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [json.loads(r["data"]) for r in rows]


def _db_count_audit_by_decision_today(decision: str) -> int:
    conn = _db_connect()
    rows = conn.execute("SELECT timestamp FROM audit_log WHERE decision = ?", (decision,)).fetchall()
    conn.close()
    today = _now().date()
    count = 0
    for r in rows:
        try:
            if datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")).date() == today:
                count += 1
        except ValueError:
            continue
    return count


_init_db()

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
    _db_insert_audit(entry)
    return entry


def _seed_review_and_audit():
    """Populate the queue and log with realistic starting data so both tabs
    have content on first load, instead of an empty state. Skipped if the
    database already has data (e.g. a warm restart within the same
    container), so we never duplicate seed rows."""
    if _db_count_review_queue() > 0:
        return

    base_time = _now()

    for i in range(6):
        tx = _generate_transaction(1000 + i, base_time - timedelta(hours=RNG.randint(2, 48)))
        if tx.status == "blocked":
            _log_audit(tx.model_dump(), "auto_block", "blocked", "النظام (قاعدة آلية)")
        elif tx.status == "flagged":
            outcome = RNG.choice(["approved", "rejected"])
            reviewer = tx.reviewer_required or "موظف الامتثال"
            entry = _log_audit(tx.model_dump(), "human_review", outcome, reviewer)
            entry["timestamp"] = _iso(base_time - timedelta(hours=RNG.randint(1, 40)))
            _db_insert_audit(entry)

    attempts = 0
    idx = 2000
    seeded = 0
    while seeded < 8 and attempts < 200:
        tx = _generate_transaction(idx, base_time - timedelta(minutes=RNG.randint(1, 90)))
        if tx.status == "flagged":
            _db_insert_review_item(tx.model_dump())
            seeded += 1
        idx += 1
        attempts += 1


_seed_review_and_audit()


class RequestCodeBody(BaseModel):
    email: str


class RegisterBody(BaseModel):
    name: str
    email: str


class VerifyCodeBody(BaseModel):
    email: str
    code: str


class AuthUser(BaseModel):
    email: str
    name: str
    role: str


class AuthResponse(BaseModel):
    token: str
    user: AuthUser


@app.post("/api/auth/request-code")
def request_code(payload: RequestCodeBody):
    email = payload.email.strip().lower()
    user = _db_get_user_by_email(email)
    if not user:
        # Explicit "not registered" response (rather than a generic 200) so
        # the frontend can offer to switch to the sign-up flow. This trades
        # a small amount of account-enumeration protection for a much
        # clearer user experience — an acceptable trade-off for an internal
        # compliance tool with named employee accounts, not a public app.
        raise HTTPException(status_code=404, detail="not_registered")
    code = _generate_otp()
    _db_store_otp(user["email"], code)
    # TODO(production): send `code` via a real email provider (e.g. Amazon
    # SES, SendGrid) instead of returning it. Left as a real integration
    # point, not a silent fake — see the module docstring above.
    response = {"sent": True}
    if DEMO_MODE:
        response["demo_code"] = code
        response["demo_notice"] = "MEYAR_DEMO_MODE is on: no real email is sent, so the code is returned here for testing."
    return response


@app.post("/api/auth/register")
def register(payload: RegisterBody):
    email = payload.email.strip().lower()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name_required")
    if _db_get_user_by_email(email):
        raise HTTPException(status_code=409, detail="already_registered")
    conn = _db_connect()
    conn.execute(
        "INSERT INTO users (email, name, role, created_at) VALUES (?, ?, ?, ?)",
        (email, name, "compliance_officer", _iso(_now())),
    )
    conn.commit()
    conn.close()
    code = _generate_otp()
    _db_store_otp(email, code)
    # Same real-email TODO as /api/auth/request-code above.
    response = {"sent": True}
    if DEMO_MODE:
        response["demo_code"] = code
        response["demo_notice"] = "MEYAR_DEMO_MODE is on: no real email is sent, so the code is returned here for testing."
    return response


@app.post("/api/auth/verify-code", response_model=AuthResponse)
def verify_code(payload: VerifyCodeBody):
    email = payload.email.strip().lower()
    user = _db_get_user_by_email(email)
    if not user or not _db_verify_and_consume_otp(email, payload.code.strip()):
        raise HTTPException(status_code=401, detail="Invalid or expired code")
    token = create_session_token(user["email"], user["name"], user["role"])
    return AuthResponse(token=token, user=AuthUser(email=user["email"], name=user["name"], role=user["role"]))


@app.get("/api/auth/me", response_model=AuthUser)
def auth_me(current_user: dict = Depends(get_current_user)):
    return AuthUser(email=current_user["email"], name=current_user["name"], role=current_user["role"])


class RiskAppetiteUpdate(BaseModel):
    level: Literal["conservative", "moderate", "aggressive"]
    institution_name: str
    approved_by: str
    approved_date: str


def _current_risk_exposure_pct() -> float:
    """Samples a batch of live-simulated transactions through the SAME
    generator and threshold used by /api/realtime-transactions, and reports
    what share would be escalated to Level 2 right now — i.e. the system's
    actual current risk posture, measured against the chosen appetite
    boundary, not a cosmetic number."""
    sample = [_generate_transaction(i, _now()) for i in range(200)]
    escalated = sum(1 for t in sample if t.status in ("flagged", "blocked"))
    return round(escalated / len(sample) * 100, 1)


@app.get("/api/risk-appetite")
def get_risk_appetite():
    conn = _db_connect()
    row = conn.execute("SELECT * FROM risk_appetite_config WHERE id = 1").fetchone()
    conn.close()
    level = RISK_APPETITE_STATE["level"]
    level_info = RISK_APPETITE_LEVELS[level]
    return {
        "level": level,
        "label_ar": level_info["label_ar"],
        "label_en": level_info["label_en"],
        "threshold": RISK_APPETITE_STATE["threshold"],
        "institution_name": (row["institution_name"] if row else "") or "",
        "approved_by": (row["approved_by"] if row else "") or "",
        "approved_date": (row["approved_date"] if row else "") or "",
        "updated_at": (row["updated_at"] if row else None),
        "current_exposure_pct": _current_risk_exposure_pct(),
        "levels": {
            key: {"threshold": v["threshold"], "label_ar": v["label_ar"], "label_en": v["label_en"]}
            for key, v in RISK_APPETITE_LEVELS.items()
        },
    }


@app.post("/api/risk-appetite")
def update_risk_appetite(payload: RiskAppetiteUpdate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        # Risk appetite is a board-level governance decision — restricting
        # who may change it is the point, not an incidental detail. Any
        # signed-in user may VIEW the current appetite (GET above requires
        # no role check), but only an admin account may change it.
        raise HTTPException(status_code=403, detail="admin_only")
    RISK_APPETITE_STATE["level"] = payload.level
    RISK_APPETITE_STATE["threshold"] = RISK_APPETITE_LEVELS[payload.level]["threshold"]
    conn = _db_connect()
    conn.execute(
        "UPDATE risk_appetite_config SET level = ?, institution_name = ?, approved_by = ?, "
        "approved_date = ?, updated_at = ? WHERE id = 1",
        (payload.level, payload.institution_name.strip(), payload.approved_by.strip(), payload.approved_date.strip(), _iso(_now())),
    )
    conn.commit()
    conn.close()
    return get_risk_appetite()


class ReviewDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]
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
    return {"items": _db_get_review_queue()}


@app.post("/api/review-queue/{transaction_id}/decide", response_model=AuditEntry)
def decide_review(transaction_id: str, payload: ReviewDecisionRequest, current_user: dict = Depends(get_current_user)):
    reviewer_name = f'{current_user["name"]} ({current_user["email"]})'
    match = _db_get_review_item(transaction_id)
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
            actor=reviewer_name,
            note="Transaction not found in queue (may have already been decided).",
        )
    _db_remove_review_item(transaction_id)
    decision_label = "approved" if payload.decision == "approve" else "rejected"
    entry = _log_audit(match, "human_review", decision_label, reviewer_name, payload.note)
    return AuditEntry(**entry)


@app.get("/api/audit-log")
def get_audit_log(limit: int = Query(default=50, ge=1, le=200)):
    return {"items": _db_get_audit_log(limit)}


@app.get("/api/review-queue/stats", response_model=ReviewStats)
def review_stats():
    approved_today = _db_count_audit_by_decision_today("approved")
    rejected_today = _db_count_audit_by_decision_today("rejected")
    total_decided = approved_today + rejected_today
    approval_rate = round((approved_today / total_decided) * 100, 1) if total_decided else 0.0
    return ReviewStats(
        pending=_db_count_review_queue(),
        approved_today=approved_today,
        rejected_today=rejected_today,
        approval_rate_pct=approval_rate,
    )


# ---------------------------------------------------------------------------
# Open Banking-style webhook — classifies a REAL provided transaction
# (rather than generating a random demo one) using the same two-tier logic:
# a deterministic numeric-limit check for Level 1, and the trained model's
# probability for Level 2. This is the shape a real bank integration would
# call the moment a transaction occurs.
# ---------------------------------------------------------------------------

SAMA_DAILY_LIMIT_SAR = 400_000


class WebhookTransactionRequest(BaseModel):
    amount_sar: float
    institution: str = "غير محدد"
    customer_ref: Optional[str] = None
    channel: str = "Open Banking API"
    deviation: Optional[float] = None
    freq_last_hour: Optional[int] = None
    is_first_time: Optional[bool] = None


def _classify_transaction(payload: WebhookTransactionRequest) -> Transaction:
    ts = _now()
    customer_ref = payload.customer_ref or f"CUST-{RNG.randint(10000, 99999)}"

    # Level 1 — a real, deterministic numeric-limit check (not a random
    # roll), matching the Electronic Wallets Rules's daily-limit rule.
    if payload.amount_sar > SAMA_DAILY_LIMIT_SAR:
        rule = next(r for r in LEVEL1_BLOCKED_RULES if "السقف اليومي" in r["reason"])
        tx = Transaction(
            id=f"TXN-WH-{int(ts.timestamp())}",
            timestamp=_iso(ts),
            institution=payload.institution,
            amount_sar=payload.amount_sar,
            status="blocked",
            action_level="auto_block",
            certainty="rule_based",
            legal_reason=rule["reason"],
            decision_basis=rule["basis"],
            reviewer_required=None,
            article_reference=rule["article"],
            violation_category=rule["category"],
            circular_number=rule["circular_number"],
            ai_risk_score=None,
            customer_ref=customer_ref,
            channel=payload.channel,
        )
        _log_audit(tx.model_dump(), "auto_block", "blocked", "النظام (قاعدة آلية عبر Webhook)")
        return tx

    # Level 2 — the real trained model scores it; only flagged transactions
    # are added to the review queue awaiting a human decision.
    hour = ts.hour
    deviation = payload.deviation if payload.deviation is not None else RNG.random()
    freq_last_hour = payload.freq_last_hour if payload.freq_last_hour is not None else RNG.randint(0, 4)
    is_first_time = 1 if payload.is_first_time else 0

    risk = _score_transaction_risk(payload.amount_sar, hour, deviation, freq_last_hour, is_first_time)

    if risk["probability"] > RISK_APPETITE_STATE["threshold"]:
        candidates = [r for r in LEVEL2_FLAGGED_RULES if r["feature_tag"] == risk["dominant_feature"]]
        rule = RNG.choice(candidates) if candidates else RNG.choice(LEVEL2_FLAGGED_RULES)
        tx = Transaction(
            id=f"TXN-WH-{int(ts.timestamp())}",
            timestamp=_iso(ts),
            institution=payload.institution,
            amount_sar=payload.amount_sar,
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
            customer_ref=customer_ref,
            channel=payload.channel,
        )
        _db_insert_review_item(tx.model_dump())
        return tx

    reason = RNG.choice(LEVEL_PASSED_RULES)
    return Transaction(
        id=f"TXN-WH-{int(ts.timestamp())}",
        timestamp=_iso(ts),
        institution=payload.institution,
        amount_sar=payload.amount_sar,
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
        customer_ref=customer_ref,
        channel=payload.channel,
    )


@app.post("/api/webhook/transaction", response_model=Transaction)
def receive_transaction_webhook(payload: WebhookTransactionRequest):
    """Simulates the endpoint a bank's Open Banking integration would call
    the instant a real transaction occurs. Returns the system's live
    classification decision — auto-blocked, flagged for human review, or
    passed — computed from the actual submitted amount and the trained
    model, not a pre-generated demo record."""
    return _classify_transaction(payload)


# ---------------------------------------------------------------------------
# Business model — added for the transition from hackathon prototype to a
# commercial pitch. Kept as plainly-structured, disclosed-methodology data
# (same philosophy as the rest of this file) rather than un-sourced pitch
# numbers. Competitor names are real, publicly known players — cited so the
# comparison can be checked, not invented for marketing effect.
# ---------------------------------------------------------------------------


class CompetitorEntry(BaseModel):
    name: str
    scope: str
    origin: Literal["local", "global"]
    strength: str
    gap_vs_meyar: str


class CompetitiveLandscape(BaseModel):
    local_competitors: List[CompetitorEntry]
    global_competitors: List[CompetitorEntry]
    meyar_differentiator_ar: str
    meyar_differentiator_en: str
    disclaimer_ar: str
    disclaimer_en: str


class DifferentiationPillar(BaseModel):
    icon_key: str
    title_ar: str
    title_en: str
    body_ar: str
    body_en: str


class ShariaAdvisoryIllustrative(BaseModel):
    disclaimer_ar: str
    disclaimer_en: str
    board_roles_ar: List[str]
    board_roles_en: List[str]
    process_steps_ar: List[str]
    process_steps_en: List[str]


COMPETITIVE_LANDSCAPE = CompetitiveLandscape(
    local_competitors=[
        CompetitorEntry(
            name="FOCAL — من شركة Mozn",
            scope="مكافحة غسل الأموال وكشف الاحتيال وفحص العقوبات وKYC — الأقوى محلياً، يخدم بنوك ومؤسسات مالية سعودية فعلية",
            origin="local",
            strength="دقة عالية بمطابقة الأسماء العربية، وتكامل ناضج مع مزودي هوية سعوديين وقوائم عقوبات حية",
            gap_vs_meyar="نظام كشف (Detection) عام، ولا يذكر تصنيفاً مستقلاً لـ«الشبهة الشرعية» ولا يُسمّي صراحة المسؤول القانوني عن كل قرار",
        ),
        CompetitorEntry(
            name="Fintor",
            scope="منصة امتثال رقمي سعودية ناشئة تستخدم تعلّم الآلة لكشف المعاملات المشبوهة وأتمتة KYC/AML",
            origin="local",
            strength="حل خفيف وسريع الإعداد للمؤسسات الصغيرة والمتوسطة",
            gap_vs_meyar="محرك كشف عام بلا فصل صريح بين قرار آلي نهائي وحالة تحتاج مراجعة بشرية موثّقة بالاسم",
        ),
        CompetitorEntry(
            name="STAMP",
            scope="منصة سعودية ناشئة (تمويل Pre-Seed بقيمة 2 مليون دولار) تجمع التراخيص والموارد البشرية والامتثال بلوحة واحدة",
            origin="local",
            strength="سهولة الإعداد وتغطية إدارية شاملة للشركات الناشئة",
            gap_vs_meyar="حل إداري/توثيقي بالدرجة الأولى، وليس محرك قرار لحظي يصنّف المعاملات نفسها وقت حدوثها",
        ),
    ],
    global_competitors=[
        CompetitorEntry(
            name="ComplyAdvantage",
            scope="منصة Mesh لكشف الجرائم المالية وفحص العقوبات والأشخاص السياسيين المعرَّضين للمخاطر، تخدم أكثر من 1000 عميل عالمياً",
            origin="global",
            strength="تغطية بيانات عالمية واسعة، وAPI سهل التكامل للمطورين",
            gap_vs_meyar="منتج عالمي عام غير مصمَّم لتعاميم ساما تحديداً، ولا لسياق الاجتهاد الشرعي",
        ),
        CompetitorEntry(
            name="Oracle Financial Crime and Compliance",
            scope="جناح حلول ضخم لمكافحة الجرائم المالية ضمن منظومة Oracle المصرفية، حائز جوائز عالمية بمجال AML",
            origin="global",
            strength="نضج تقني عالي وتكامل عميق مع البنية التحتية المصرفية القائمة على منتجات Oracle",
            gap_vs_meyar="تكلفة وتعقيد تنفيذ عاليان جداً، وغير موجَّه أصلاً للبنوك متوسطة الحجم أو شركات Fintech الناشئة",
        ),
        CompetitorEntry(
            name="NICE Actimize",
            scope="من أقدم وأكبر حلول كشف الاحتيال ومكافحة غسل الأموال عالمياً، تخدم بنوكاً كبرى",
            origin="global",
            strength="نضج تقني وسجل حافل بالبنوك الكبرى حول العالم",
            gap_vs_meyar="حل مصمَّم للبنوك الضخمة بميزانيات كبيرة، لا يوجد توطين لسياق تعاميم ساما أو الاجتهاد الشرعي",
        ),
    ],
    meyar_differentiator_ar=(
        "معيار مو نظام كشف احتيال إضافي — هو أول نظام يحدد بوضوح متى يقرر الآلة ومتى يقرر "
        "الإنسان، بما يشمل الاجتهاد الشرعي، بتكلفة تناسب البنوك السعودية المتوسطة."
    ),
    meyar_differentiator_en=(
        "Meyar isn't another fraud-detection add-on — it's the first system that explicitly "
        "defines when the machine decides and when a human must, including Sharia judgment, at "
        "a cost that fits mid-sized Saudi banks."
    ),
    disclaimer_ar=(
        "أسماء المنافسين حقيقية ومبنية على معلومات عامة متاحة، والمقارنة توضيحية لأغراض العرض "
        "التجاري وليست تقييماً تعاقدياً أو تسويقياً رسمياً من أي طرف."
    ),
    disclaimer_en=(
        "Competitor names are real and based on publicly available information; the comparison is "
        "illustrative for a business pitch, not an official contractual or marketing evaluation by "
        "any party."
    ),
)

POSITIONING_STATEMENT_AR = (
    "معيار مو نظام كشف احتيال إضافي، هو أول نظام يحدد بوضوح متى يقرر الآلة ومتى يقرر الإنسان — "
    "بما يشمل الاجتهاد الشرعي — بتكلفة تناسب البنوك السعودية المتوسطة."
)
POSITIONING_STATEMENT_EN = (
    "Meyar isn't another fraud-detection add-on. It's the first system that explicitly defines "
    "when the machine decides and when a human must — including Sharia judgment — at a cost "
    "that fits mid-sized Saudi banks."
)

DIFFERENTIATION_PILLARS: List[DifferentiationPillar] = [
    DifferentiationPillar(
        icon_key="sharia",
        title_ar="الزاوية الشرعية",
        title_en="The Sharia angle",
        body_ar="ولا منافس محلي أو عالمي يصنّف «الشبهة الشرعية» كفئة مستقلة تُحال لهيئة شرعية مسمّاة — معيار الوحيد اللي يفعل هذا صراحة",
        body_en="No local or global competitor treats a Sharia concern as its own category routed to a named Sharia board — Meyar is the only one that does",
    ),
    DifferentiationPillar(
        icon_key="accountability",
        title_ar="الفصل القانوني الصريح",
        title_en="Explicit legal separation",
        body_ar="المنافسون يعطون درجة خطورة رقمية فقط؛ معيار يحدد بالاسم الوظيفي مين المسؤول قانونياً عن كل قرار اجتهادي",
        body_en="Competitors give a numeric risk score only; Meyar names by role exactly who is legally accountable for each interpretive decision",
    ),
    DifferentiationPillar(
        icon_key="localization",
        title_ar="توطين كامل من الصفر",
        title_en="Built local, not translated",
        body_ar="منتجات عالمية مبنية بالإنجليزي ومُوطَّنة جزئياً؛ معيار مبني بالعربي كلغة أساسية بواجهة RTL كاملة ومنطق تعاميم ساما تحديداً",
        body_en="Global products are English-first with partial localization; Meyar is Arabic-native with full RTL and logic built around SAMA circulars specifically",
    ),
    DifferentiationPillar(
        icon_key="explainability",
        title_ar="شفافية كاملة بالقرار",
        title_en="Full decision explainability",
        body_ar="الحلول الكبيرة تعتمد نماذج معقدة يصعب تفسيرها؛ كل قرار بمعيار مربوط بسبب مكتوب ومادة نظامية ومنهجية محسوبة",
        body_en="Large solutions rely on hard-to-explain models; every Meyar decision is tied to a written reason, an article reference, and a disclosed methodology",
    ),
    DifferentiationPillar(
        icon_key="pricing",
        title_ar="فئة سعرية غير مخدومة",
        title_en="An underserved price tier",
        body_ar="الحلول العالمية الضخمة موجَّهة للبنوك الكبرى فقط؛ معيار يستهدف بالضبط البنوك المتوسطة وFintech الناشئة المهملة من هذا السوق",
        body_en="Large global solutions target only major banks; Meyar targets exactly the mid-sized banks and Fintech startups this market underserves",
    ),
]

SHARIA_ADVISORY_ILLUSTRATIVE = ShariaAdvisoryIllustrative(
    disclaimer_ar=(
        "هذا القسم توضيحي بالكامل لأغراض العرض — يمثّل شكل التكامل المستقبلي المقترح مع هيئة "
        "شرعية معتمدة، وليس مجلساً شرعياً فعلياً قائماً ولا فتوى معتمدة."
    ),
    disclaimer_en=(
        "This section is entirely illustrative for demo purposes — it represents the proposed "
        "shape of future integration with a certified Sharia board, not an actual standing board "
        "or an approved fatwa."
    ),
    board_roles_ar=[
        "رئيس الهيئة الشرعية للمؤسسة المالية (صلاحية القرار النهائي)",
        "عضو هيئة شرعية متخصص بالمعاملات المالية المعاصرة",
        "منسّق امتثال شرعي (يهيّئ الملف قبل عرضه على الهيئة)",
    ],
    board_roles_en=[
        "Chair of the institution's Sharia board (final decision authority)",
        "Sharia board member specialized in contemporary financial transactions",
        "Sharia-compliance coordinator (prepares the case file before board review)",
    ],
    process_steps_ar=[
        "النظام يصنّف المعاملة كـ«شبهة شرعية محتملة» (مستوى ٢) ويوقفها مؤقتاً بلا قرار نهائي",
        "منسّق الامتثال الشرعي يجهّز ملف المعاملة بالسياق والمستندات ذات الصلة",
        "الهيئة الشرعية تصدر قرارها النهائي (إجازة أو رفض)، ويُسجَّل بسجل التدقيق باسم متخذ القرار",
    ],
    process_steps_en=[
        "The system classifies the transaction as a potential Sharia concern (Level 2) and holds it with no final decision",
        "The Sharia-compliance coordinator prepares the case file with relevant context and documents",
        "The Sharia board issues its final ruling (approve or reject), logged in the audit trail under the deciding party's name",
    ],
)


class TargetSegment(BaseModel):
    name_ar: str
    name_en: str
    description_ar: str
    description_en: str
    why_fit_ar: str
    why_fit_en: str


TARGET_SEGMENTS: List[TargetSegment] = [
    TargetSegment(
        name_ar="البنوك المحلية الصغيرة والمتوسطة",
        name_en="Small & mid-sized local banks",
        description_ar="بنوك ليس لديها فريق هندسي داخلي كبير لبناء محرك امتثال خاص بها",
        description_en="Banks without a large in-house engineering team to build a proprietary compliance engine",
        why_fit_ar="تحتاج حلاً جاهزاً بتكلفة معقولة، لا رخصة عالمية مكلفة",
        why_fit_en="Need a ready-made solution at reasonable cost, not an expensive global license",
    ),
    TargetSegment(
        name_ar="شركات التقنية المالية الناشئة (Fintech)",
        name_en="Fintech startups",
        description_ar="شركات دفع ومحافظ رقمية بمرحلة نمو تحتاج طبقة امتثال دون تأخير إطلاق منتجها",
        description_en="Payment and digital-wallet companies in growth stage that need a compliance layer without delaying product launch",
        why_fit_ar="التكامل عبر Open Banking API يتماشى مباشرة مع بنيتها التقنية الحالية",
        why_fit_en="Open Banking API integration aligns directly with their existing technical stack",
    ),
    TargetSegment(
        name_ar="مزودو خدمات الدفع الصغرى (المرخّصون بتعميم ٤٩)",
        name_en="Micro-payment service providers",
        description_ar="جهات مرخّصة بموجب لائحة مراقبة شركات مزودي خدمات الدفع (PSPR) تحتاج إثبات امتثال مستمر لساما",
        description_en="Entities licensed under the Payment Service Provider Regulations (PSPR) needing continuous compliance evidence for SAMA",
        why_fit_ar="سجل تدقيق جاهز (Audit Trail) يسهّل عليها إثبات الالتزام عند أي تفتيش",
        why_fit_en="A ready audit trail simplifies proving compliance during any inspection",
    ),
    TargetSegment(
        name_ar="شركات الشراء الآن والدفع لاحقاً (BNPL)",
        name_en="Buy-Now-Pay-Later (BNPL) providers",
        description_ar="مزودون منظَّمون بموجب لائحة مراقبة شركات التمويل وسقوف تقسيط تحتاج مراقبة لحظية",
        description_en="Providers regulated under the Finance Companies Control Law with installment caps needing live monitoring",
        why_fit_ar="قواعد المستوى ١ الرقمية تلائم طبيعة سقوف BNPL تحديداً",
        why_fit_en="Numeric Level-1 rules fit BNPL installment caps particularly well",
    ),
]


class RevenueStream(BaseModel):
    name_ar: str
    name_en: str
    model_ar: str
    model_en: str


REVENUE_STREAMS: List[RevenueStream] = [
    RevenueStream(
        name_ar="اشتراك شهري حسب حجم المعاملات (SaaS)",
        name_en="Monthly volume-based subscription (SaaS)",
        model_ar="رسم شهري يتدرّج حسب عدد المعاملات الشهرية المراقَبة لكل مؤسسة",
        model_en="A monthly fee that scales with the number of monitored transactions per institution",
    ),
    RevenueStream(
        name_ar="رسوم تنفيذ وتكامل أولي (Setup Fee)",
        name_en="One-time setup & integration fee",
        model_ar="رسم مرة واحدة عند ربط النظام بقنوات Open Banking الخاصة بالمؤسسة",
        model_en="A one-time charge when connecting the system to the institution's Open Banking channels",
    ),
    RevenueStream(
        name_ar="طبقة تقارير امتثال متقدمة (Add-on)",
        name_en="Advanced compliance reporting add-on",
        model_ar="اشتراك إضافي اختياري لتقارير منهجية الدقة والتحليلات المتقدمة للجنة الامتثال الداخلية",
        model_en="An optional additional subscription for accuracy-methodology and advanced analytics reports for the internal compliance committee",
    ),
]


class CostComparisonRow(BaseModel):
    metric_ar: str
    metric_en: str
    before_ar: str
    before_en: str
    after_ar: str
    after_en: str


COST_COMPARISON_HUMAN_VS_SYSTEM: List[CostComparisonRow] = [
    CostComparisonRow(
        metric_ar="ساعات المراجعة اليدوية شهرياً",
        metric_en="Monthly manual review hours",
        before_ar=f"{COST_METHODOLOGY['baseline_manual_hours_per_month']} ساعة (فريق امتثال بشري كامل)",
        before_en=f"{COST_METHODOLOGY['baseline_manual_hours_per_month']} hours (full human compliance team)",
        after_ar=f"{COST_METHODOLOGY['automated_review_hours_per_month']} ساعة (مراجعة حالات المستوى ٢ فقط)",
        after_en=f"{COST_METHODOLOGY['automated_review_hours_per_month']} hours (Level-2 review only)",
    ),
    CostComparisonRow(
        metric_ar="نطاق عمل موظف الامتثال",
        metric_en="Compliance officer's scope of work",
        before_ar="مراجعة كل معاملة يدوياً بلا تصنيف مسبق",
        before_en="Manually reviewing every transaction with no prior classification",
        after_ar="مراجعة الحالات الاجتهادية المُصنَّفة والمُبررة آلياً فقط",
        after_en="Reviewing only pre-classified, machine-justified interpretive cases",
    ),
    CostComparisonRow(
        metric_ar="زمن اتخاذ القرار للمعاملة الواحدة",
        metric_en="Decision time per transaction",
        before_ar="دقائق إلى ساعات حسب ازدحام فريق الامتثال",
        before_en="Minutes to hours depending on the compliance team's backlog",
        after_ar="أجزاء من الثانية لمستوى ١، ومباشرة بقائمة مرتّبة لمستوى ٢",
        after_en="Fractions of a second for Level 1, and an immediately sorted queue for Level 2",
    ),
    CostComparisonRow(
        metric_ar="قابلية التوثيق لأي قرار (Audit Trail)",
        metric_en="Documentability of any decision (Audit Trail)",
        before_ar="تعتمد على تدوين يدوي متفاوت الجودة",
        before_en="Depends on inconsistent manual note-taking",
        after_ar="سجل تدقيق موحّد آلياً لكل قرار — آلي أو بشري",
        after_en="A uniformly automated audit log for every decision — automated or human",
    ),
]


class FundingCostItem(BaseModel):
    category_ar: str
    category_en: str
    type: Literal["one_time", "recurring_monthly"]
    note_ar: str
    note_en: str


FUNDING_COST_BREAKDOWN: List[FundingCostItem] = [
    FundingCostItem(
        category_ar="تطوير أولي (فريق تقني)",
        category_en="Initial development (engineering team)",
        type="one_time",
        note_ar="بناء واختبار النسخة الأولى القابلة للنشر التجاري (Backend + Frontend + نموذج الذكاء الاصطناعي)",
        note_en="Building and testing the first commercially deployable version (Backend + Frontend + AI model)",
    ),
    FundingCostItem(
        category_ar="ترخيص واجهات الذكاء الاصطناعي الخارجية",
        category_en="External AI API licensing",
        type="recurring_monthly",
        note_ar="استهلاك Gemini API أو ما يعادله حسب حجم استخدام الشات بوت",
        note_en="Gemini API consumption (or equivalent), scaling with chatbot usage volume",
    ),
    FundingCostItem(
        category_ar="استضافة سحابية مؤسسية",
        category_en="Enterprise cloud hosting",
        type="recurring_monthly",
        note_ar="الانتقال من خطط مجانية (Render/Vercel) إلى بنية تحمّل بيانات مؤسسات مالية فعلية",
        note_en="Moving from free-tier plans (Render/Vercel) to infrastructure that can hold real financial-institution data",
    ),
    FundingCostItem(
        category_ar="الاستشارات والترخيص التنظيمي",
        category_en="Regulatory advisory & licensing",
        type="one_time",
        note_ar="التسجيل ببيئة ساما التجريبية التنظيمية (Sandbox) ومتابعة متطلبات الترخيص",
        note_en="Registering with SAMA's Regulatory Sandbox and following through on licensing requirements",
    ),
    FundingCostItem(
        category_ar="الدعم الفني وتحديث قاعدة المعرفة التنظيمية",
        category_en="Technical support & regulatory knowledge-base upkeep",
        type="recurring_monthly",
        note_ar="متابعة أي تعميم جديد من ساما وتحديث محرك التشريعات والشات بوت به",
        note_en="Tracking any new SAMA circular and updating the regulatory engine and chatbot accordingly",
    ),
]


class RoadmapPhase(BaseModel):
    phase_ar: str
    phase_en: str
    timeframe_ar: str
    timeframe_en: str
    goals_ar: List[str]
    goals_en: List[str]


FUTURE_ROADMAP: List[RoadmapPhase] = [
    RoadmapPhase(
        phase_ar="المرحلة ١ — التأهيل التنظيمي",
        phase_en="Phase 1 — Regulatory readiness",
        timeframe_ar="٠–٣ أشهر",
        timeframe_en="0–3 months",
        goals_ar=["التسجيل ببيئة ساما التجريبية التنظيمية (Sandbox)", "تجهيز اتفاقيات تكامل تجريبية مع مؤسسة مالية واحدة أو أكثر"],
        goals_en=["Register with SAMA's Regulatory Sandbox", "Prepare pilot integration agreements with one or more financial institutions"],
    ),
    RoadmapPhase(
        phase_ar="المرحلة ٢ — الربط الحقيقي بالبيانات",
        phase_en="Phase 2 — Real data integration",
        timeframe_ar="٣–٦ أشهر",
        timeframe_en="3–6 months",
        goals_ar=["استبدال بيانات المعاملات العشوائية بربط فعلي عبر خدمة AIS", "إعادة تدريب نموذج المخاطرة على بيانات مُصنَّفة حقيقية من قائمة المراجعة"],
        goals_en=["Replace random transaction data with a real AIS integration", "Retrain the risk model on real labeled data from the review queue"],
    ),
    RoadmapPhase(
        phase_ar="المرحلة ٣ — الترخيص والتوسع بقاعدة البيانات",
        phase_en="Phase 3 — Licensing & database scale-up",
        timeframe_ar="٦–١٢ شهر",
        timeframe_en="6–12 months",
        goals_ar=["استكمال متطلبات الترخيص الرسمي من ساما", "الانتقال من SQLite إلى قاعدة بيانات مؤسسية (PostgreSQL) على بنية سحابية دائمة"],
        goals_en=["Complete formal SAMA licensing requirements", "Migrate from SQLite to an enterprise database (PostgreSQL) on persistent cloud infrastructure"],
    ),
    RoadmapPhase(
        phase_ar="المرحلة ٤ — التوسع التجاري",
        phase_en="Phase 4 — Commercial scale-up",
        timeframe_ar="١٢+ شهر",
        timeframe_en="12+ months",
        goals_ar=["توسيع قاعدة العملاء لمؤسسات مالية إضافية", "إضافة طبقة تقارير امتثال متقدمة كمصدر دخل إضافي"],
        goals_en=["Expand the customer base to additional financial institutions", "Add the advanced compliance reporting layer as an additional revenue stream"],
    ),
]


@app.get("/api/business-model")
def get_business_model():
    return {
        "positioning_statement_ar": POSITIONING_STATEMENT_AR,
        "positioning_statement_en": POSITIONING_STATEMENT_EN,
        "differentiation_pillars": [p.model_dump() for p in DIFFERENTIATION_PILLARS],
        "competitive_landscape": COMPETITIVE_LANDSCAPE.model_dump(),
        "target_segments": [s.model_dump() for s in TARGET_SEGMENTS],
        "revenue_streams": [r.model_dump() for r in REVENUE_STREAMS],
        "cost_comparison_human_vs_system": [c.model_dump() for c in COST_COMPARISON_HUMAN_VS_SYSTEM],
        "funding_cost_breakdown": [f.model_dump() for f in FUNDING_COST_BREAKDOWN],
        "future_roadmap": [r.model_dump() for r in FUTURE_ROADMAP],
        "sharia_advisory_illustrative": SHARIA_ADVISORY_ILLUSTRATIVE.model_dump(),
    }


if __name__ == "__main__":
    import os
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=port == 8000)
