# Project-Jarvi

A push-to-talk regulatory reporting expert assistant. You hold a button,
ask a question about bank regulatory reporting (Basel III/IV, CCAR/DFAST
stress testing, financial statement analysis, etc.), and it answers using
a knowledge base built from documents you provide -- with citations back
to the source.

Voice in/out runs entirely in the browser (Web Speech API), retrieval and
embeddings run locally (no data leaves your machine except the question +
retrieved context, which go to the Claude API to generate the answer).

## Setup

1. **Install dependencies** (Python 3.10+):
   ```
   cd backend
   python -m venv venv
   source venv/bin/activate   # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Add your API key**:
   ```
   cp .env.example .env
   ```
   Edit `.env` and set `ANTHROPIC_API_KEY` to your key.

3. **Add source documents**. Drop PDFs, `.txt`, or `.md` files into
   `data/sources/` -- e.g. Basel III/IV framework text, CCAR/DFAST
   instructions, FR Y-9C/Y-14 forms, published financial statements. A
   small illustrative sample (`sample_ccar_overview.md`) is included so
   you can test the pipeline immediately; replace/supplement it with real
   source documents before relying on answers.

4. **Ingest the documents** into the local vector store:
   ```
   python scripts/ingest.py
   ```
   Re-run this any time you add or update documents in `data/sources/`.

5. **Run the server**:
   ```
   cd backend
   uvicorn main:app --reload
   ```

6. **Open the app**: go to `http://localhost:8000` in Chrome or Edge
   (Web Speech API support varies by browser). Hold the button, ask your
   question, release, and it'll answer out loud with sources cited.

## How it works

- `scripts/ingest.py` -- chunks documents in `data/sources/`, embeds them
  locally with `sentence-transformers`, stores them in a local Chroma
  vector database (`data/chroma/`).
- `backend/main.py` -- FastAPI server. On each question, retrieves the
  most relevant chunks from Chroma and asks Claude to answer using them,
  citing sources. Also serves the frontend.
- `frontend/index.html` -- single-page push-to-talk UI using the
  browser's built-in speech recognition (input) and speech synthesis
  (output). No native app, works on Mac and PC via any supported browser.

## Notes / current scope

- No always-on listening -- the mic is only active while you hold the
  button, by design (see project discussion on consent/compliance
  concerns with ambient listening).
- Only intended for public regulatory text and public financial
  statements -- no proprietary/internal bank data.
- This is an MVP scaffold: single-user, local-first, no auth. Not yet
  built for phone or smart-speaker clients.
