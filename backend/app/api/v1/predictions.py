import html
import math
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, auth_ctx, writer
from app.db.base import utcnow
from app.db.session import get_db
from app.models import Customer, Prediction
from app.schemas.prediction import CustomerData, PredictionV1Response
from app.schemas.records import (DashboardOut, Page, PredictionCreate, PredictionDetail,
                                 PredictionOut)
from app.services import audit
from app.services.access import visible_owner_ids
from app.services.deps import get_prediction_service
from app.services.prediction_service import DISCLAIMER
from app.services.records import customer_features, parse_uuid, to_csv

router = APIRouter(tags=["predictions"])

SORTS = {"created_at": Prediction.created_at, "probability": Prediction.churn_probability,
         "risk_level": Prediction.risk_level, "reference": Prediction.reference}


def _out(p: Prediction) -> PredictionOut:
    return PredictionOut(
        id=p.id, customer_id=p.customer_id, reference=p.reference, source=p.source,
        prediction=p.predicted_class,
        predicted_label="churn" if p.predicted_class else "no_churn",
        probability=p.churn_probability, threshold=p.threshold, risk_level=p.risk_level,
        model_version=p.model_version, created_at=p.created_at)


def _detail(p: Prediction) -> PredictionDetail:
    from app.services.explain import explain
    return PredictionDetail(**_out(p).model_dump(), input=p.input_snapshot,
                            disclaimer=DISCLAIMER,
                            explanation=explain(get_prediction_service().model, p.input_snapshot))


def _visible(db: Session, ctx: AuthContext, prediction_id: str, write=False) -> Prediction:
    pid = parse_uuid(prediction_id)
    p = db.get(Prediction, pid) if pid else None
    allowed = [ctx.user.id] if write else visible_owner_ids(ctx.user)
    if p is None or p.user_id not in allowed:
        raise HTTPException(404, "Prediction not found.")
    return p


def _filters(stmt, owners, q, risk_level, predicted_class, source, customer_id,
             date_from, date_to):
    stmt = stmt.where(Prediction.user_id.in_(owners))
    if q:
        stmt = stmt.where(func.lower(Prediction.reference).like(f"%{q.strip().lower()}%"))
    if risk_level:
        stmt = stmt.where(Prediction.risk_level.in_(risk_level))
    if predicted_class is not None:
        stmt = stmt.where(Prediction.predicted_class == predicted_class)
    if source:
        stmt = stmt.where(Prediction.source == source)
    if customer_id:
        cid = parse_uuid(customer_id)
        stmt = stmt.where(Prediction.customer_id == cid)
    if date_from:
        stmt = stmt.where(Prediction.created_at >= datetime.combine(
            date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        stmt = stmt.where(Prediction.created_at < datetime.combine(
            date_to + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))
    return stmt


def _make_prediction(db, ctx, features: dict, reference, source, customer_id=None) -> Prediction:
    svc = get_prediction_service()
    result = svc.predict_detailed(features)
    row = Prediction(
        user_id=ctx.user.id, customer_id=customer_id, reference=reference, source=source,
        predicted_class=result["prediction"], churn_probability=result["probability"],
        threshold=result["threshold"], risk_level=result["risk_level"],
        model_version=result["model_version"], input_snapshot=features)
    db.add(row)
    db.commit()
    return row


# ---- stateless preview --------------------------------------------------------

@router.post("/predict", response_model=PredictionV1Response)
def predict_preview(customer: CustomerData, ctx: AuthContext = Depends(writer)):
    """Run the model without saving anything."""
    try:
        return get_prediction_service().predict_detailed(customer.model_dump())
    except Exception as exc:
        raise HTTPException(500, "Prediction failed.") from exc


# ---- persisted predictions ----------------------------------------------------

@router.post("/predictions", response_model=PredictionDetail, status_code=201)
def create_prediction(body: PredictionCreate, request: Request,
                      ctx: AuthContext = Depends(writer), db: Session = Depends(get_db)):
    customer_id = None
    reference = body.reference
    if body.customer_id:
        c = db.get(Customer, body.customer_id)
        if c is None or c.owner_id != ctx.user.id:  # IDOR guard
            raise HTTPException(404, "Customer not found.")
        features, customer_id, source = customer_features(c), c.id, "customer"
        reference = c.customer_identifier
    else:
        features, source = body.input.model_dump(), "single"
    row = _make_prediction(db, ctx, features, reference, source, customer_id)
    audit.record(db, "prediction_created", actor_id=ctx.user.id, resource_type="prediction",
                 resource_id=row.id, request=request,
                 details={"source": source, "risk_level": row.risk_level})
    return _detail(row)


@router.get("/predictions", response_model=Page[PredictionOut])
def list_predictions(
    q: str | None = Query(None, max_length=100),
    risk_level: list[str] | None = Query(None),
    predicted_class: int | None = Query(None, ge=0, le=1),
    source: str | None = Query(None, pattern="^(single|customer|bulk)$"),
    customer_id: str | None = None,
    date_from: date | None = None, date_to: date | None = None,
    sort: str = "created_at", order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    ctx: AuthContext = Depends(auth_ctx), db: Session = Depends(get_db),
):
    if risk_level and not set(risk_level) <= {"low", "medium", "high"}:
        raise HTTPException(422, "risk_level must be low, medium or high.")
    base = _filters(select(Prediction), visible_owner_ids(ctx.user), q, risk_level,
                    predicted_class, source, customer_id, date_from, date_to)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    col = SORTS.get(sort, Prediction.created_at)
    stmt = base.order_by(col.asc() if order == "asc" else col.desc(), Prediction.id) \
        .offset((page - 1) * page_size).limit(page_size)
    return Page(items=[_out(p) for p in db.scalars(stmt)], total=total, page=page,
                page_size=page_size, pages=max(1, math.ceil(total / page_size)))


@router.get("/predictions/export.csv")
def export_predictions(
    request: Request, q: str | None = None, risk_level: list[str] | None = Query(None),
    predicted_class: int | None = Query(None, ge=0, le=1),
    source: str | None = Query(None, pattern="^(single|customer|bulk)$"),
    customer_id: str | None = None, date_from: date | None = None, date_to: date | None = None,
    ctx: AuthContext = Depends(auth_ctx), db: Session = Depends(get_db),
):
    stmt = _filters(select(Prediction), visible_owner_ids(ctx.user), q, risk_level,
                    predicted_class, source, customer_id, date_from, date_to) \
        .order_by(Prediction.created_at.desc()).limit(50000)
    rows = db.scalars(stmt).all()
    header = ["id", "created_at", "reference", "source", "predicted_label", "probability",
              "risk_level", "threshold", "model_version"]
    body = to_csv(header, [[p.id, p.created_at.isoformat(), p.reference or "", p.source,
                            "churn" if p.predicted_class else "no_churn",
                            f"{p.churn_probability:.4f}", p.risk_level, p.threshold,
                            p.model_version] for p in rows])
    audit.record(db, "data_export", actor_id=ctx.user.id, resource_type="prediction",
                 request=request, details={"rows": len(rows), "kind": "predictions_csv"})
    return Response(body, media_type="text/csv", headers={
        "Content-Disposition": 'attachment; filename="predictions.csv"'})


@router.get("/predictions/{prediction_id}", response_model=PredictionDetail)
def get_prediction(prediction_id: str, ctx: AuthContext = Depends(auth_ctx),
                   db: Session = Depends(get_db)):
    return _detail(_visible(db, ctx, prediction_id))


@router.delete("/predictions/{prediction_id}", status_code=204)
def delete_prediction(prediction_id: str, request: Request,
                      ctx: AuthContext = Depends(writer), db: Session = Depends(get_db)):
    p = _visible(db, ctx, prediction_id, write=True)
    pid = p.id
    db.delete(p)
    db.commit()
    audit.record(db, "prediction_deleted", actor_id=ctx.user.id, resource_type="prediction",
                 resource_id=pid, request=request)


@router.get("/predictions/{prediction_id}/report")
def prediction_report(prediction_id: str, request: Request,
                      ctx: AuthContext = Depends(auth_ctx), db: Session = Depends(get_db)):
    p = _visible(db, ctx, prediction_id)
    e = html.escape
    rows = "".join(f"<tr><th>{e(str(k))}</th><td>{e('' if v is None else str(v))}</td></tr>"
                   for k, v in p.input_snapshot.items())
    doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Churn prediction report</title>
<style>body{{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;color:#0f172a}}
table{{border-collapse:collapse;width:100%}}th,td{{text-align:left;padding:6px 10px;border-bottom:1px solid #e2e8f0}}
.risk{{font-size:1.4rem;font-weight:700}}.note{{color:#475569;font-size:.9rem}}</style></head><body>
<h1>Churn prediction report</h1>
<p class="note">Customer: {e(p.reference or 'n/a')} &middot; Generated {e(utcnow().isoformat(timespec='seconds'))} &middot; Prediction {e(str(p.id))}</p>
<p class="risk">Risk: {e(p.risk_level.upper())} &mdash; probability {p.churn_probability:.1%}</p>
<p>Predicted class: <b>{'Churn' if p.predicted_class else 'No churn'}</b> (classification threshold {p.threshold:.2f}) &middot; Model version {e(p.model_version)}</p>
<p class="note">{e(DISCLAIMER)}</p>
<h2>Customer input</h2><table>{rows}</table></body></html>"""
    audit.record(db, "data_export", actor_id=ctx.user.id, resource_type="prediction",
                 resource_id=p.id, request=request, details={"kind": "report"})
    return Response(doc, media_type="text/html; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="churn-report-{p.id}.html"'})


# ---- dashboard ---------------------------------------------------------------------

@router.get("/dashboard", response_model=DashboardOut)
def dashboard(days: int = Query(30, ge=7, le=90), ctx: AuthContext = Depends(auth_ctx),
              db: Session = Depends(get_db)):
    owners = visible_owner_ids(ctx.user)
    base = Prediction.user_id.in_(owners)
    agg = db.execute(select(
        func.count(Prediction.id),
        func.coalesce(func.sum(case((Prediction.risk_level == "high", 1), else_=0)), 0),
        func.coalesce(func.sum(case((Prediction.risk_level == "medium", 1), else_=0)), 0),
        func.coalesce(func.sum(case((Prediction.risk_level == "low", 1), else_=0)), 0),
        func.avg(Prediction.churn_probability)).where(base)).one()
    since = utcnow() - timedelta(days=days - 1)
    since = since.replace(hour=0, minute=0, second=0, microsecond=0)
    per_day = dict(db.execute(select(func.date(Prediction.created_at), func.count()).where(
        base, Prediction.created_at >= since).group_by(func.date(Prediction.created_at))).all())
    per_day = {str(k): v for k, v in per_day.items()}
    activity = [{"date": (since + timedelta(days=i)).date().isoformat(),
                 "count": per_day.get((since + timedelta(days=i)).date().isoformat(), 0)}
                for i in range(days)]
    recent = db.scalars(select(Prediction).where(base)
                        .order_by(Prediction.created_at.desc()).limit(5)).all()
    return DashboardOut(
        total_predictions=agg[0], high_risk=int(agg[1]), medium_risk=int(agg[2]),
        low_risk=int(agg[3]), average_probability=float(agg[4]) if agg[4] is not None else None,
        recent=[_out(p) for p in recent], activity=activity,
        scope="assigned_analyst" if ctx.user.role == "viewer" else "own")
