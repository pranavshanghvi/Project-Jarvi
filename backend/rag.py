"""Retrieval layer: local embeddings + Chroma vector store over regulatory source docs."""
import os
from pathlib import Path

import chromadb
from sentence_transformers import SentenceTransformer

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CHROMA_DB_PATH = os.environ.get("CHROMA_DB_PATH") or str(PROJECT_ROOT / "data" / "chroma")
COLLECTION_NAME = "regulatory_docs"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

_embedder = None
_client = None
_collection = None


def get_embedder() -> SentenceTransformer:
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer(EMBEDDING_MODEL)
    return _embedder


def get_collection():
    global _client, _collection
    if _collection is None:
        _client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
        _collection = _client.get_or_create_collection(COLLECTION_NAME)
    return _collection


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 150) -> list[str]:
    text = " ".join(text.split())
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return [c for c in chunks if c.strip()]


def add_document(source_name: str, text: str) -> int:
    collection = get_collection()
    embedder = get_embedder()
    chunks = chunk_text(text)
    if not chunks:
        return 0
    embeddings = embedder.encode(chunks).tolist()
    ids = [f"{source_name}::{i}" for i in range(len(chunks))]
    metadatas = [{"source": source_name, "chunk": i} for i in range(len(chunks))]
    collection.upsert(ids=ids, embeddings=embeddings, documents=chunks, metadatas=metadatas)
    return len(chunks)


def retrieve(query: str, top_k: int = 5) -> list[dict]:
    collection = get_collection()
    if collection.count() == 0:
        return []
    embedder = get_embedder()
    query_embedding = embedder.encode([query]).tolist()
    results = collection.query(query_embeddings=query_embedding, n_results=min(top_k, collection.count()))
    hits = []
    for doc, meta, distance in zip(
        results["documents"][0], results["metadatas"][0], results["distances"][0]
    ):
        hits.append({"text": doc, "source": meta["source"], "chunk": meta["chunk"], "distance": distance})
    return hits
