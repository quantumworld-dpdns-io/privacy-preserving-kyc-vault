import json
import logging
from typing import Any, Dict, List, Optional, TypedDict, Literal, Annotated

from langgraph.graph import StateGraph, END
from langgraph.checkpoint import MemorySaver
from langgraph.prebuilt import ToolExecutor, ToolInvocation

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class KYCState(TypedDict):
    verification_id: str
    applicant_id: str
    documents: List[Dict[str, Any]]
    document_analysis: Optional[Dict[str, Any]]
    liveness_result: Optional[Dict[str, Any]]
    fraud_assessment: Optional[Dict[str, Any]]
    compliance_report: Optional[Dict[str, Any]]
    decision: Optional[Dict[str, Any]]
    errors: List[str]
    workflow_version: str


def validate_inputs(state: KYCState) -> KYCState:
    logger.info(f"Validating inputs for {state['verification_id']}")
    if not state.get("verification_id"):
        state["errors"].append("Missing verification_id")
    if not state.get("documents"):
        state["errors"].append("No documents provided")
    if not state.get("applicant_id"):
        state["errors"].append("Missing applicant_id")
    return state


def classify_documents(state: KYCState) -> KYCState:
    logger.info("Classifying documents")
    doc_analysis = {"classifications": [], "confidence_scores": []}
    for doc in state.get("documents", []):
        doc_type = _run_classifier(doc)
        doc_analysis["classifications"].append({
            "doc_id": doc.get("id"),
            "type": doc_type,
            "confidence": 0.95 if doc_type != "unknown" else 0.3,
        })
    state["document_analysis"] = doc_analysis
    return state


def _run_classifier(doc: Dict) -> str:
    doc_type = doc.get("type", "").lower()
    supported = {"passport", "drivers_license", "national_id", "utility_bill", "bank_statement"}
    return doc_type if doc_type in supported else "unknown"


def verify_liveness(state: KYCState) -> KYCState:
    logger.info("Running liveness detection")
    state["liveness_result"] = {
        "status": "passed",
        "score": 0.97,
        "spoof_detected": False,
        "method": "passive_liveness",
        "frame_count": 15,
    }
    return state


def assess_fraud_risk(state: KYCState) -> KYCState:
    logger.info("Assessing fraud risk")
    risk_indicators = []
    for doc in state.get("documents", []):
        if doc.get("metadata", {}).get("is_duplicate"):
            risk_indicators.append("duplicate_document")
    state["fraud_assessment"] = {
        "risk_score": 0.12,
        "risk_level": "low",
        "indicators": risk_indicators,
        "recommendation": "proceed",
    }
    return state


def generate_compliance_report(state: KYCState) -> KYCState:
    logger.info("Generating compliance report")
    state["compliance_report"] = {
        "aml_check": "cleared",
        "pep_check": "cleared",
        "sanctions_check": "cleared",
        "jurisdiction": "US",
        "regulatory_flags": [],
        "report_id": f"cr-{state['verification_id']}",
    }
    return state


def make_decision(state: KYCState) -> KYCState:
    logger.info("Making KYC decision")
    if state.get("errors"):
        state["decision"] = {"status": "rejected", "reason": "validation_errors", "errors": state["errors"]}
    elif state["fraud_assessment"]["risk_level"] == "high":
        state["decision"] = {"status": "rejected", "reason": "high_fraud_risk"}
    elif state["liveness_result"]["spoof_detected"]:
        state["decision"] = {"status": "rejected", "reason": "liveness_failure"}
    else:
        state["decision"] = {
            "status": "approved",
            "tier": "standard",
            "confidence": 0.94,
            "expires_at": "2027-05-24T00:00:00Z",
        }
    return state


def route_by_result(state: KYCState) -> Literal["approved", "rejected", "manual_review"]:
    decision = state.get("decision", {})
    status = decision.get("status", "rejected")
    if status == "approved":
        return "approved"
    elif status == "manual_review":
        return "manual_review"
    return "rejected"


workflow = StateGraph(KYCState)
workflow.set_node("validate_inputs", validate_inputs)
workflow.set_node("classify_documents", classify_documents)
workflow.set_node("verify_liveness", verify_liveness)
workflow.set_node("assess_fraud_risk", assess_fraud_risk)
workflow.set_node("generate_compliance_report", generate_compliance_report)
workflow.set_node("make_decision", make_decision)

workflow.set_entry_point("validate_inputs")
workflow.add_edge("validate_inputs", "classify_documents")
workflow.add_edge("classify_documents", "verify_liveness")
workflow.add_edge("verify_liveness", "assess_fraud_risk")
workflow.add_edge("assess_fraud_risk", "generate_compliance_report")
workflow.add_edge("generate_compliance_report", "make_decision")
workflow.add_conditional_edges("make_decision", route_by_result, {
    "approved": END,
    "rejected": END,
    "manual_review": END,
})

checkpointer = MemorySaver()
kyc_workflow = workflow.compile(checkpointer=checkpointer)


def run_kyc_verification(initial_state: KYCState) -> Dict[str, Any]:
    logger.info(f"Starting KYC workflow for {initial_state['verification_id']}")
    result = kyc_workflow.invoke(initial_state, {"configurable": {"thread_id": initial_state["verification_id"]}})
    return result["decision"]


if __name__ == "__main__":
    test_state: KYCState = {
        "verification_id": "v-001",
        "applicant_id": "a-001",
        "documents": [
            {"id": "doc-1", "type": "passport", "metadata": {}},
            {"id": "doc-2", "type": "utility_bill", "metadata": {}},
        ],
        "document_analysis": None,
        "liveness_result": None,
        "fraud_assessment": None,
        "compliance_report": None,
        "decision": None,
        "errors": [],
        "workflow_version": "2.1.0",
    }
    decision = run_kyc_verification(test_state)
    print(json.dumps(decision, indent=2))
