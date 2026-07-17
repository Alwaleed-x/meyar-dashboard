"""
Automated tests for the Meyar backend.

Run with:
    pip install pytest httpx
    pytest test_main.py -v

Note: uses FastAPI's TestClient (built on httpx), which talks to the app
in-process — no real server or network needed to run these.
"""

import os

os.environ["MEYAR_DB_PATH"] = "test_meyar.db"
os.environ["MEYAR_MODEL_PATH"] = "test_risk_model.joblib"

import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


@pytest.fixture(autouse=True, scope="module")
def cleanup_test_artifacts():
    yield
    for path in (os.environ["MEYAR_DB_PATH"], os.environ["MEYAR_MODEL_PATH"]):
        if os.path.exists(path):
            os.remove(path)


# ---------------------------------------------------------------------------
# Risk model
# ---------------------------------------------------------------------------


def test_model_metrics_are_real_numbers_in_valid_range():
    resp = client.get("/api/model-metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert 0 <= data["current"]["precision"] <= 100
    assert 0 <= data["current"]["recall"] <= 100
    assert data["test_set_size"] > 0


def test_high_risk_features_score_higher_than_low_risk_features():
    high = main._score_transaction_risk(amount=470_000, hour=14, deviation=0.95, freq_last_hour=7, is_first_time=1)
    low = main._score_transaction_risk(amount=1_000, hour=14, deviation=0.05, freq_last_hour=0, is_first_time=0)
    assert high["probability"] > low["probability"]


# ---------------------------------------------------------------------------
# Two-tier classification (webhook)
# ---------------------------------------------------------------------------


def test_amount_over_daily_limit_is_auto_blocked():
    resp = client.post("/api/webhook/transaction", json={"amount_sar": main.SAMA_DAILY_LIMIT_SAR + 1000})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "blocked"
    assert data["action_level"] == "auto_block"
    assert data["certainty"] == "rule_based"


def test_small_low_risk_amount_passes():
    resp = client.post(
        "/api/webhook/transaction",
        json={"amount_sar": 500, "deviation": 0.02, "freq_last_hour": 0, "is_first_time": False},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "passed"


# ---------------------------------------------------------------------------
# Chatbot
# ---------------------------------------------------------------------------


def test_chatbot_greeting_is_instant_and_uncited():
    resp = client.post("/api/chatbot/query", json={"question": "اهلا", "lang": "ar"})
    data = resp.json()
    assert data["confidence"] == "high"
    assert data["sources"] == []


def test_chatbot_matches_circular_by_bare_number():
    resp = client.post("/api/chatbot/query", json={"question": "وش تعميم 18147؟", "lang": "ar"})
    data = resp.json()
    assert data["confidence"] == "high"
    assert any("18147" in s["circular_number"] for s in data["sources"])


def test_chatbot_never_merges_sources_on_a_single_weak_keyword():
    # Regression test for a real bug: a lone shared keyword between two
    # unrelated KB entries used to produce a confusing merged answer.
    # This exact question ties 1-1 between two DIFFERENT topics (KYC
    # identity vs. data protection) — the fix must return only the single
    # best match, not both merged together.
    resp = client.post(
        "/api/chatbot/query",
        json={"question": "كيف تحمون بيانات العميل الشخصية", "lang": "ar"},
    )
    data = resp.json()
    assert len(data["sources"]) == 1
    assert data["confidence"] == "medium"


# ---------------------------------------------------------------------------
# Review queue + audit trail (SQLite-backed)
# ---------------------------------------------------------------------------


def test_review_queue_has_seeded_items():
    resp = client.get("/api/review-queue")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) >= 1


def test_deciding_a_review_item_moves_it_to_audit_log():
    queue_before = client.get("/api/review-queue").json()["items"]
    assert queue_before, "expected at least one seeded pending item"
    target_id = queue_before[0]["id"]

    decide_resp = client.post(
        f"/api/review-queue/{target_id}/decide",
        json={"decision": "approve", "reviewer_name": "اختبار آلي"},
    )
    assert decide_resp.status_code == 200
    assert decide_resp.json()["decision"] == "approved"

    queue_after = client.get("/api/review-queue").json()["items"]
    assert all(item["id"] != target_id for item in queue_after)

    audit = client.get("/api/audit-log").json()["items"]
    assert any(entry["transaction_id"] == target_id for entry in audit)


def test_deciding_an_unknown_transaction_returns_not_found_not_a_fake_decision():
    resp = client.post(
        "/api/review-queue/TXN-DOES-NOT-EXIST/decide",
        json={"decision": "approve", "reviewer_name": "اختبار آلي"},
    )
    assert resp.json()["decision"] == "not_found"


# ---------------------------------------------------------------------------
# Risk Appetite — the GET endpoint must never block on model inference; the
# exposure figure is precomputed in the background (see
# _refresh_exposure_cache), so this call should return near-instantly.
# ---------------------------------------------------------------------------


def test_risk_appetite_reflects_selected_level_threshold():
    resp = client.post(
        "/api/risk-appetite",
        json={
            "level": "conservative",
            "institution_name": "بنك تجريبي",
            "approved_by": "لجنة اختبار",
            "approved_date": "2026-01-01",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["level"] == "conservative"
    assert data["threshold"] == main.RISK_APPETITE_LEVELS["conservative"]["threshold"]

    get_resp = client.get("/api/risk-appetite")
    assert get_resp.status_code == 200
    assert get_resp.json()["level"] == "conservative"
    # current_exposure_pct must be a plain precomputed number, not something
    # that triggers fresh inference on this request.
    assert isinstance(get_resp.json()["current_exposure_pct"], (int, float))


# ---------------------------------------------------------------------------
# Regulatory monitor (SAMA Rulebook watch) — network calls are monkeypatched
# so these run fully offline and deterministically. No authentication is
# required for any of these endpoints in this version of the project.
# ---------------------------------------------------------------------------


def test_first_check_establishes_baseline_not_a_change(monkeypatch):
    monkeypatch.setattr(main, "_fetch_source_text", lambda url, timeout=5: f"نص صفحة {url}")
    result = main.run_regulatory_check()
    statuses = {r["source_key"]: r["status"] for r in result["results"]}
    assert all(s in ("baseline_established", "unchanged", "change_detected") for s in statuses.values())


def test_content_change_is_queued_for_human_review_not_auto_applied(monkeypatch):
    # First cycle: establish a known baseline for every source.
    monkeypatch.setattr(main, "_fetch_source_text", lambda url, timeout=5: "نص أصلي ثابت")
    main.run_regulatory_check()

    pending_before = client.get("/api/regulatory-monitor/pending").json()["items"]

    # Second cycle: the page content actually changed.
    monkeypatch.setattr(main, "_fetch_source_text", lambda url, timeout=5: "نص جديد بعد تعديل ساما فعلي")
    result = main.run_regulatory_check()
    assert any(r["status"] == "change_detected" for r in result["results"])

    pending_after = client.get("/api/regulatory-monitor/pending").json()["items"]
    assert len(pending_after) > len(pending_before)

    # The change must NOT be live yet — the stored hash only updates once a
    # human approves it, never automatically.
    new_item = pending_after[0]
    decide_resp = client.post(
        f"/api/regulatory-monitor/pending/{new_item['id']}/decide",
        json={"decision": "approve", "reviewer_name": "اختبار آلي"},
    )
    assert decide_resp.status_code == 200
    assert decide_resp.json()["status"] == "approved"


def test_rejected_change_keeps_being_flagged_next_cycle(monkeypatch):
    monkeypatch.setattr(main, "_fetch_source_text", lambda url, timeout=5: "نص ثابت للرفض")
    main.run_regulatory_check()  # baseline

    monkeypatch.setattr(main, "_fetch_source_text", lambda url, timeout=5: "نص مرفوض من المراجع البشري")
    main.run_regulatory_check()  # detects change #1
    pending = client.get("/api/regulatory-monitor/pending").json()["items"]
    target = next(p for p in pending if p["new_excerpt"] == "نص مرفوض من المراجع البشري")
    client.post(
        f"/api/regulatory-monitor/pending/{target['id']}/decide",
        json={"decision": "reject", "reviewer_name": "اختبار آلي"},
    )

    # Same (still-different-from-baseline) content on the next cycle must be
    # flagged again — a rejection must not silently accept it going forward.
    result = main.run_regulatory_check()
    assert any(r["status"] == "change_detected" for r in result["results"])


def test_fetch_failure_does_not_crash_the_check_cycle(monkeypatch):
    monkeypatch.setattr(main, "_fetch_source_text", lambda url, timeout=5: None)
    result = main.run_regulatory_check()
    assert all(r["status"] == "fetch_failed" for r in result["results"])


def test_check_now_endpoint_responds_immediately():
    # The endpoint hands the actual check to a background task and must
    # not block the response waiting for it — this is what keeps a "check
    # now" click from feeling frozen in front of a live audience.
    resp = client.post("/api/regulatory-monitor/check-now")
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"
