from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import hashlib
import json

import joblib

from app.core.config import settings


BASE_DIR = Path(__file__).resolve().parents[2]

MODEL_PATH = BASE_DIR / settings.model_path
METADATA_PATH = BASE_DIR / settings.metadata_path


def load_model():

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model file not found: {MODEL_PATH}"
        )

    return joblib.load(MODEL_PATH)


def load_metadata():

    if not METADATA_PATH.exists():
        raise FileNotFoundError(
            f"Metadata file not found: {METADATA_PATH}"
        )

    with open(METADATA_PATH, "r", encoding="utf-8") as file:
        return json.load(file)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass(frozen=True)
class ModelBundle:
    model: object
    metadata: dict
    artifact_sha256: str

    @property
    def threshold(self) -> float:
        return float(self.metadata["threshold"])

    @property
    def version(self) -> str:
        return str(self.metadata["model_version"])

    @property
    def feature_names(self) -> list[str]:
        return list(self.metadata["features"])


def _validate_contract(model, metadata: dict) -> None:
    """Fail fast if metadata and the trained pipeline disagree."""
    expected = list(getattr(model, "feature_names_in_", []))
    declared = list(metadata.get("features", []))
    if expected != declared:
        raise ValueError(
            "metadata.json features do not match the trained model. "
            f"model={expected} metadata={declared}"
        )


@lru_cache(maxsize=1)
def get_bundle() -> ModelBundle:
    """Load and validate the model once per process."""
    model = load_model()
    metadata = load_metadata()
    _validate_contract(model, metadata)

    sha = file_sha256(MODEL_PATH)
    expected_sha = metadata.get("artifact_sha256")
    if expected_sha and expected_sha != sha:
        raise ValueError(
            "Model artifact checksum does not match metadata.json; "
            "the model file may have been replaced without updating metadata."
        )

    return ModelBundle(model=model, metadata=metadata, artifact_sha256=sha)
