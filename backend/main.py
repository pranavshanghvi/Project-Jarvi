"""Push-to-talk regulatory reporting expert -- chat backend.

Retrieves grounding context from the local vector store (Basel/CCAR/DFAST/
financial-statement source docs you've ingested) and asks Claude to answer
using that context, citing the source document for each claim.
"""
import os
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import rag

load_dotenv()

CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5")
client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

app = FastAPI(title="Regulatory Reporting Expert")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """You are a banking regulatory reporting expert assistant, \
covering areas such as Basel III/IV capital requirements, CCAR/DFAST stress \
testing, and related regulatory filings and financial statement analysis.

You will be given retrieved excerpts from regulatory source documents \
relevant to the user's question. Answer using those excerpts:
- Cite the source document (and chunk) for any specific rule, threshold, or figure you state.
- If the retrieved excerpts don't cover the question, say so plainly rather than guessing.
- Distinguish clearly between what the text says and your own interpretation of it.
- Keep answers concise and conversational -- this is a spoken interface."""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class Citation(BaseModel):
    source: str
    chunk: int


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    hits = rag.retrieve(req.message, top_k=5)

    if hits:
        context_block = "\n\n".join(
            f"[{h['source']} #{h['chunk']}]\n{h['text']}" for h in hits
        )
        user_content = (
            f"Retrieved context:\n{context_block}\n\nQuestion: {req.message}"
        )
    else:
        user_content = (
            f"(No matching context found in the knowledge base.)\n\nQuestion: {req.message}"
        )

    messages = [{"role": m.role, "content": m.content} for m in req.history]
    messages.append({"role": "user", "content": user_content})

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=messages,
    )
    answer = "".join(block.text for block in response.content if block.type == "text")

    citations = [Citation(source=h["source"], chunk=h["chunk"]) for h in hits]
    return ChatResponse(answer=answer, citations=citations)


FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
