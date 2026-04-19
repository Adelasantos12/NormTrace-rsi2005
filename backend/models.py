from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
import enum

Base = declarative_base()


class AnalysisStatus(str, enum.Enum):
    corpus_pending = "corpus_pending"
    corpus_ready = "corpus_ready"
    analyzing = "analyzing"
    complete = "complete"
    error = "error"


class Country(Base):
    __tablename__ = "countries"

    id = Column(Integer, primary_key=True)
    iso3 = Column(String(3), unique=True, nullable=False, index=True)
    name_en = Column(String(100), nullable=False)
    name_es = Column(String(100))
    name_fr = Column(String(100))
    legal_system = Column(String(50))   # civil_law, common_law, mixed
    is_federal = Column(String(5))       # yes, no
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    analyses = relationship("Analysis", back_populates="country")


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True)
    country_id = Column(Integer, ForeignKey("countries.id"), nullable=False)
    status = Column(String(30), default="corpus_pending", nullable=False)
    language = Column(String(5), default="en", nullable=False)  # en, es, fr
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))

    # Scores
    c1_score_scanner = Column(Integer)          # 1-5 scanner normativo
    c1_score_espar = Column(Integer)            # 1-5 e-SPAR auto-reporte
    espar_reference_date = Column(String(20))   # "2024-03" etc.

    # Full results stored as JSON blobs per block
    results = Column(JSON, default={})          # {block_a: {...}, block_b: {...}, ...}
    corpus_table = Column(JSON, default=[])     # validated corpus list
    reform_proposals = Column(JSON, default=[])

    # Metadata
    notes = Column(Text)

    country = relationship("Country", back_populates="analyses")
    sources = relationship("SourceDocument", back_populates="analysis",
                           cascade="all, delete-orphan")
    corpus_items = relationship("CorpusItem", back_populates="analysis",
                                cascade="all, delete-orphan")


class SourceDocument(Base):
    """Each law/regulation/NOM consulted in an analysis, with date traceability."""
    __tablename__ = "source_documents"

    id = Column(Integer, primary_key=True)
    analysis_id = Column(Integer, ForeignKey("analyses.id"), nullable=False)

    name = Column(String(300), nullable=False)
    instrument_type = Column(String(50))  # law, regulation, NOM, decree, agreement
    sector = Column(String(100))          # health, migration, customs, transport...
    url = Column(Text)
    consulted_at = Column(DateTime(timezone=True), server_default=func.now())
    last_reform_date = Column(String(20))   # "2024-01-15" as string for display
    last_reform_label = Column(String(100)) # "DOF 15-01-2026" for display
    is_available = Column(String(10), default="yes")  # yes, no, partial

    analysis = relationship("Analysis", back_populates="sources")


class CorpusItem(Base):
    """Each item in the corpus discovery table (Step 0-C)."""
    __tablename__ = "corpus_items"

    id = Column(Integer, primary_key=True)
    analysis_id = Column(Integer, ForeignKey("analyses.id"), nullable=False)

    name = Column(String(300), nullable=False)
    instrument_type = Column(String(50))
    sector = Column(String(100))
    url = Column(Text)
    last_reform_date = Column(String(20))
    last_reform_label = Column(String(100))

    classification = Column(String(20), default="pending")  # include, review, discard
    classification_reason = Column(Text)
    ihr_articles = Column(String(200))  # e.g. "4, 6, 19, 20"
    user_confirmed = Column(String(5), default="no")  # yes, no
    user_note = Column(Text)

    analysis = relationship("Analysis", back_populates="corpus_items")
