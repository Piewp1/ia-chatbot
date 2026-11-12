"""FastAPI backend connected to a local Ollama instance.

Week 2 deliverable: expose the local LLM served by Ollama (Docker) through
an HTTP API. Configuration comes from environment variables so the service
can run unchanged against another host or model.
"""

import os
import time

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:latest")
REQUEST_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "180"))
DEFAULT_SYSTEM = os.getenv(
    "DEFAULT_SYSTEM_PROMPT",
    "Eres un asistente util. Responde en espanol, de forma breve y clara.",
)

app = FastAPI(
    title="IA Local API",
    description="Backend FastAPI conectado al modelo LLM servido por Ollama.",
    version="1.0.0",
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Pregunta del usuario.")
    model: str | None = Field(None, description="Override del modelo por defecto.")
    system: str | None = Field(DEFAULT_SYSTEM, description="Prompt de sistema.")
    temperature: float = Field(0.7, ge=0, le=2)
    history: list["Turn"] = Field(default_factory=list, description="Turnos previos de la conversacion.")


class Turn(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


ChatRequest.model_rebuild()


class ChatResponse(BaseModel):
    model: str
    reply: str
    elapsed_ms: int
    total_duration_ms: int | None = None
    eval_count: int | None = None


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=OLLAMA_URL, timeout=REQUEST_TIMEOUT)


@app.get("/", tags=["info"])
async def root() -> dict:
    return {
        "service": "IA Local API",
        "version": app.version,
        "ollama_url": OLLAMA_URL,
        "default_model": DEFAULT_MODEL,
        "docs": "/docs",
    }


@app.get("/health", tags=["info"])
async def health():
    """Report service health and the models available in Ollama."""
    try:
        async with _client() as client:
            resp = await client.get("/api/tags", timeout=5)
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "ollama": "unreachable", "detail": str(exc)},
        )
    return {"status": "ok", "ollama": "up", "models": models, "default_model": DEFAULT_MODEL}


@app.get("/models", tags=["ollama"])
async def list_models() -> dict:
    async with _client() as client:
        try:
            resp = await client.get("/api/tags")
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Ollama error: {exc}") from exc
    return resp.json()


@app.post("/chat", response_model=ChatResponse, tags=["chat"])
async def chat(payload: ChatRequest) -> ChatResponse:
    """Send a prompt to the model and return its answer."""
    model = payload.model or DEFAULT_MODEL
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": payload.system or DEFAULT_SYSTEM},
            *[t.model_dump() for t in payload.history[-20:]],
            {"role": "user", "content": payload.message},
        ],
        "stream": False,
        "options": {"temperature": payload.temperature},
    }

    started = time.perf_counter()
    async with _client() as client:
        try:
            resp = await client.post("/api/chat", json=body)
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:500]
            raise HTTPException(status_code=502, detail=f"Ollama rejected request: {detail}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=503, detail=f"Ollama unreachable: {exc}") from exc

    data = resp.json()
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    total_ns = data.get("total_duration")

    return ChatResponse(
        model=data.get("model", model),
        reply=data.get("message", {}).get("content", ""),
        elapsed_ms=elapsed_ms,
        total_duration_ms=round(total_ns / 1_000_000) if total_ns else None,
        eval_count=data.get("eval_count"),
    )
