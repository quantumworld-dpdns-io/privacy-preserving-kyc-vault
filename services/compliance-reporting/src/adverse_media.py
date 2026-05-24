"""
Adverse media screening module.

Searches and screens against adverse media sources including
news articles, regulatory actions, legal proceedings, and
other publicly available information sources.
"""

import hashlib
import json
import logging
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)


class AdverseMediaCategory(str, Enum):
    FINANCIAL_CRIME = "financial_crime"
    FRAUD = "fraud"
    CORRUPTION = "corruption"
    BRIBERY = "bribery"
    MONEY_LAUNDERING = "money_laundering"
    TERRORISM_FINANCING = "terrorism_financing"
    SANCTIONS_VIOLATION = "sanctions_violation"
    ORGANIZED_CRIME = "organized_crime"
    DRUG_TRAFFICKING = "drug_trafficking"
    HUMAN_TRAFFICKING = "human_trafficking"
    CYBER_CRIME = "cyber_crime"
    ENVIRONMENTAL_CRIME = "environmental_crime"
    TAX_EVASION = "tax_evasion"
    INSIDER_TRADING = "insider_trading"
    REGULATORY_VIOLATION = "regulatory_violation"
    LITIGATION = "litigation"
    BANKRUPTCY = "bankruptcy"
    REPUTATIONAL_RISK = "reputational_risk"


class SourceReliability(str, Enum):
    OFFICIAL_GOVERNMENT = "official_government"
    REGULATORY_BODY = "regulatory_body"
    COURT_RECORD = "court_record"
    MAJOR_NEWS_OUTLET = "major_news_outlet"
    INDUSTRY_PUBLICATION = "industry_publication"
    LOCAL_NEWS = "local_news"
    SOCIAL_MEDIA = "social_media"
    UNVERIFIED = "unverified"


class SentimentType(str, Enum):
    NEGATIVE = "negative"
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    MIXED = "mixed"


@dataclass
class AdverseMediaEntry:
    entry_id: str
    title: str
    content: str
    source_url: str
    source_name: str
    published_date: str
    categories: list[AdverseMediaCategory] = field(default_factory=list)
    entities_mentioned: list[str] = field(default_factory=list)
    reliability: SourceReliability = SourceReliability.MAJOR_NEWS_OUTLET
    sentiment: SentimentType = SentimentType.NEGATIVE
    summary: Optional[str] = None
    jurisdiction: Optional[str] = None


@dataclass
class AdverseMediaMatch:
    entry: AdverseMediaEntry
    score: float
    matched_entities: list[str]
    matched_categories: list[AdverseMediaCategory]
    relevance_factors: list[str] = field(default_factory=list)


@dataclass
class AdverseMediaResult:
    entity_name: str
    entity_id: str
    passed: bool
    matches: list[AdverseMediaMatch]
    total_articles_found: int
    overall_score: float
    threshold: float
    scanned_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def has_category(self, category: AdverseMediaCategory) -> bool:
        return any(category in m.matched_categories for m in self.matches)


_CATEGORY_WEIGHTS: dict[AdverseMediaCategory, float] = {
    AdverseMediaCategory.TERRORISM_FINANCING: 1.0,
    AdverseMediaCategory.MONEY_LAUNDERING: 0.95,
    AdverseMediaCategory.SANCTIONS_VIOLATION: 0.95,
    AdverseMediaCategory.HUMAN_TRAFFICKING: 0.95,
    AdverseMediaCategory.DRUG_TRAFFICKING: 0.9,
    AdverseMediaCategory.ORGANIZED_CRIME: 0.9,
    AdverseMediaCategory.CORRUPTION: 0.85,
    AdverseMediaCategory.BRIBERY: 0.85,
    AdverseMediaCategory.FRAUD: 0.8,
    AdverseMediaCategory.FINANCIAL_CRIME: 0.8,
    AdverseMediaCategory.CYBER_CRIME: 0.75,
    AdverseMediaCategory.INSIDER_TRADING: 0.75,
    AdverseMediaCategory.TAX_EVASION: 0.7,
    AdverseMediaCategory.REGULATORY_VIOLATION: 0.6,
    AdverseMediaCategory.LITIGATION: 0.5,
    AdverseMediaCategory.BANKRUPTCY: 0.4,
    AdverseMediaCategory.ENVIRONMENTAL_CRIME: 0.4,
    AdverseMediaCategory.REPUTATIONAL_RISK: 0.3,
}

_RELIABILITY_WEIGHTS: dict[SourceReliability, float] = {
    SourceReliability.OFFICIAL_GOVERNMENT: 1.0,
    SourceReliability.REGULATORY_BODY: 1.0,
    SourceReliability.COURT_RECORD: 1.0,
    SourceReliability.MAJOR_NEWS_OUTLET: 0.8,
    SourceReliability.INDUSTRY_PUBLICATION: 0.6,
    SourceReliability.LOCAL_NEWS: 0.4,
    SourceReliability.SOCIAL_MEDIA: 0.2,
    SourceReliability.UNVERIFIED: 0.1,
}


class AdverseMediaChecker:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or ":memory:"
        self.conn = sqlite3.connect(self.db_path)
        self._init_db()
        self.threshold: float = 0.6

    def _init_db(self) -> None:
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS adverse_media_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_id TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                source_url TEXT NOT NULL,
                source_name TEXT NOT NULL,
                published_date TEXT NOT NULL,
                categories TEXT NOT NULL,
                entities_mentioned TEXT,
                reliability TEXT DEFAULT 'major_news_outlet',
                sentiment TEXT DEFAULT 'negative',
                summary TEXT,
                jurisdiction TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_adverse_entities ON adverse_media_entries(entities_mentioned)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_adverse_categories ON adverse_media_entries(categories)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_adverse_date ON adverse_media_entries(published_date)")
        self.conn.commit()

    def add_entry(self, entry: AdverseMediaEntry) -> None:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO adverse_media_entries
                (entry_id, title, content, source_url, source_name,
                 published_date, categories, entities_mentioned,
                 reliability, sentiment, summary, jurisdiction)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.entry_id,
                entry.title,
                entry.content,
                entry.source_url,
                entry.source_name,
                entry.published_date,
                json.dumps([c.value for c in entry.categories]),
                json.dumps(entry.entities_mentioned),
                entry.reliability.value,
                entry.sentiment.value,
                entry.summary,
                entry.jurisdiction,
            ),
        )
        self.conn.commit()

    def search(
        self,
        name: str,
        categories: Optional[list[AdverseMediaCategory]] = None,
        threshold: Optional[float] = None,
        max_age_days: Optional[int] = None,
        min_reliability: Optional[SourceReliability] = None,
    ) -> AdverseMediaResult:
        effective_threshold = threshold if threshold is not None else self.threshold
        cursor = self.conn.cursor()

        query = "SELECT * FROM adverse_media_entries WHERE 1=1"
        params: list[Any] = []

        if categories:
            category_conditions = " OR ".join(
                "categories LIKE ?" for _ in categories
            )
            query += f" AND ({category_conditions})"
            for cat in categories:
                params.append(f"%{cat.value}%")

        if max_age_days:
            query += " AND published_date >= date('now', '-' || ? || ' days')"
            params.append(str(max_age_days))

        if min_reliability:
            reliability_order = list(SourceReliability)
            min_idx = reliability_order.index(min_reliability)
            allowed = [r.value for r in reliability_order[: min_idx + 1]]
            placeholders = ",".join("?" for _ in allowed)
            query += f" AND reliability IN ({placeholders})"
            params.extend(allowed)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]

        matches: list[AdverseMediaMatch] = []
        name_lower = name.lower()
        name_terms = set(re.sub(r"[^\w\s]", "", name_lower).split())

        for row in rows:
            row_dict = dict(zip(columns, row))
            entry = AdverseMediaEntry(
                entry_id=row_dict["entry_id"],
                title=row_dict["title"],
                content=row_dict["content"],
                source_url=row_dict["source_url"],
                source_name=row_dict["source_name"],
                published_date=row_dict["published_date"],
                categories=[AdverseMediaCategory(c) for c in json.loads(row_dict["categories"])],
                entities_mentioned=json.loads(row_dict["entities_mentioned"]) if row_dict["entities_mentioned"] else [],
                reliability=SourceReliability(row_dict["reliability"]),
                sentiment=SentimentType(row_dict["sentiment"]),
                summary=row_dict.get("summary"),
                jurisdiction=row_dict.get("jurisdiction"),
            )

            if categories and not any(c in entry.categories for c in categories):
                continue

            matched_entities = [
                entity for entity in entry.entities_mentioned
                if SequenceMatcher(None, name_lower, entity.lower()).ratio() >= 0.8
            ]

            text = f"{entry.title} {entry.content}".lower()
            text_terms = set(re.sub(r"[^\w\s]", "", text).split())
            common_terms = name_terms & text_terms

            if not matched_entities and not common_terms:
                name_in_text = name_lower in text
                if not name_in_text:
                    fuzzy_score = SequenceMatcher(
                        None, name_lower, text[:len(name_lower) + 50]
                    ).ratio()
                    if fuzzy_score < 0.6:
                        continue

            name_score = max(
                (SequenceMatcher(None, name_lower, e.lower()).ratio() for e in entry.entities_mentioned),
                default=0.0,
            )

            if name_lower in entry.title.lower() or name_lower in entry.content.lower()[:500]:
                name_score = max(name_score, 0.9)

            text_coverage = len(common_terms) / max(len(name_terms), 1) if name_terms else 0
            category_weight = max(
                (_CATEGORY_WEIGHTS.get(c, 0.3) for c in entry.categories),
                default=0.3,
            )
            reliability_weight = _RELIABILITY_WEIGHTS.get(entry.reliability, 0.3)

            if entry.sentiment == SentimentType.POSITIVE:
                sentiment_modifier = -0.2
            elif entry.sentiment == SentimentType.NEGATIVE:
                sentiment_modifier = 0.1
            else:
                sentiment_modifier = 0.0

            combined_score = (
                name_score * 0.4
                + text_coverage * 0.15
                + category_weight * 0.25
                + reliability_weight * 0.2
                + sentiment_modifier
            )
            combined_score = max(0.0, min(1.0, combined_score))

            if combined_score < effective_threshold:
                continue

            relevance_factors: list[str] = []
            if name_score >= 0.9:
                relevance_factors.append("direct_name_match")
            if text_coverage >= 0.5:
                relevance_factors.append("high_text_coverage")
            if category_weight >= 0.8:
                relevance_factors.append("high_severity_category")
            if reliability_weight >= 0.8:
                relevance_factors.append("high_reliability_source")
            if entry.sentiment == SentimentType.NEGATIVE:
                relevance_factors.append("negative_sentiment")

            matches.append(
                AdverseMediaMatch(
                    entry=entry,
                    score=round(combined_score, 4),
                    matched_entities=matched_entities,
                    matched_categories=entry.categories,
                    relevance_factors=relevance_factors,
                )
            )

        matches.sort(key=lambda m: m.score, reverse=True)
        overall_score = matches[0].score if matches else 0.0

        return AdverseMediaResult(
            entity_name=name,
            entity_id=hashlib.sha256(name.encode()).hexdigest()[:16],
            passed=overall_score < effective_threshold,
            matches=matches,
            total_articles_found=len(matches),
            overall_score=round(overall_score, 4),
            threshold=effective_threshold,
        )

    def get_statistics(self) -> dict[str, Any]:
        cursor = self.conn.cursor()
        total = cursor.execute("SELECT COUNT(*) FROM adverse_media_entries").fetchone()[0]
        by_category: dict[str, int] = {}
        for cat in AdverseMediaCategory:
            cursor.execute("SELECT COUNT(*) FROM adverse_media_entries WHERE categories LIKE ?", (f"%{cat.value}%",))
            count = cursor.fetchone()[0]
            if count > 0:
                by_category[cat.value] = count
        return {"total": total, "by_category": by_category}

    def close(self) -> None:
        self.conn.close()
