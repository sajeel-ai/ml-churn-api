import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.model.loader import BASE_DIR, MODEL_PATH, file_sha256, get_bundle
from app.models import ModelVersion


def sync_model_versions(db: Session) -> None:
    """Register the active model and archived artifacts (idempotent)."""
    bundle = get_bundle()
    known = {v.version: v for v in db.scalars(select(ModelVersion))}

    cur = known.get(bundle.version)
    if cur is None:
        db.add(ModelVersion(
            version=bundle.version, artifact_path=str(MODEL_PATH.relative_to(BASE_DIR)),
            artifact_sha256=bundle.artifact_sha256, model_metadata=bundle.metadata,
            status="active", activated_at=utcnow()))
    for v in known.values():
        want = "active" if v.version == bundle.version else "archived"
        if v.status != want:
            v.status = want

    archive = BASE_DIR / "models" / "archive"
    if archive.exists():
        for meta_file in sorted(archive.glob("metadata_v*.json")):
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            version = meta.get("model_version", "1.0.0")
            art = archive / f"churn_model_v{version}.joblib"
            if version not in known and version != bundle.version and art.exists():
                db.add(ModelVersion(
                    version=version, artifact_path=str(art.relative_to(BASE_DIR)),
                    artifact_sha256=file_sha256(art), model_metadata=meta, status="archived"))
    db.commit()
