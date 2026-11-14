"""Coinvoy ML service: the engine, our BM classifier and the Penyata renderer, behind a small internal HTTP API.

Stateless on purpose: no database, no users, no LLM. The TypeScript API (api/) loads a rider's data, sends it here as
JSON, and stores what comes back. Every call needs the shared X-ML-Token when ML_TOKEN is set.
"""

import io
import math
import os
import re
from datetime import date, timedelta
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from pypdf import PdfReader

from app.engine import explain
from app.engine.calendar import weeks_between
from app.engine.forecast import WeekObs, prior_for
from app.engine.salary import BillIn, Inputs, LeaveIn, Scenario, p_safe_at, risk_word, solve
from app.nlp.bm_parser import parse
from app.nlp.lexicon import CATEGORIES
from app.render import penyata

ML_TOKEN = os.environ.get("ML_TOKEN", "")
RATE_MODEL = "gbm" if os.environ.get("RATE_MODEL") == "gbm" else "shrink"
MAX_HOURS, FATIGUE_HOURS = 84, 60


def require_token(request: Request, x_ml_token: str = Header("")) -> None:
    if ML_TOKEN and request.url.path != "/health" and x_ml_token != ML_TOKEN:
        raise HTTPException(401, "bad token")


app = FastAPI(title="Coinvoy ML", docs_url="/docs", dependencies=[Depends(require_token)])


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class WeekIn(Camel):
    net_sen: int
    hours: float | None = None
    week_start: date | None = None


class BillBody(Camel):
    name: str
    amount_sen: int
    frequency: Literal["weekly", "monthly", "yearly", "once"]
    due_day: int | None = None
    due_date: date | None = None


class LeaveBody(Camel):
    start_week: date
    weeks: int = Field(ge=1, le=52)
    set_aside_week_sen: int = 0
    fraction: float = Field(1.0, gt=0, le=1)


class InputsBody(Camel):
    week_start: date
    last_week_net_sen: int
    history: list[WeekIn]  # oldest first
    platforms: list[str] = []
    city: str | None = None
    default_hours: float | None = None  # the rider's plan; else recent hours; else the prior
    buffer_sen: int = 0
    cuti_sen: int = 0
    bills: list[BillBody] = []
    leaves: list[LeaveBody] = []
    essentials_week_sen: int = 0
    reserves_week_sen: int = 0
    seed: int = 0


class ScenarioBody(Camel):
    hours: float | None = Field(None, ge=0, le=MAX_HOURS)
    add_monthly_sen: int = Field(0, ge=0)
    one_off_sen: int = Field(0, ge=0)
    one_off_week: int = Field(1, ge=0, le=11)
    leaves: list[LeaveBody] = []


def _leave(x: LeaveBody) -> LeaveIn:
    return LeaveIn(x.start_week, x.weeks, x.set_aside_week_sen, x.fraction)


def to_inputs(b: InputsBody) -> Inputs:
    prior = prior_for(b.platforms, b.city)
    recent = [w.hours for w in b.history[-4:] if w.hours]
    planned = b.default_hours or (sum(recent) / len(recent) if recent else prior.default_hours)
    return Inputs(
        week_start=b.week_start, last_week_net_sen=b.last_week_net_sen,
        history=tuple(WeekObs(w.net_sen, w.hours, w.week_start) for w in b.history), prior=prior,
        planned_hours=float(planned),
        buffer_sen=b.buffer_sen, cuti_sen=b.cuti_sen,
        bills=tuple(BillIn(x.name, x.amount_sen, x.frequency, x.due_day, x.due_date) for x in b.bills),
        leaves=tuple(_leave(x) for x in b.leaves), essentials_week_sen=b.essentials_week_sen,
        reserves_week_sen=b.reserves_week_sen, seed=b.seed, rate_model=RATE_MODEL)


def to_scenario(s: ScenarioBody | None) -> Scenario:
    if s is None:
        return Scenario()
    return Scenario(hours=s.hours, add_monthly_sen=s.add_monthly_sen, one_off_sen=s.one_off_sen,
                    one_off_week=s.one_off_week, leaves=tuple(_leave(x) for x in s.leaves))


def camel(value):
    if isinstance(value, dict):
        return {to_camel(k): camel(v) for k, v in value.items()}
    if isinstance(value, list):
        return [camel(v) for v in value]
    return value


def to_snake(key: str) -> str:
    """The inverse of to_camel, digits included: bills4wSen → bills_soon_sen, per100Sen → per_100_sen."""
    return re.sub(r"(?<=[a-z])(?=\d)|(?=[A-Z])", "_", key).lower()


def snake(value):
    if isinstance(value, dict):
        return {to_snake(k): snake(v) for k, v in value.items()}
    if isinstance(value, list):
        return [snake(v) for v in value]
    return value


class SolveIn(Camel):
    inputs: InputsBody
    scenario: ScenarioBody | None = None
    prev: dict | None = None  # the previous week's result (as returned here), for the explanation


@app.post("/solve")
def solve_route(body: SolveIn) -> dict:
    inp = to_inputs(body.inputs)
    res = solve(inp, to_scenario(body.scenario)).as_dict()
    prev = snake(body.prev) if body.prev else None
    res["factors"] = explain.diff(prev, res)
    res["planned_hours"] = inp.planned_hours
    return camel(res)


class PSafeIn(Camel):
    inputs: InputsBody
    salary_sen: int
    scenario: ScenarioBody | None = None


@app.post("/p-safe")
def p_safe_route(body: PSafeIn) -> dict:
    p = p_safe_at(to_inputs(body.inputs), body.salary_sen, to_scenario(body.scenario))
    return {"pSafe": p, "risk": risk_word(p)}


class InputsOnly(Camel):
    inputs: InputsBody


@app.post("/jurang")
def jurang_route(body: InputsOnly) -> dict:
    """The fewest whole hours whose safe salary covers essentials, capped at 84 a week (FR-ADV-7)."""
    inp = to_inputs(body.inputs)
    now = solve(inp)
    if now.jurang is None:
        return {"active": False}
    essentials = inp.essentials_week_sen
    lo, hi = int(inp.planned_hours), MAX_HOURS
    reach = solve(inp, Scenario(hours=hi)).salary_sen >= essentials
    while lo < hi:
        mid = (lo + hi) // 2
        lo, hi = (lo, mid) if solve(inp, Scenario(hours=mid)).salary_sen >= essentials else (mid + 1, hi)
    safe = essentials - now.jurang["gap_sen"]  # the safe salary before any build-up hold-back
    return {"active": True, "essentialsSen": essentials, "salarySen": safe, "gapSen": now.jurang["gap_sen"],
            "hours": {"plannedHours": inp.planned_hours, "hours": hi, "extraHours": hi - inp.planned_hours,
                      "salarySen": solve(inp, Scenario(hours=hi)).salary_sen, "closesGap": reach,
                      "fatigue": hi > FATIGUE_HOURS},
            "costs": {"cutSen": now.jurang["gap_sen"], "essentialsAfterSen": safe}}


class LeavePart(Camel):
    week: date  # a Monday
    fraction: float = Field(gt=0, le=1)  # share of that week off: days / 6, a full week = 1


class LeavePreviewIn(Camel):
    inputs: InputsBody
    start_week: date
    weeks: int = Field(1, ge=1, le=5)
    parts: list[LeavePart] = Field(default_factory=list, max_length=5)  # leave by the day; else whole weeks


@app.post("/leave-preview")
def leave_preview_route(body: LeavePreviewIn) -> dict:
    """How much to set aside each week until the leave, and what that does to the salary (FR-CUTI-1).
    Leave picked by the day comes as parts: one per week it touches, with the share of that week off."""
    inp = to_inputs(body.inputs)
    parts = [(p.week, p.fraction) for p in body.parts] or [
        (body.start_week + timedelta(weeks=i), 1.0) for i in range(body.weeks)]
    until = weeks_between(inp.week_start, parts[0][0])
    now = solve(inp)
    weeks_off = sum(f for _, f in parts)
    set_aside = math.ceil(now.salary_sen * weeks_off / max(until, 1) / 100) * 100  # enough to pay every day off
    # The whole set-aside rides on the first part, so it's counted once; each part pays its share of a salary.
    leaves = tuple(LeaveIn(w, 1, set_aside if i == 0 else 0, f) for i, (w, f) in enumerate(parts))
    planned = solve(inp, Scenario(leaves=leaves))
    return {"weeksUntil": until, "setAsideWeekSen": set_aside, "salarySen": planned.salary_sen,
            "salaryDeltaSen": planned.salary_sen - now.salary_sen, "pSafe": planned.p_safe, "risk": planned.risk}


class ParseIn(Camel):
    text: str = Field(min_length=1, max_length=120)
    threshold: float = Field(0.7, ge=0, le=1.01)


@app.post("/bm/parse")
def bm_parse(body: ParseIn) -> dict:
    """Tiers 1–2 (rules, our classifier). needsLlm tells the API to ask the LLM for what's still missing."""
    p = parse(body.text, body.threshold)
    confident = p.tier == "rules" or (p.tier == "classifier" and p.confidence >= body.threshold)
    return {"amountSen": p.amount_sen, "category": p.category if p.category in CATEGORIES else None,
            "tier": p.tier, "confidence": p.confidence,
            "needsLlm": not confident or p.amount_sen is None or p.category is None}


class PenyataIn(Camel):
    data: dict
    lang: Literal["ms", "en"] = "ms"
    name: str
    generated: date
    expires: str | None = None
    format: Literal["html", "pdf"] = "pdf"
    kind: Literal["loan", "tax"] = "loan"
    code: str | None = None
    verify_url: str | None = None
    verified: bool = False


@app.post("/penyata")
def penyata_route(body: PenyataIn) -> Response:
    data = snake(body.data)
    if body.format == "html":
        return HTMLResponse(penyata.render_html(body.name, data, body.lang, body.generated, body.expires, body.kind,
                                                body.code, body.verified))
    return Response(penyata.render_pdf(body.name, data, body.lang, body.generated, body.kind, body.code,
                                       body.verify_url), media_type="application/pdf")


@app.post("/statement/text")
async def statement_text(request: Request) -> dict:
    """A bank or e-wallet statement PDF → its text lines (FR-SNAP-10). Read in memory, never stored; the API does the
    matching. Limited to 10 pages and 5 MB."""
    raw = await request.body()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "too big")
    try:
        reader = PdfReader(io.BytesIO(raw))
        if reader.is_encrypted:
            raise HTTPException(422, "encrypted")
        text = "\n".join((page.extract_text() or "") for page in reader.pages[:10])
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 - any unreadable file is the same answer to the rider
        raise HTTPException(422, "unreadable") from e
    return {"lines": [ln.strip() for ln in text.splitlines() if ln.strip()][:2000]}


@app.get("/health")
def health() -> dict:
    return {"ok": True}

