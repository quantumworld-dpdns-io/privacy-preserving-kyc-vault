"""
Sanctions list checking script.

Provides sanctions screening against multiple global sanctions lists
including OFAC, UN, EU, UK, and other regulatory bodies.
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


class SanctionList(str, Enum):
    OFAC_SDN = "ofac_sdn"
    OFAC_561_LIST = "ofac_561_list"
    OFAC_SSI = "ofac_ssi"
    OFAC_CAP = "ofac_cap"
    UN_CONSOLIDATED = "un_consolidated"
    EU_CONSOLIDATED = "eu_consolidated"
    UK_OFFICE_FINANCIAL_SANCTIONS = "uk_ofs"
    AU_DFAT = "au_dfat"
    CA_OSFI = "ca_osfi"
    JP_FSA = "jp_fsa"
    SG_MAS = "sg_mas"
    HK_MA = "hk_ma"
    INTERPOL = "interpol"


class MatchLevel(str, Enum):
    EXACT = "exact"
    HIGH_CONFIDENCE = "high_confidence"
    MEDIUM_CONFIDENCE = "medium_confidence"
    LOW_CONFIDENCE = "low_confidence"


@dataclass
class SanctionsEntry:
    list_name: SanctionList
    entry_id: str
    full_name: str
    aliases: list[str] = field(default_factory=list)
    name_script: str = "latin"
    date_of_birth: Optional[str] = None
    place_of_birth: Optional[str] = None
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    id_number: Optional[str] = None
    address: Optional[str] = None
    program: Optional[str] = None
    designation_date: Optional[str] = None
    remarks: Optional[str] = None
    listing_source: str = ""


@dataclass
class SanctionsMatch:
    entry: SanctionsEntry
    score: float
    match_level: MatchLevel
    matched_on: list[str]
    confidence_factors: dict[str, float] = field(default_factory=dict)


@dataclass
class SanctionsResult:
    entity_name: str
    entity_id: str
    passed: bool
    score: float
    threshold: float
    matches: list[SanctionsMatch]
    searched_lists: list[SanctionList]
    scanned_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def normalize_name(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[^\w\s]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    parts = name.split()
    parts.sort()
    return " ".join(parts)


def name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_name(a), normalize_name(b)).ratio()


def phonetic_key(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[^a-z\s]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    parts = name.split()
    if not parts:
        return ""

    key_parts: list[str] = []
    for part in parts:
        if not part:
            continue
        part = re.sub(r"[aeiouy]+", "", part)
        if part:
            key_parts.append(part[0].upper() + part[1:] if len(part) > 1 else part[0].upper())
        else:
            key_parts.append(part[0].upper() if part else "")

    return "".join(key_parts)


class SanctionsChecker:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or ":memory:"
        self.conn = sqlite3.connect(self.db_path)
        self._init_db()
        self.threshold: float = 0.75
        self.supported_lists: list[SanctionList] = list(SanctionList)

    def _init_db(self) -> None:
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sanctions_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                list_name TEXT NOT NULL,
                entry_id TEXT NOT NULL,
                full_name TEXT NOT NULL,
                aliases TEXT,
                name_script TEXT DEFAULT 'latin',
                date_of_birth TEXT,
                place_of_birth TEXT,
                nationality TEXT,
                passport_number TEXT,
                id_number TEXT,
                address TEXT,
                program TEXT,
                designation_date TEXT,
                remarks TEXT,
                listing_source TEXT,
                normalized_name TEXT GENERATED ALWAYS AS (LOWER(TRIM(full_name))) STORED
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sanctions_name ON sanctions_entries(normalized_name)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sanctions_list ON sanctions_entries(list_name)")
        self.conn.commit()

    def load_from_csv(self, csv_path: str, list_name: SanctionList) -> int:
        count = 0
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                self.add_entry(
                    SanctionsEntry(
                        list_name=list_name,
                        entry_id=row.get("id", row.get("entry_id", "")),
                        full_name=row.get("name", row.get("full_name", "")),
                        aliases=row.get("aliases", "").split(";") if row.get("aliases") else [],
                        name_script=row.get("name_script", "latin"),
                        date_of_birth=row.get("date_of_birth"),
                        place_of_birth=row.get("place_of_birth"),
                        nationality=row.get("nationality"),
                        passport_number=row.get("passport_number"),
                        id_number=row.get("id_number"),
                        address=row.get("address"),
                        program=row.get("program"),
                        designation_date=row.get("designation_date", row.get("listed_on")),
                        remarks=row.get("remarks"),
                        listing_source=row.get("source", ""),
                    )
                )
                count += 1
        self.conn.commit()
        logger.info("Loaded %d entries from %s into %s", count, csv_path, list_name.value)
        return count

    def add_entry(self, entry: SanctionsEntry) -> int:
        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT INTO sanctions_entries
                (list_name, entry_id, full_name, aliases, name_script,
                 date_of_birth, place_of_birth, nationality,
                 passport_number, id_number, address, program,
                 designation_date, remarks, listing_source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.list_name.value,
                entry.entry_id,
                entry.full_name,
                json.dumps(entry.aliases),
                entry.name_script,
                entry.date_of_birth,
                entry.place_of_birth,
                entry.nationality,
                entry.passport_number,
                entry.id_number,
                entry.address,
                entry.program,
                entry.designation_date,
                entry.remarks,
                entry.listing_source,
            ),
        )
        self.conn.commit()
        return cursor.lastrowid  # type: ignore[return-value]

    def search(
        self,
        name: str,
        lists: Optional[list[SanctionList]] = None,
        threshold: Optional[float] = None,
        date_of_birth: Optional[str] = None,
        nationality: Optional[str] = None,
        passport: Optional[str] = None,
    ) -> SanctionsResult:
        effective_threshold = threshold if threshold is not None else self.threshold
        search_lists = lists or self.supported_lists

        matches: list[SanctionsMatch] = []
        matched_entry_ids: set[str] = set()

        cursor = self.conn.cursor()

        normalized = normalize_name(name)
        name_parts = normalized.split()
        phonetic = phonetic_key(name)

        query = """
            SELECT e.*, e.rowid
            FROM sanctions_entries e
            WHERE list_name IN ({})
        """.format(",".join("?" for _ in search_lists))

        cursor.execute(query, [l.value for l in search_lists])
        rows = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]

        for row in rows:
            row_dict = dict(zip(columns, row))
            entry = SanctionsEntry(
                list_name=SanctionList(row_dict["list_name"]),
                entry_id=row_dict["entry_id"],
                full_name=row_dict["full_name"],
                aliases=json.loads(row_dict["aliases"]) if row_dict["aliases"] else [],
                name_script=row_dict.get("name_script", "latin"),
                date_of_birth=row_dict.get("date_of_birth"),
                place_of_birth=row_dict.get("place_of_birth"),
                nationality=row_dict.get("nationality"),
                passport_number=row_dict.get("passport_number"),
                id_number=row_dict.get("id_number"),
                address=row_dict.get("address"),
                program=row_dict.get("program"),
                designation_date=row_dict.get("designation_date"),
                remarks=row_dict.get("remarks"),
                listing_source=row_dict.get("listing_source", ""),
            )

            if entry.id in matched_entry_ids:
                continue

            scores: dict[str, float] = {}
            matched_on: list[str] = []

            name_score = name_similarity(name, entry.full_name)
            scores["name"] = name_score
            if name_score >= 0.95:
                matched_on.append("name_exact")
            elif name_score >= 0.85:
                matched_on.append("name_fuzzy")

            for alias in entry.aliases:
                alias_score = name_similarity(name, alias)
                if alias_score > scores.get("alias", 0):
                    scores["alias"] = alias_score
                if alias_score >= 0.85 and "alias" not in matched_on:
                    matched_on.append("alias")

            if phonetic and phonetic_key(entry.full_name) == phonetic:
                scores["phonetic"] = 0.9
                matched_on.append("phonetic")

            if date_of_birth and entry.date_of_birth:
                dob_score = 1.0 if date_of_birth == entry.date_of_birth else 0.0
                scores["date_of_birth"] = dob_score
                if dob_score >= 1.0:
                    matched_on.append("date_of_birth")

            if nationality and entry.nationality:
                nat_score = 1.0 if nationality.lower() == entry.nationality.lower() else 0.0
                scores["nationality"] = nat_score
                if nat_score >= 1.0:
                    matched_on.append("nationality")

            if passport and entry.passport_number:
                passport_score = 1.0 if passport == entry.passport_number else 0.0
                scores["passport"] = passport_score
                if passport_score >= 1.0:
                    matched_on.append("passport")

            if not matched_on:
                continue

            cat_weights = {"name": 0.5, "alias": 0.3, "phonetic": 0.1, "date_of_birth": 0.2, "nationality": 0.1, "passport": 0.3}
            weighted_total = sum(scores.get(k, 0) * cat_weights.get(k, 0.1) for k in scores)
            divisor = sum(cat_weights.get(k, 0.1) for k in scores if k in matched_on or scores.get(k, 0) > 0) or 1.0
            final_score = weighted_total / divisor

            if final_score >= effective_threshold:
                level: MatchLevel
                if final_score >= 0.95:
                    level = MatchLevel.EXACT
                elif final_score >= 0.85:
                    level = MatchLevel.HIGH_CONFIDENCE
                elif final_score >= 0.75:
                    level = MatchLevel.MEDIUM_CONFIDENCE
                else:
                    level = MatchLevel.LOW_CONFIDENCE

                matches.append(
                    SanctionsMatch(
                        entry=entry,
                        score=round(final_score, 4),
                        match_level=level,
                        matched_on=matched_on,
                        confidence_factors=scores,
                    )
                )
                matched_entry_ids.add(entry.id)

        matches.sort(key=lambda m: m.score, reverse=True)
        overall_score = matches[0].score if matches else 0.0

        return SanctionsResult(
            entity_name=name,
            entity_id=hashlib.sha256(name.encode()).hexdigest()[:16],
            passed=overall_score < effective_threshold,
            score=round(overall_score, 4),
            threshold=effective_threshold,
            matches=matches,
            searched_lists=search_lists,
        )

    def get_list_statistics(self) -> dict[str, Any]:
        cursor = self.conn.cursor()
        stats: dict[str, Any] = {}
        for sl in SanctionList:
            cursor.execute("SELECT COUNT(*) FROM sanctions_entries WHERE list_name = ?", (sl.value,))
            count = cursor.fetchone()[0]
            stats[sl.value] = count
        cursor.execute("SELECT COUNT(*) FROM sanctions_entries")
        stats["total"] = cursor.fetchone()[0]
        return stats

    def close(self) -> None:
        self.conn.close()
