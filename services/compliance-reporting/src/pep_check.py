"""
Politically Exposed Person (PEP) screening module.

Identifies and screens individuals against global PEP databases
including government officials, judicial officers, military leaders,
and their close associates.
"""

import csv
import hashlib
import json
import logging
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from enum import Enum
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


class PEPCategory(str, Enum):
    HEAD_OF_STATE = "head_of_state"
    HEAD_OF_GOVERNMENT = "head_of_government"
    GOVERNMENT_MINISTER = "government_minister"
    DEPUTY_MINISTER = "deputy_minister"
    SENIOR_CIVIL_SERVANT = "senior_civil_servant"
    JUDICIAL_OFFICIAL = "judicial_official"
    MILITARY_OFFICER = "military_officer"
    LEGISLATOR = "legislator"
    AMBASSADOR = "ambassador"
    CENTRAL_BANK_OFFICIAL = "central_bank_official"
    STATE_OWNED_ENTERPRISE_HEAD = "state_owned_enterprise_head"
    POLITICAL_PARTY_LEADER = "political_party_leader"
    SUPREME_COURT_JUDGE = "supreme_court_judge"
    CONSTITUTIONAL_COURT_JUDGE = "constitutional_court_judge"
    FAMILY_MEMBER = "family_member"
    CLOSE_ASSOCIATE = "close_associate"
    FORMER_PEP = "former_pep"
    INTERNATIONAL_ORGANIZATION_OFFICIAL = "international_organization_official"


class PEPRiskLevel(str, Enum):
    VERY_HIGH = "very_high"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class PEPEntry:
    entry_id: str
    full_name: str
    aliases: list[str] = field(default_factory=list)
    category: PEPCategory = PEPCategory.GOVERNMENT_MINISTER
    country: Optional[str] = None
    position: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_current: bool = True
    risk_level: PEPRiskLevel = PEPRiskLevel.MEDIUM
    date_of_birth: Optional[str] = None
    place_of_birth: Optional[str] = None
    source: str = ""
    notes: Optional[str] = None


@dataclass
class PEPMatch:
    entry: PEPEntry
    score: float
    matched_on: list[str]
    risk_factors: list[str] = field(default_factory=list)


@dataclass
class PEPResult:
    entity_name: str
    entity_id: str
    is_pep: bool
    matches: list[PEPMatch]
    risk_level: PEPRiskLevel
    overall_score: float
    threshold: float
    scanned_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


_RISK_WEIGHTS: dict[PEPCategory, float] = {
    PEPCategory.HEAD_OF_STATE: 1.0,
    PEPCategory.HEAD_OF_GOVERNMENT: 1.0,
    PEPCategory.GOVERNMENT_MINISTER: 0.9,
    PEPCategory.DEPUTY_MINISTER: 0.7,
    PEPCategory.SENIOR_CIVIL_SERVANT: 0.5,
    PEPCategory.JUDICIAL_OFFICIAL: 0.6,
    PEPCategory.MILITARY_OFFICER: 0.6,
    PEPCategory.LEGISLATOR: 0.6,
    PEPCategory.AMBASSADOR: 0.5,
    PEPCategory.CENTRAL_BANK_OFFICIAL: 0.7,
    PEPCategory.STATE_OWNED_ENTERPRISE_HEAD: 0.5,
    PEPCategory.POLITICAL_PARTY_LEADER: 0.7,
    PEPCategory.SUPREME_COURT_JUDGE: 0.8,
    PEPCategory.CONSTITUTIONAL_COURT_JUDGE: 0.8,
    PEPCategory.FAMILY_MEMBER: 0.3,
    PEPCategory.CLOSE_ASSOCIATE: 0.3,
    PEPCategory.FORMER_PEP: 0.4,
    PEPCategory.INTERNATIONAL_ORGANIZATION_OFFICIAL: 0.5,
}


def normalize_name(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[^\w\s]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    parts = name.split()
    parts.sort()
    return " ".join(parts)


def name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_name(a), normalize_name(b)).ratio()


class PEPTrieNode:
    __slots__ = ("children", "entries")

    def __init__(self) -> None:
        self.children: dict[str, "PEPTrieNode"] = {}
        self.entries: list[PEPEntry] = []


class PEPTrie:
    def __init__(self) -> None:
        self.root = PEPTrieNode()

    def insert(self, name: str, entry: PEPEntry) -> None:
        node = self.root
        for char in normalize_name(name):
            if char not in node.children:
                node.children[char] = PEPTrieNode()
            node = node.children[char]
        node.entries.append(entry)

    def search(self, name: str, threshold: float = 0.75) -> list[PEPEntry]:
        results: list[PEPEntry] = []
        seen: set[str] = set()
        normalized = normalize_name(name)

        node = self.root
        for char in normalized:
            if char in node.children:
                node = node.children[char]
            else:
                break
        else:
            for entry in node.entries:
                if entry.entry_id not in seen:
                    results.append(entry)
                    seen.add(entry.entry_id)

        cursor: list[tuple[PEPTrieNode, str]] = [(self.root, "")]
        while cursor:
            current_node, prefix = cursor.pop()
            if current_node.entries:
                for entry in current_node.entries:
                    if entry.entry_id not in seen:
                        score = name_similarity(name, entry.full_name)
                        if score >= threshold:
                            results.append(entry)
                            seen.add(entry.entry_id)
            for char, child in current_node.children.items():
                cursor.append((child, prefix + char))

        return results


class PEPChecker:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or ":memory:"
        self.conn = sqlite3.connect(self.db_path)
        self.trie = PEPTrie()
        self._init_db()
        self.threshold: float = 0.7

    def _init_db(self) -> None:
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pep_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_id TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                aliases TEXT,
                category TEXT NOT NULL,
                country TEXT,
                position TEXT,
                start_date TEXT,
                end_date TEXT,
                is_current INTEGER DEFAULT 1,
                risk_level TEXT DEFAULT 'medium',
                date_of_birth TEXT,
                place_of_birth TEXT,
                source TEXT DEFAULT '',
                notes TEXT
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pep_name ON pep_entries(full_name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_pep_category ON pep_entries(category)")
        self.conn.commit()

    def load_from_csv(self, csv_path: str) -> int:
        count = 0
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                entry = PEPEntry(
                    entry_id=row.get("id", row.get("entry_id", "")),
                    full_name=row.get("name", row.get("full_name", "")),
                    aliases=row.get("aliases", "").split(";") if row.get("aliases") else [],
                    category=PEPCategory(row.get("category", "government_minister")),
                    country=row.get("country"),
                    position=row.get("position"),
                    start_date=row.get("start_date", row.get("appointed_date")),
                    end_date=row.get("end_date"),
                    is_current=row.get("is_current", "true").lower() == "true",
                    risk_level=PEPRiskLevel(row.get("risk_level", "medium")),
                    date_of_birth=row.get("date_of_birth"),
                    place_of_birth=row.get("place_of_birth"),
                    source=row.get("source", ""),
                    notes=row.get("notes"),
                )
                self.add_entry(entry)
                count += 1
        self.conn.commit()
        logger.info("Loaded %d PEP entries from %s", count, csv_path)
        return count

    def add_entry(self, entry: PEPEntry) -> None:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT OR REPLACE INTO pep_entries
                (entry_id, full_name, aliases, category, country, position,
                 start_date, end_date, is_current, risk_level,
                 date_of_birth, place_of_birth, source, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.entry_id,
                entry.full_name,
                json.dumps(entry.aliases),
                entry.category.value,
                entry.country,
                entry.position,
                entry.start_date,
                entry.end_date,
                1 if entry.is_current else 0,
                entry.risk_level.value,
                entry.date_of_birth,
                entry.place_of_birth,
                entry.source,
                entry.notes,
            ),
        )
        self.conn.commit()
        self.trie.insert(entry.full_name, entry)
        for alias in entry.aliases:
            self.trie.insert(alias, entry)

    def search(
        self,
        name: str,
        country: Optional[str] = None,
        category: Optional[PEPCategory] = None,
        threshold: Optional[float] = None,
    ) -> PEPResult:
        effective_threshold = threshold if threshold is not None else self.threshold
        matches: list[PEPMatch] = []

        trie_results = self.trie.search(name, effective_threshold)
        seen_ids: set[str] = set()

        for entry in trie_results:
            if entry.entry_id in seen_ids:
                continue
            seen_ids.add(entry.entry_id)

            if country and entry.country and entry.country.lower() != country.lower():
                continue
            if category and entry.category != category:
                continue

            match_score = name_similarity(name, entry.full_name)
            for alias in entry.aliases:
                alias_score = name_similarity(name, alias)
                match_score = max(match_score, alias_score)

            if match_score < effective_threshold:
                continue

            matched_on = ["name"]
            if match_score >= 0.95:
                matched_on.append("exact_match")
            elif match_score >= 0.85:
                matched_on.append("high_similarity")

            risk_factors: list[str] = []
            if entry.is_current:
                risk_factors.append("currently_holds_position")
            if _RISK_WEIGHTS.get(entry.category, 0.5) >= 0.8:
                risk_factors.append("senior_pep_category")
            if entry.country:
                risk_factors.append(f"country:{entry.country}")

            matches.append(
                PEPMatch(
                    entry=entry,
                    score=round(match_score, 4),
                    matched_on=matched_on,
                    risk_factors=risk_factors,
                )
            )

        matches.sort(key=lambda m: m.score, reverse=True)

        if not matches:
            return PEPResult(
                entity_name=name,
                entity_id=hashlib.sha256(name.encode()).hexdigest()[:16],
                is_pep=False,
                matches=[],
                risk_level=PEPRiskLevel.LOW,
                overall_score=0.0,
                threshold=effective_threshold,
            )

        overall_score = max(m.score for m in matches)
        top_match = matches[0]
        base_risk_weight = _RISK_WEIGHTS.get(top_match.entry.category, 0.5)

        combined_score = overall_score * 0.6 + base_risk_weight * 0.4
        if top_match.entry.is_current:
            combined_score = min(1.0, combined_score + 0.1)

        risk_level: PEPRiskLevel
        if combined_score >= 0.9:
            risk_level = PEPRiskLevel.VERY_HIGH
        elif combined_score >= 0.8:
            risk_level = PEPRiskLevel.HIGH
        elif combined_score >= 0.6:
            risk_level = PEPRiskLevel.MEDIUM
        else:
            risk_level = PEPRiskLevel.LOW

        return PEPResult(
            entity_name=name,
            entity_id=hashlib.sha256(name.encode()).hexdigest()[:16],
            is_pep=combined_score >= effective_threshold,
            matches=matches,
            risk_level=risk_level,
            overall_score=round(combined_score, 4),
            threshold=effective_threshold,
        )

    def get_statistics(self) -> dict[str, Any]:
        cursor = self.conn.cursor()
        total = cursor.execute("SELECT COUNT(*) FROM pep_entries").fetchone()[0]
        by_category: dict[str, int] = {}
        for cat in PEPCategory:
            cursor.execute("SELECT COUNT(*) FROM pep_entries WHERE category = ?", (cat.value,))
            count = cursor.fetchone()[0]
            if count > 0:
                by_category[cat.value] = count
        by_country: dict[str, int] = {}
        cursor.execute("SELECT country, COUNT(*) FROM pep_entries WHERE country IS NOT NULL GROUP BY country")
        for row in cursor.fetchall():
            by_country[row[0]] = row[1]
        return {"total": total, "by_category": by_category, "by_country": by_country}

    def close(self) -> None:
        self.conn.close()
