from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app import service

MON = date(2026, 10, 19)
NETS = [62000, 48000, 91000, 55000, 40000, 73000, 95000, 52000, 61000, 44000, 80000, 58000]
INPUTS = {"weekStart": MON.isoformat(), "lastWeekNetSen": NETS[-1], "platforms": ["grab"], "city": "Ipoh",
          "history": [{"netSen": n, "hours": 45} for n in NETS], "bufferSen": 150000, "essentialsWeekSen": 45000,
          "seed": 7}


@pytest.fixture
def ml(monkeypatch):
    monkeypatch.setattr(service, "ML_TOKEN", "secret")
    return TestClient(service.app, headers={"X-ML-Token": "secret"})


def test_token_required_except_health(ml):
    bare = TestClient(service.app)
    assert bare.post("/solve", json={"inputs": INPUTS}).status_code == 401
    assert bare.get("/health").json() == {"ok": True}


def test_solve_speaks_camel_case_and_explains(ml):
    r = ml.post("/solve", json={"inputs": INPUTS}).json()
    assert r["salarySen"] > 0 and r["pSafe"] >= 0.95 and r["risk"] == "selamat"
    assert r["factors"] == [{"key": "first"}] and r["plannedHours"] == 45
    bill = {"name": "Ansuran motor", "amountSen": 28000, "frequency": "monthly",
            "dueDay": (MON + timedelta(days=9)).day}
    r2 = ml.post("/solve", json={"inputs": {**INPUTS, "bills": [bill]}, "prev": r}).json()
    assert r2["salarySen"] < r["salarySen"] and r2["factors"][0]["key"] == "bills"
    assert r2["billsNextWeek"] == ["Ansuran motor"]


def test_planned_hours_fall_back_to_the_prior(ml):
    no_hours = {**INPUTS, "history": [{"netSen": 60000}], "lastWeekNetSen": 60000}
    assert ml.post("/solve", json={"inputs": no_hours}).json()["plannedHours"] == 45  # grab prior


def test_p_safe_and_scenarios(ml):
    s = ml.post("/solve", json={"inputs": INPUTS}).json()["salarySen"]
    safe = ml.post("/p-safe", json={"inputs": INPUTS, "salarySen": s}).json()
    risky = ml.post("/p-safe", json={"inputs": INPUTS, "salarySen": s, "scenario": {"addMonthlySen": 60000}}).json()
    assert safe["pSafe"] > risky["pSafe"] and risky["risk"] in ("berhati", "berisiko")


def test_jurang_and_leave_preview(ml):
    low = {**INPUTS, "essentialsWeekSen": 80000, "history": [{"netSen": 50000, "hours": 35}] * 10,
           "lastWeekNetSen": 50000, "bufferSen": 0}
    j = ml.post("/jurang", json={"inputs": low}).json()
    assert j["active"] and j["hours"]["hours"] > j["hours"]["plannedHours"]
    assert ml.post("/jurang", json={"inputs": INPUTS}).json() == {"active": False}
    p = ml.post("/leave-preview", json={"inputs": INPUTS, "startWeek": (MON + timedelta(weeks=5)).isoformat(),
                                        "weeks": 1}).json()
    assert p["weeksUntil"] == 5 and p["setAsideWeekSen"] > 0 and p["salaryDeltaSen"] < 0


def test_bm_parse_flags_when_the_llm_is_needed(ml):
    assert ml.post("/bm/parse", json={"text": "isi minyak empat puluh"}).json() == {
        "amountSen": 4000, "category": "minyak", "tier": "rules", "confidence": 1.0, "needsLlm": False}
    r = ml.post("/bm/parse", json={"text": "shell 30", "threshold": 0.5}).json()
    assert r["tier"] == "classifier" and r["category"] == "minyak" and not r["needsLlm"]
    assert ml.post("/bm/parse", json={"text": "zxqv 40", "threshold": 1.01}).json()["needsLlm"]


def test_penyata_renders_html_and_pdf(ml):
    data = {"from": "2026-07-20", "to": "2026-10-18", "weeks": 12, "months": 3, "avgSen": 63000, "minSen": 40000,
            "maxSen": 95000, "trend": "flat", "platforms": ["grab"], "source": "self",
            "monthly": [{"year": 2026, "month": 9, "weeks": 4, "netSen": 250000, "avgSen": 62500, "hours": 180,
                         "source": "self"}]}
    body = {"data": data, "name": "Faiz Rahman", "generated": "2026-10-19", "lang": "ms"}
    html = ml.post("/penyata", json={**body, "format": "html"}).text
    assert "Penyata Pendapatan" in html and "RM630.00" in html and "Faiz" in html and "Rahman" not in html
    pdf = ml.post("/penyata", json=body)
    assert pdf.headers["content-type"] == "application/pdf" and pdf.content[:5] == b"%PDF-"


def test_tax_summary_and_verify_view_render(ml):
    data = {"year": 2026, "from": "2026-01-01", "to": "2026-12-31", "weeks": 12, "weeksPossible": 46,
            "platforms": ["grab"], "source": "self",
            "monthly": [{"month": 9, "weeks": 4, "faresSen": 240000, "extrasSen": 20000, "feesSen": 30000,
                         "netSen": 230000, "source": "self"}],
            "totals": {"faresSen": 240000, "extrasSen": 20000, "receiptsSen": 260000, "feesSen": 30000,
                       "netSen": 230000},
            "costs": {"business": {"items": [{"category": "minyak", "amountSen": 40000},
                                             {"category": "telefon", "amountSen": 5000}], "totalSen": 45000},
                      "asset": {"items": [{"category": "ansuran", "amountSen": 30000}], "totalSen": 30000},
                      "personal": {"items": [], "totalSen": 0}, "recordedWeeks": 3},
            "afterBusinessCostsSen": 185000,
            "contributions": {"isaraanSen": 10000, "isaraanMatchSen": 2000, "perkesoDeducted": False,
                              "perkesoSen": 3250}}
    body = {"data": data, "name": "Faiz Rahman", "generated": "2026-11-14", "lang": "en", "kind": "tax",
            "code": "CV-ABCDE-FGHJK"}
    html = ml.post("/penyata", json={**body, "format": "html", "verified": True}).text
    assert "Yearly Income Summary 2026" in html and "12 of 46 weeks recorded" in html
    assert "RM1,850.00" in html and "Fuel" in html and "capital allowance" in html and "work share" in html
    assert "Valid code" in html and "CV-ABCDE-FGHJK" in html and "not a tax return" in html
    pdf = ml.post("/penyata", json={**body, "verifyUrl": "https://coinvoy.example/o/v/ABCDEFGHJK"})
    assert pdf.content[:5] == b"%PDF-"


def test_leave_preview_by_the_day_sets_aside_a_share_of_a_week(ml):
    start = MON + timedelta(weeks=5)
    week = ml.post("/leave-preview", json={"inputs": INPUTS, "startWeek": start.isoformat(), "weeks": 1}).json()
    three = ml.post("/leave-preview", json={"inputs": INPUTS, "startWeek": start.isoformat(),
                                            "parts": [{"week": start.isoformat(), "fraction": 0.5}]}).json()
    assert three["weeksUntil"] == 5
    assert 0 < three["setAsideWeekSen"] < week["setAsideWeekSen"]  # 3 of 6 days: about half a week's set-aside
    assert three["salaryDeltaSen"] >= week["salaryDeltaSen"]  # costs the salary less than a full week
    span = ml.post("/leave-preview", json={"inputs": INPUTS, "startWeek": start.isoformat(), "parts": [
        {"week": start.isoformat(), "fraction": 2 / 6},
        {"week": (start + timedelta(weeks=1)).isoformat(), "fraction": 3 / 6}]}).json()  # Sat–Wed over two weeks
    assert three["setAsideWeekSen"] <= span["setAsideWeekSen"] < week["setAsideWeekSen"] * 1.01
