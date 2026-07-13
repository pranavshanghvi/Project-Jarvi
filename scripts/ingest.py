#!/usr/bin/env python3
"""Ingest every file in data/sources/ into the local vector store.

Usage:
    python scripts/ingest.py

Drop PDFs, .txt, or .md files of regulatory reporting instructions,
financial statements, etc. into data/sources/ before running this.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from pypdf import PdfReader

import rag

SOURCES_DIR = Path(__file__).resolve().parent.parent / "data" / "sources"


def read_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def main():
    if not SOURCES_DIR.exists():
        print(f"No sources directory at {SOURCES_DIR}")
        return

    files = [
        p for p in SOURCES_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in (".pdf", ".txt", ".md")
    ]
    if not files:
        print(f"No documents found in {SOURCES_DIR}. Add PDFs/.txt/.md files and re-run.")
        return

    total_chunks = 0
    for path in files:
        print(f"Ingesting {path.name}...")
        text = read_pdf(path) if path.suffix.lower() == ".pdf" else read_text(path)
        n = rag.add_document(path.name, text)
        print(f"  -> {n} chunks")
        total_chunks += n

    print(f"Done. {len(files)} document(s), {total_chunks} chunks total.")


if __name__ == "__main__":
    main()
