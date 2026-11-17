# Shared code for the three notebooks. It lives in your Drive folder next to them.
import os
import joblib
import numpy as np

FOLDER = "/content/drive/MyDrive/kq-scope-forest"
DATA = f"{FOLDER}/data"
MODELS = f"{FOLDER}/models"
CACHE = f"{FOLDER}/cache/embeddings.joblib"
for d in (DATA, MODELS, os.path.dirname(CACHE)):
    os.makedirs(d, exist_ok=True)

ENCODER_NAME = "BAAI/bge-small-en-v1.5"
_encoder = None


def _load_cache():
    return joblib.load(CACHE) if os.path.exists(CACHE) else {}


def embed(texts):
    """Turns texts into 384 numbers each. Texts embedded before come from the cache on Drive,
    so only new ones are sent to the model (and the model only loads if something is new)."""
    global _encoder
    texts = list(texts)
    cache = _load_cache()
    new = [t for t in dict.fromkeys(texts) if t not in cache]
    if new:
        if _encoder is None:
            from sentence_transformers import SentenceTransformer
            _encoder = SentenceTransformer(ENCODER_NAME)
        vectors = _encoder.encode(new, normalize_embeddings=True, show_progress_bar=len(new) > 50)
        cache.update(zip(new, vectors))
        joblib.dump(cache, CACHE)
    print(f"{len(set(texts)) - len(new)} from cache, {len(new)} newly embedded")
    return np.array([cache[t] for t in texts])
