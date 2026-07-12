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
    resp = client.post("/api/chatbot/query", json={"question": "وش تعميم ١٠٢؟", "lang": "ar"})
    data = resp.json()
    assert data["confidence"] == "high"
    assert any("١٠٢" in s["circular_number"] for s in data["sources"])


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
