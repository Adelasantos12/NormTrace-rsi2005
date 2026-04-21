from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime
import anthropic
import json
import os
import traceback

from database import get_db, engine
from models import Base, Country, Analysis, SourceDocument, CorpusItem
from schemas import (
    CountryCreate, CountryOut, AnalysisOut,
    CorpusItemOut, CorpusItemUpdate, CorpusItemCreate,
    AnalysisLanguageUpdate, AnalysisNotesUpdate
)
from skill_prompt import (
    get_system_prompt, get_corpus_discovery_prompt,
    BLOCK_ANALYSIS_PROMPTS
)

def seed_mexico():
    from database import SessionLocal
    from models import Country
    db = SessionLocal()
    try:
        if not db.query(Country).filter(Country.iso3 == "MEX").first():
            mexico = Country(
                iso3="MEX",
                name_en="Mexico",
                name_es="México",
                name_fr="Mexique",
                legal_system="civil_law",
                is_federal="yes"
            )
            db.add(mexico)
            db.commit()
    finally:
        db.close()

app = FastAPI(title="IHR Normative Observatory", version="1.0.0")

frontend_origins = [
    origin.strip()
    for origin in (
        f"{os.getenv('FRONTEND_URL', '')},{os.getenv('FRONTEND_URLS', '')}"
    ).split(",")
    if origin.strip()
]
if not frontend_origins:
    frontend_origins = ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    # Also allow Vercel preview URLs without requiring redeploys/env edits.
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")


def get_claude_client():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY is not configured on the backend."
        )
    return anthropic.Anthropic(api_key=api_key)


@app.on_event("startup")
def bootstrap_db():
    """Initialize DB tables/seed without crashing container healthchecks."""
    try:
        Base.metadata.create_all(bind=engine)
        seed_mexico()
    except Exception as e:
        # Keep app process alive so /health can respond; API routes will fail until DB is reachable.
        print(f"[startup] DB bootstrap skipped: {e}")


# ── Countries ──────────────────────────────────────────────────────────────

@app.get("/countries", response_model=list[CountryOut])
def list_countries(db: Session = Depends(get_db)):
    return db.query(Country).order_by(Country.name_en).all()


@app.post("/countries", response_model=CountryOut)
def create_country(payload: CountryCreate, db: Session = Depends(get_db)):
    existing = db.query(Country).filter(Country.iso3 == payload.iso3).first()
    if existing:
        return existing
    country = Country(**payload.model_dump())
    db.add(country)
    db.commit()
    db.refresh(country)
    return country


# ── Analyses ───────────────────────────────────────────────────────────────

@app.get("/countries/{iso3}/analyses", response_model=list[AnalysisOut])
def list_analyses(iso3: str, db: Session = Depends(get_db)):
    country = db.query(Country).filter(Country.iso3 == iso3).first()
    if not country:
        raise HTTPException(404, "Country not found")
    return (
        db.query(Analysis)
        .filter(Analysis.country_id == country.id)
        .order_by(Analysis.created_at.desc())
        .all()
    )


@app.post("/countries/{iso3}/analyses", response_model=AnalysisOut)
def create_analysis(iso3: str, lang: str = "en", db: Session = Depends(get_db)):
    country = db.query(Country).filter(Country.iso3 == iso3).first()
    if not country:
        raise HTTPException(404, "Country not found")
    analysis = Analysis(country_id=country.id, status="corpus_pending", language=lang)
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return analysis


@app.get("/analyses/{aid}", response_model=AnalysisOut)
def get_analysis(aid: int, db: Session = Depends(get_db)):
    a = db.query(Analysis).filter(Analysis.id == aid).first()
    if not a:
        raise HTTPException(404, "Not found")
    return a


@app.patch("/analyses/{aid}/language")
def update_language(aid: int, payload: AnalysisLanguageUpdate,
                    db: Session = Depends(get_db)):
    a = db.query(Analysis).filter(Analysis.id == aid).first()
    if not a:
        raise HTTPException(404, "Not found")
    if payload.language not in ("en", "es", "fr"):
        raise HTTPException(400, "Language must be en, es, or fr")
    a.language = payload.language
    db.commit()
    return {"language": a.language}


@app.patch("/analyses/{aid}/notes")
def update_notes(aid: int, payload: AnalysisNotesUpdate,
                 db: Session = Depends(get_db)):
    a = db.query(Analysis).filter(Analysis.id == aid).first()
    if not a:
        raise HTTPException(404, "Not found")
    a.notes = payload.notes
    db.commit()
    return {"ok": True}


# ── Corpus discovery ───────────────────────────────────────────────────────

@app.post("/analyses/{aid}/discover-corpus")
async def discover_corpus(aid: int, db: Session = Depends(get_db)):
    a = db.query(Analysis).filter(Analysis.id == aid).first()
    if not a:
        raise HTTPException(404, "Analysis not found")

    country = a.country
    lang_hints = {"en": "English", "es": "Spanish", "fr": "French"}

    discovery_prompt = get_corpus_discovery_prompt(
        country_name=country.name_en,
        iso3=country.iso3,
        legal_system=country.legal_system or "civil law",
        is_federal=country.is_federal or "no",
        languages=lang_hints.get(a.language, "English"),
    )

    claude = get_claude_client()

    async def stream():
        full_text = ""
        try:
            with claude.messages.stream(
                model=MODEL,
                max_tokens=4096,
                system=get_system_prompt(a.language),
                messages=[{"role": "user", "content": discovery_prompt}],
            ) as s:
                for text in s.text_stream:
                    full_text += text
                    yield f"data: {json.dumps({'chunk': text})}\n\n"

            start = full_text.find("{")
            end = full_text.rfind("}") + 1
            parsed = json.loads(full_text[start:end])

            db.query(CorpusItem).filter(CorpusItem.analysis_id == aid).delete()

            for cls in ("include", "review", "discard", "lagunas"):
                for item in parsed.get(cls, []):
                    effective_cls = "review" if cls == "lagunas" else cls
                    ci = CorpusItem(
                        analysis_id=aid,
                        name=item.get("name", ""),
                        instrument_type=item.get("instrument_type"),
                        sector=item.get("sector"),
                        url=item.get("url"),
                        last_reform_date=item.get("last_reform_date"),
                        last_reform_label=item.get("last_reform_label"),
                        classification=effective_cls,
                        classification_reason=item.get("classification_reason"),
                        ihr_articles=item.get("ihr_articles"),
                        user_confirmed="no",
                    )
                    db.add(ci)

            a.status = "corpus_ready"
            db.commit()
            yield f"data: {json.dumps({'status': 'corpus_ready', 'done': True})}\n\n"

        except Exception as e:
            a.status = "error"
            db.commit()
            print(f"[discover_corpus] model={MODEL} error={e}")
            traceback.print_exc()
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ── Corpus management ──────────────────────────────────────────────────────

@app.get("/analyses/{aid}/corpus", response_model=list[CorpusItemOut])
def get_corpus(aid: int, db: Session = Depends(get_db)):
    return db.query(CorpusItem).filter(CorpusItem.analysis_id == aid).all()


@app.patch("/corpus-items/{item_id}", response_model=CorpusItemOut)
def update_corpus_item(item_id: int, payload: CorpusItemUpdate,
                       db: Session = Depends(get_db)):
    item = db.query(CorpusItem).filter(CorpusItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@app.post("/analyses/{aid}/corpus", response_model=CorpusItemOut)
def add_corpus_item(aid: int, payload: CorpusItemCreate,
                    db: Session = Depends(get_db)):
    item = CorpusItem(analysis_id=aid, **payload.model_dump(), user_confirmed="yes")
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.post("/analyses/{aid}/confirm-corpus")
def confirm_corpus(aid: int, db: Session = Depends(get_db)):
    a = db.query(Analysis).filter(Analysis.id == aid).first()
    if not a:
        raise HTTPException(404, "Not found")
    a.status = "analyzing"
    db.commit()
    return {"status": a.status}


# ── Block analysis ─────────────────────────────────────────────────────────

@app.post("/analyses/{aid}/analyze/{block}")
async def analyze_block(aid: int, block: str, db: Session = Depends(get_db)):
    a = db.query(Analysis).filter(Analysis.id == aid).first()
    if not a:
        raise HTTPException(404, "Analysis not found")

    block = block.upper()
    if block not in BLOCK_ANALYSIS_PROMPTS:
        raise HTTPException(400, f"Block must be one of: {list(BLOCK_ANALYSIS_PROMPTS.keys())}")

    included = (
        db.query(CorpusItem)
        .filter(CorpusItem.analysis_id == aid, CorpusItem.classification == "include")
        .all()
    )
    corpus_json = json.dumps([
        {
            "name": i.name,
            "type": i.instrument_type,
            "sector": i.sector,
            "url": i.url,
            "last_reform": i.last_reform_label or i.last_reform_date,
            "ihr_articles": i.ihr_articles,
        }
        for i in included
    ], indent=2)

    prompt = BLOCK_ANALYSIS_PROMPTS[block].format(
        country_name=a.country.name_en,
        corpus_json=corpus_json,
        blocks_summary=json.dumps(a.results or {}, indent=2),
    )

    claude = get_claude_client()

    async def stream():
        full_text = ""
        try:
            with claude.messages.stream(
                model=MODEL,
                max_tokens=4096,
                system=get_system_prompt(a.language),
                messages=[{"role": "user", "content": prompt}],
            ) as s:
                for text in s.text_stream:
                    full_text += text
                    yield f"data: {json.dumps({'chunk': text})}\n\n"

            start = full_text.find("{")
            end = full_text.rfind("}") + 1
            parsed = json.loads(full_text[start:end])

            results = dict(a.results or {})
            results[block] = parsed
            a.results = results

            if block == "SCORES":
                a.c1_score_scanner = round(parsed.get("total_weighted", 0))
                a.reform_proposals = parsed.get("reform_proposals", [])
                a.completed_at = datetime.utcnow()
                a.status = "complete"

                db.query(SourceDocument).filter(
                    SourceDocument.analysis_id == aid
                ).delete()
                for item in included:
                    db.add(SourceDocument(
                        analysis_id=aid,
                        name=item.name,
                        instrument_type=item.instrument_type,
                        sector=item.sector,
                        url=item.url,
                        last_reform_date=item.last_reform_date,
                        last_reform_label=item.last_reform_label,
                        is_available="yes",
                    ))

            db.commit()
            yield f"data: {json.dumps({'block': block, 'done': True})}\n\n"

        except Exception as e:
            print(f"[analyze_block:{block}] model={MODEL} error={e}")
            traceback.print_exc()
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ── e-SPAR ─────────────────────────────────────────────────────────────────

@app.patch("/analyses/{aid}/espar-score")
def update_espar_score(aid: int, score: int, reference_date: str,
                       db: Session = Depends(get_db)):
    a = db.query(Analysis).filter(Analysis.id == aid).first()
    if not a:
        raise HTTPException(404, "Not found")
    a.c1_score_espar = score
    a.espar_reference_date = reference_date
    db.commit()
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
