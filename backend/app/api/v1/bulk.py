import uuid
from datetime import datetime

from fastapi import (APIRouter, BackgroundTasks, Depends, File, HTTPException, Request,
                     Response, UploadFile)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AuthContext, writer
from app.core.config import settings
from app.db import session as dbsession
from app.db.session import get_db
from app.models import Job
from app.services import audit, bulk
from app.services.deps import get_prediction_service
from app.services.records import FEATURES, parse_uuid

router = APIRouter(tags=["bulk"])


class RowError(BaseModel):
    row: int
    errors: list[str]


class ValidationReport(BaseModel):
    filename: str | None
    total_rows: int
    valid_rows: int
    invalid_rows: int
    required_columns: list[str]
    missing_columns: list[str]
    ignored_columns: list[str]
    errors: list[RowError]
    errors_truncated: bool
    preview: list[dict]
    can_process: bool


class JobOut(BaseModel):
    id: uuid.UUID
    status: str
    filename: str | None
    total_rows: int
    processed_rows: int
    invalid_rows: int
    error: str | None
    created_at: datetime
    finished_at: datetime | None


def _job_out(j: Job) -> JobOut:
    return JobOut(id=j.id, status=j.status, filename=j.filename, total_rows=j.total_rows,
                  processed_rows=j.processed_rows, invalid_rows=j.invalid_rows,
                  error=j.error, created_at=j.created_at, finished_at=j.finished_at)


async def _read(file: UploadFile) -> bytes:
    data = await file.read(settings.bulk_max_upload_bytes + 1)
    if len(data) > settings.bulk_max_upload_bytes:
        raise HTTPException(413, f"File too large (limit "
                                 f"{settings.bulk_max_upload_bytes // (1024 * 1024)} MB).")
    return data


@router.post("/predictions/bulk/validate", response_model=ValidationReport)
async def validate_upload(file: UploadFile = File(...), ctx: AuthContext = Depends(writer)):
    data = await _read(file)
    try:
        parsed = bulk.parse(data, settings.bulk_max_rows)
    except bulk.CsvError as e:
        raise HTTPException(e.status, e.message)
    rows = bulk.validate_rows(parsed) if not parsed["missing"] else []
    bad = [r for r in rows if r["errors"]]
    names = parsed["header"]
    preview = [dict(zip(names, r["raw"])) for r in parsed["rows"][:10]]
    return ValidationReport(
        filename=file.filename, total_rows=len(parsed["rows"]),
        valid_rows=len(rows) - len(bad), invalid_rows=len(bad),
        required_columns=FEATURES, missing_columns=parsed["missing"],
        ignored_columns=parsed["extras"],
        errors=[RowError(row=r["line"], errors=r["errors"]) for r in bad[:100]],
        errors_truncated=len(bad) > 100, preview=preview,
        can_process=not parsed["missing"] and len(rows) > 0)


@router.post("/predictions/bulk", response_model=JobOut, status_code=202)
async def start_bulk(request: Request, background: BackgroundTasks,
                     file: UploadFile = File(...),
                     ctx: AuthContext = Depends(writer), db: Session = Depends(get_db)):
    data = await _read(file)
    try:
        parsed = bulk.parse(data, settings.bulk_max_rows)
    except bulk.CsvError as e:
        raise HTTPException(e.status, e.message)
    if parsed["missing"]:
        raise HTTPException(422, "Missing required columns: " + ", ".join(parsed["missing"]))
    if not parsed["rows"]:
        raise HTTPException(422, "The file contains no data rows.")

    job = Job(user_id=ctx.user.id, filename=(file.filename or "upload.csv")[:255],
              status="pending", total_rows=len(parsed["rows"]),
              input_csv=data.decode("utf-8-sig"))
    db.add(job)
    db.commit()
    audit.record(db, "bulk_upload", actor_id=ctx.user.id, resource_type="job",
                 resource_id=job.id, request=request, details={"rows": job.total_rows})
    background.add_task(bulk.run_job, job.id, dbsession.SessionLocal,
                        get_prediction_service())
    return _job_out(job)


def _owned_job(db: Session, ctx: AuthContext, job_id: str) -> Job:
    jid = parse_uuid(job_id)
    job = db.get(Job, jid) if jid else None
    if job is None or job.user_id != ctx.user.id:
        raise HTTPException(404, "Job not found.")
    return job


@router.get("/jobs", response_model=list[JobOut])
def list_jobs(ctx: AuthContext = Depends(writer), db: Session = Depends(get_db)):
    rows = db.scalars(select(Job).where(Job.user_id == ctx.user.id)
                      .order_by(Job.created_at.desc()).limit(20)).all()
    return [_job_out(j) for j in rows]


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(job_id: str, ctx: AuthContext = Depends(writer), db: Session = Depends(get_db)):
    return _job_out(_owned_job(db, ctx, job_id))


@router.get("/jobs/{job_id}/result.csv")
def job_result(job_id: str, request: Request, ctx: AuthContext = Depends(writer),
               db: Session = Depends(get_db)):
    job = _owned_job(db, ctx, job_id)
    if job.status != "completed" or job.result_csv is None:
        raise HTTPException(409, "Results are not ready.")
    audit.record(db, "data_export", actor_id=ctx.user.id, resource_type="job",
                 resource_id=job.id, request=request, details={"kind": "bulk_result"})
    return Response(job.result_csv, media_type="text/csv", headers={
        "Content-Disposition": f'attachment; filename="predictions-{job.id}.csv"'})
