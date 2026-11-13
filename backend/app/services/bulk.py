"""CSV parsing, validation and processing for bulk prediction."""
import csv
import io
import logging
import uuid

from pydantic import ValidationError

from app.db.base import utcnow
from app.models import Job, Prediction
from app.schemas.prediction import CustomerData
from app.services.records import FEATURES, csv_safe

logger = logging.getLogger(__name__)

ID_ALIASES = ("customer_identifier", "customerid", "customer_id", "id")
INT_FIELDS = {"SeniorCitizen", "tenure"}
FLOAT_FIELDS = {"MonthlyCharges", "TotalCharges"}
RESULT_COLUMNS = ["row_status", "error", "prediction", "predicted_label",
                  "churn_probability", "risk_level", "model_version"]


class CsvError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message, self.status = message, status


def parse(content: bytes, max_rows: int) -> dict:
    """Return headers, canonical column map, rows (list of dict), extras."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CsvError("File must be UTF-8 encoded CSV.")
    if not text.strip():
        raise CsvError("The file is empty.")
    reader = csv.reader(io.StringIO(text))
    try:
        header = [h.strip() for h in next(reader)]
    except StopIteration:
        raise CsvError("The file is empty.")

    canon = {f.lower(): f for f in FEATURES}
    colmap, extras, id_col = {}, [], None
    for idx, h in enumerate(header):
        key = h.lower()
        if key in canon and canon[key] not in colmap.values():
            colmap[idx] = canon[key]
        elif key in ID_ALIASES and id_col is None:
            id_col = idx
        else:
            extras.append(h)
    missing = [f for f in FEATURES if f not in colmap.values()]

    rows = []
    for raw in reader:
        if not any(cell.strip() for cell in raw):
            continue  # fully blank line
        if len(rows) >= max_rows:
            raise CsvError(f"Too many rows. The limit is {max_rows} rows per upload.")
        rows.append({"raw": raw, "line": reader.line_num})
    return {"header": header, "colmap": colmap, "id_col": id_col, "missing": missing,
            "extras": extras, "rows": rows}


def validate_rows(parsed: dict) -> list[dict]:
    """Validate every row. Returns [{line, reference, features|None, errors[]}]."""
    out = []
    for r in parsed["rows"]:
        raw, errors, feats = r["raw"], [], {}
        ref = None
        if parsed["id_col"] is not None and parsed["id_col"] < len(raw):
            ref = raw[parsed["id_col"]].strip()[:100] or None
        for idx, name in parsed["colmap"].items():
            val = raw[idx].strip() if idx < len(raw) else ""
            if val == "":
                if name == "TotalCharges":
                    feats[name] = None  # allowed only for tenure 0 (checked by schema)
                else:
                    errors.append(f"{name}: missing value")
                continue
            try:
                if name in INT_FIELDS:
                    f = float(val)
                    if f != int(f):
                        raise ValueError
                    feats[name] = int(f)
                elif name in FLOAT_FIELDS:
                    feats[name] = float(val)
                else:
                    feats[name] = val
            except ValueError:
                errors.append(f"{name}: '{val[:30]}' is not a valid number")
        if not errors:
            try:
                feats = CustomerData(**feats).model_dump()
            except ValidationError as e:
                for err in e.errors()[:3]:
                    loc = ".".join(str(x) for x in err["loc"]) or "row"
                    errors.append(f"{loc}: {err['msg'].removeprefix('Value error, ')}")
        out.append({"line": r["line"], "reference": ref or f"row {r['line']}",
                    "features": None if errors else feats, "errors": errors,
                    "raw": raw})
    return out


def run_job(job_id: uuid.UUID, session_factory, service) -> None:
    """Process a job. Runs in a background task with its own DB session."""
    db = session_factory()
    try:
        job = db.get(Job, job_id)
        if job is None:
            return
        job.status = "running"
        db.commit()

        parsed = parse(job.input_csv.encode("utf-8"), max_rows=10**9)
        rows = validate_rows(parsed)
        job.total_rows = len(rows)
        job.invalid_rows = sum(1 for r in rows if r["errors"])
        db.commit()

        valid = [r for r in rows if r["features"] is not None]
        results = service.predict_many([r["features"] for r in valid])
        by_line = {}
        for r, res in zip(valid, results):
            by_line[r["line"]] = res
            db.add(Prediction(
                user_id=job.user_id, job_id=job.id, reference=r["reference"], source="bulk",
                predicted_class=res["prediction"], churn_probability=res["probability"],
                threshold=service.threshold, risk_level=service.risk_for(res["probability"]),
                model_version=service.model_version, input_snapshot=r["features"]))

        header = parsed["header"] + RESULT_COLUMNS
        out_rows = []
        for r in rows:
            res = by_line.get(r["line"])
            raw = list(r["raw"]) + [""] * (len(parsed["header"]) - len(r["raw"]))
            raw = raw[:len(parsed["header"])]
            if res:
                tail = ["ok", "", res["prediction"],
                        "churn" if res["prediction"] else "no_churn",
                        f"{res['probability']:.4f}", service.risk_for(res["probability"]),
                        service.model_version]
            else:
                tail = ["invalid", "; ".join(r["errors"]), "", "", "", "", ""]
            out_rows.append([csv_safe(c) for c in raw] + tail)

        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(header)
        w.writerows(out_rows)
        job.result_csv = buf.getvalue()
        job.processed_rows = len(rows)
        job.status = "completed"
        job.input_csv = None
        job.finished_at = utcnow()
        db.commit()
    except Exception:
        logger.exception("Bulk job %s failed", job_id)
        db.rollback()
        job = db.get(Job, job_id)
        if job:
            job.status = "failed"
            job.error = "Processing failed. No predictions were saved for this job."
            job.input_csv = None
            job.finished_at = utcnow()
            db.query(Prediction).filter(Prediction.job_id == job_id).delete()
            db.commit()
    finally:
        db.close()
