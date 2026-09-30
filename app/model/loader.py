from pathlib import Path
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

    with open(METADATA_PATH, "r") as file:
        return json.load(file)