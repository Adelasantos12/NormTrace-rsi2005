from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class CountryCreate(BaseModel):
    iso3: str
    name_en: str
    name_es: Optional[str] = None
    name_fr: Optional[str] = None
    legal_system: Optional[str] = None
    is_federal: Optional[str] = "no"


class CountryOut(BaseModel):
    id: int
    iso3: str
    name_en: str
    name_es: Optional[str]
    name_fr: Optional[str]
    legal_system: Optional[str]
    is_federal: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class CorpusItemOut(BaseModel):
    id: int
    name: str
    instrument_type: Optional[str]
    sector: Optional[str]
    url: Optional[str]
    last_reform_date: Optional[str]
    last_reform_label: Optional[str]
    classification: str
    classification_reason: Optional[str]
    ihr_articles: Optional[str]
    user_confirmed: str
    user_note: Optional[str]

    model_config = {"from_attributes": True}


class CorpusItemUpdate(BaseModel):
    classification: Optional[str] = None
    user_confirmed: Optional[str] = None
    user_note: Optional[str] = None
    last_reform_date: Optional[str] = None
    last_reform_label: Optional[str] = None


class CorpusItemCreate(BaseModel):
    name: str
    instrument_type: Optional[str] = None
    sector: Optional[str] = None
    url: Optional[str] = None
    last_reform_date: Optional[str] = None
    last_reform_label: Optional[str] = None
    classification: str = "include"
    classification_reason: Optional[str] = "Added manually by user"
    ihr_articles: Optional[str] = None
    user_note: Optional[str] = None


class SourceDocumentOut(BaseModel):
    id: int
    name: str
    instrument_type: Optional[str]
    sector: Optional[str]
    url: Optional[str]
    consulted_at: datetime
    last_reform_date: Optional[str]
    last_reform_label: Optional[str]
    is_available: str

    model_config = {"from_attributes": True}


class AnalysisOut(BaseModel):
    id: int
    country_id: int
    status: str
    language: str
    created_at: datetime
    completed_at: Optional[datetime]
    c1_score_scanner: Optional[int]
    c1_score_espar: Optional[int]
    espar_reference_date: Optional[str]
    results: Optional[Any]
    corpus_table: Optional[Any]
    reform_proposals: Optional[Any]
    notes: Optional[str]
    sources: list[SourceDocumentOut] = []
    corpus_items: list[CorpusItemOut] = []

    model_config = {"from_attributes": True}


class AnalysisLanguageUpdate(BaseModel):
    language: str  # "en", "es", "fr"


class AnalysisNotesUpdate(BaseModel):
    notes: str
