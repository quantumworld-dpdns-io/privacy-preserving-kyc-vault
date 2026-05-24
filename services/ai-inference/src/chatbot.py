"""Simple KYC applicant guidance chatbot.

Provides applicants with step-by-step guidance on what documents are
needed based on their jurisdiction and account type. Uses a lightweight
intent classifier (threshold-based similarity) rather than a full LLM.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Response templates
# ---------------------------------------------------------------------------

GREETINGS = [
    "Hello! I'm your KYC assistant. I can help you with document requirements, "
    "account types, and submitting your verification. How can I help you today?",
]

FALLBACK = (
    "I'm not sure I understand. You can ask me about:\n"
    "- What documents are needed\n"
    "- Types of accounts\n"
    "- How to submit your documents\n"
    "- Supported countries and ID types"
)

TOPICS = {
    "documents_needed": {
        "patterns": [
            r"what\s*(documents|docs|ids|identification).*need",
            r"required\s*(documents|docs)",
            r"what\s*(to|should|do)\s*(i|we|one)\s*(need|bring|provide|submit|upload)",
            r"list\s*(of|the)?\s*(documents|docs|requirements)",
            r"what.*(documents|papers).*required",
            r"need.*(to|for)\s*kyc",
        ],
        "response": (
            "For KYC verification you typically need:\n"
            "1. A government-issued ID (passport, national ID card, or driver's license)\n"
            "2. Proof of address (utility bill, bank statement ≤ 3 months old)\n"
            "3. A selfie or live photo for facial verification\n"
            "Requirements may vary by jurisdiction and account tier."
        ),
    },
    "account_types": {
        "patterns": [
            r"(types?|kinds?|categories?)\s*(of|for)?\s*accounts?",
            r"what\s*accounts?\s*(do you|are there)",
            r"different\s*accounts?",
            r"(personal|business|corporate)\s*account",
        ],
        "response": (
            "We offer the following account types:\n"
            "- Personal: basic KYC, standard limits\n"
            "- Business: enhanced due diligence, higher transaction limits\n"
            "- Premium: full KYC + source of wealth, unlimited access\n"
            "Each tier requires progressively more documentation."
        ),
    },
    "submission_help": {
        "patterns": [
            r"how\s*(to|do|can)\s*(i|we|one)\s*(submit|upload|send)",
            r"submission\s*(process|steps|guide|help)",
            r"what\s*(are|is)\s*the\s*(steps|process)",
            r"upload\s*(documents?|files?|photos?)",
            r"how.*(upload|send|submit|provide)",
        ],
        "response": (
            "To submit your documents:\n"
            "1. Take clear, well-lit photos of each document\n"
            "2. Ensure all four corners are visible\n"
            "3. No glare, obstructions, or fingers over critical info\n"
            "4. For selfies: look directly at the camera, good lighting\n"
            "5. Upload through the secure portal in your dashboard\n"
            "All documents are encrypted end-to-end and never stored in plaintext."
        ),
    },
    "supported_countries": {
        "patterns": [
            r"(supported|accepted|available)\s*(countries?|jurisdictions?|regions?)",
            r"what\s*(countries?|jurisdictions?)\s*(do you|are|can)",
            r"is\s*my\s*country\s*(supported|accepted)",
            r"country\s*list",
        ],
        "response": (
            "We currently support KYC verification for:\n"
            "- EU/EEA countries (passport or national ID)\n"
            "- United Kingdom (passport or driving licence)\n"
            "- United States (passport or state-issued ID)\n"
            "- Canada (passport or provincial ID)\n"
            "- Australia & New Zealand (passport)\n"
            "- Switzerland & Norway (passport or national ID)\n\n"
            "For other jurisdictions, please contact support for a manual review option."
        ),
    },
    "security_privacy": {
        "patterns": [
            r"(secure|security|privacy|private|encrypt|safe)",
            r"(how|is)\s*(my|the)\s*(data|info|information).*(protect|secure|safe|private)",
            r"what\s*(do you|you do).*(data|info)",
            r"zero.?knowledge|zk.?proof",
        ],
        "response": (
            "Your privacy is our priority. We use:\n"
            "- Zero-knowledge proofs (ZKPs) so we never see your raw data\n"
            "- End-to-end encryption for all document uploads\n"
            "- Ephemeral processing — documents are deleted after verification\n"
            "- Privacy-preserving biometric matching\n"
            "We only store salted hashes and zero-knowledge proofs, never plaintext PII."
        ),
    },
}

# ---------------------------------------------------------------------------


@dataclass
class ChatResponse:
    text: str
    confidence: float
    topic: str | None
    suggestions: list[str] = field(default_factory=list)


class KYCGuideBot:
    """Intent-matching chatbot for KYC applicant guidance.

    Matches user messages against known topic patterns using fuzzy string
    similarity and regex, returning the best-matched response.
    """

    def __init__(self, confidence_threshold: float = 0.35) -> None:
        self.confidence_threshold = confidence_threshold
        self._patterns: list[tuple[str, re.Pattern[str], str]] = [
            (topic, re.compile("|".join(defn["patterns"]), re.IGNORECASE), defn["response"])
            for topic, defn in TOPICS.items()
        ]

    def _match_regex(self, message: str) -> list[tuple[str, float, str]]:
        results: list[tuple[str, float, str]] = []
        for topic, pattern, response in self._patterns:
            if pattern.search(message):
                results.append((topic, 1.0, response))
        return results

    def _match_fuzzy(self, message: str) -> list[tuple[str, float, str]]:
        results: list[tuple[str, float, str]] = []
        words = set(message.lower().split())
        for topic, defn in TOPICS.items():
            best = 0.0
            for pat_str in defn["patterns"]:
                pat_words = set(re.sub(r"[^a-z\s]", "", pat_str.lower()).split())
                if not pat_words:
                    continue
                seq = SequenceMatcher(
                    None, " ".join(sorted(words)), " ".join(sorted(pat_words))
                ).ratio()
                best = max(best, seq)
            if best >= self.confidence_threshold:
                results.append((topic, best, defn["response"]))
        return results

    @staticmethod
    def _is_greeting(message: str) -> bool:
        greetings = {"hi", "hello", "hey", "good morning", "good afternoon", "good evening", "help"}
        return any(g in message.lower().strip() for g in greetings)

    def _get_suggestions(self, topic: str | None = None) -> list[str]:
        if topic:
            return [
                "What documents do I need?",
                "How do I submit?",
                "What account types are available?",
            ]
        return list(TOPICS.keys())

    def respond(self, message: str) -> ChatResponse:
        """Generate a response to the user's message.

        Args:
            message: The applicant's input text.

        Returns:
            ChatResponse with the bot's reply and confidence.
        """
        if not message or not message.strip():
            return ChatResponse(
                text="Please tell me how I can help you with KYC verification.",
                confidence=0.0,
                topic=None,
            )

        if self._is_greeting(message):
            return ChatResponse(
                text=GREETINGS[0],
                confidence=1.0,
                topic="greeting",
                suggestions=self._get_suggestions(),
            )

        regex_matches = self._match_regex(message)
        fuzzy_matches = self._match_fuzzy(message)

        all_matches = regex_matches + fuzzy_matches
        if not all_matches:
            return ChatResponse(
                text=FALLBACK,
                confidence=0.0,
                topic=None,
                suggestions=self._get_suggestions(),
            )

        all_matches.sort(key=lambda x: x[1], reverse=True)
        best_topic, best_conf, best_response = all_matches[0]

        return ChatResponse(
            text=best_response,
            confidence=round(best_conf, 4),
            topic=best_topic,
            suggestions=self._get_suggestions(best_topic),
        )

    def handle_conversation(self, messages: list[str]) -> list[ChatResponse]:
        """Process a conversation turn-by-turn."""
        return [self.respond(msg) for msg in messages]


class FAQBot:
    """Simple FAQ lookup bot backed by a dictionary of question-answer pairs."""

    def __init__(self) -> None:
        self.faqs: dict[str, str] = {
            "how long does kyc take": (
                "Most KYC verifications are completed within 2-5 minutes. "
                "If additional manual review is required, it may take up to 24 hours."
            ),
            "is my data safe": (
                "Yes. All data is encrypted and processed using zero-knowledge proofs. "
                "We never store raw PII or document images."
            ),
            "what if my document is rejected": (
                "If your document is rejected, you'll receive a reason code and can "
                "re-submit with corrected photos. Common issues: poor lighting, "
                "cropped corners, or expired documents."
            ),
            "do you support non latin scripts": (
                "Yes, our OCR pipeline supports Latin, Cyrillic, and Arabic scripts. "
                "Additional languages can be enabled on request."
            ),
        }

    def answer(self, question: str) -> ChatResponse:
        """Look up the best FAQ match."""
        clean = re.sub(r"[^a-z0-9\s]", "", question.lower()).strip()
        best_ratio = 0.0
        best_answer = "I don't have an answer for that. Please contact support."

        for q, a in self.faqs.items():
            ratio = SequenceMatcher(None, clean, q).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_answer = a

        return ChatResponse(
            text=best_answer,
            confidence=round(best_ratio, 4),
            topic="faq",
        )
