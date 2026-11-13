import math

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, auth_ctx, writer
from app.db.session import get_db
from app.models import Customer, Prediction
from app.schemas.prediction import CustomerData
from app.schemas.records import CustomerCreate, CustomerOut, LatestPrediction, Page
from app.services import audit
from app.services.access import visible_owner_ids
from app.services.records import customer_features, parse_uuid, to_columns

router = APIRouter(prefix="/customers", tags=["customers"])

SORTS = {
    "created_at": Customer.created_at, "customer_identifier": Customer.customer_identifier,
    "tenure": Customer.tenure, "monthly_charges": Customer.monthly_charges,
}


def _owned(db: Session, ctx: AuthContext, customer_id: str, write: bool = False) -> Customer:
    """Load a customer the caller may access, else 404 (never reveal existence)."""
    cid = parse_uuid(customer_id)
    c = db.get(Customer, cid) if cid else None
    allowed = [ctx.user.id] if write else visible_owner_ids(ctx.user)
    if c is None or c.owner_id not in allowed:
        raise HTTPException(404, "Customer not found.")
    return c


def _out(c: Customer, latest: Prediction | None = None) -> CustomerOut:
    lp = None
    if latest is not None:
        lp = LatestPrediction(id=latest.id, probability=latest.churn_probability,
                              risk_level=latest.risk_level,
                              predicted_label="churn" if latest.predicted_class else "no_churn",
                              created_at=latest.created_at)
    return CustomerOut(id=c.id, customer_identifier=c.customer_identifier,
                       created_at=c.created_at, updated_at=c.updated_at,
                       latest_prediction=lp, **customer_features(c))


def _latest_map(db: Session, ids) -> dict:
    if not ids:
        return {}
    sub = select(Prediction.customer_id, func.max(Prediction.created_at).label("mx")) \
        .where(Prediction.customer_id.in_(ids)).group_by(Prediction.customer_id).subquery()
    rows = db.scalars(select(Prediction).join(
        sub, (Prediction.customer_id == sub.c.customer_id) & (Prediction.created_at == sub.c.mx))).all()
    return {p.customer_id: p for p in rows}


@router.post("", response_model=CustomerOut, status_code=201)
def create_customer(body: CustomerCreate, request: Request,
                    ctx: AuthContext = Depends(writer), db: Session = Depends(get_db)):
    features = body.model_dump(exclude={"customer_identifier"})
    c = Customer(owner_id=ctx.user.id, customer_identifier=body.customer_identifier.strip(),
                 **to_columns(features))
    db.add(c)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A customer with this identifier already exists.")
    audit.record(db, "customer_created", actor_id=ctx.user.id, resource_type="customer",
                 resource_id=c.id, request=request)
    return _out(c)


@router.get("", response_model=Page[CustomerOut])
def list_customers(
    q: str | None = Query(None, max_length=100),
    contract: str | None = None, internet_service: str | None = None,
    senior: int | None = Query(None, ge=0, le=1),
    sort: str = "created_at", order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    ctx: AuthContext = Depends(auth_ctx), db: Session = Depends(get_db),
):
    owners = visible_owner_ids(ctx.user)
    stmt = select(Customer).where(Customer.owner_id.in_(owners))
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(func.lower(Customer.customer_identifier).like(like))
    if contract:
        stmt = stmt.where(Customer.contract == contract)
    if internet_service:
        stmt = stmt.where(Customer.internet_service == internet_service)
    if senior is not None:
        stmt = stmt.where(Customer.senior_citizen == senior)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    col = SORTS.get(sort, Customer.created_at)
    stmt = stmt.order_by(col.asc() if order == "asc" else col.desc(), Customer.id)
    rows = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    latest = _latest_map(db, [r.id for r in rows])
    return Page(items=[_out(r, latest.get(r.id)) for r in rows], total=total, page=page,
                page_size=page_size, pages=max(1, math.ceil(total / page_size)))


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: str, ctx: AuthContext = Depends(auth_ctx),
                 db: Session = Depends(get_db)):
    c = _owned(db, ctx, customer_id)
    return _out(c, _latest_map(db, [c.id]).get(c.id))


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: str, body: dict, request: Request,
                    ctx: AuthContext = Depends(writer), db: Session = Depends(get_db)):
    c = _owned(db, ctx, customer_id, write=True)
    identifier = body.pop("customer_identifier", None)
    unknown = set(body) - set(customer_features(c))
    if unknown:
        raise HTTPException(422, f"Unknown fields: {', '.join(sorted(unknown))}")
    merged = {**customer_features(c), **body}
    try:  # re-validate the complete record so cross-field rules still hold
        valid = CustomerData(**merged)
    except ValidationError as e:
        raise HTTPException(422, [{"loc": err["loc"], "msg": err["msg"]} for err in e.errors()])
    for col, val in to_columns(valid.model_dump()).items():
        setattr(c, col, val)
    if identifier is not None:
        identifier = str(identifier).strip()
        if not identifier or len(identifier) > 100:
            raise HTTPException(422, "customer_identifier must be 1-100 characters.")
        c.customer_identifier = identifier
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A customer with this identifier already exists.")
    audit.record(db, "customer_updated", actor_id=ctx.user.id, resource_type="customer",
                 resource_id=c.id, request=request)
    return _out(c, _latest_map(db, [c.id]).get(c.id))


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: str, request: Request,
                    ctx: AuthContext = Depends(writer), db: Session = Depends(get_db)):
    c = _owned(db, ctx, customer_id, write=True)
    cid = c.id
    # Retention policy: deleting a customer also deletes their saved predictions.
    removed = db.execute(delete(Prediction).where(Prediction.customer_id == cid)).rowcount
    db.delete(c)
    db.commit()
    audit.record(db, "customer_deleted", actor_id=ctx.user.id, resource_type="customer",
                 resource_id=cid, request=request, details={"predictions_deleted": removed})
