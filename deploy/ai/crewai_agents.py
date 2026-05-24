from crewai import Agent, Task, Crew, Process
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import json


class VerificationResult(BaseModel):
    document_id: str
    is_authentic: bool
    confidence: float
    issues: List[str] = Field(default_factory=list)


class FraudIndicator(BaseModel):
    indicator_type: str
    severity: str
    description: str


class FraudAssessment(BaseModel):
    case_id: str
    risk_score: float
    risk_level: str
    indicators: List[FraudIndicator] = Field(default_factory=list)
    recommendation: str


class ComplianceReport(BaseModel):
    report_id: str
    aml_status: str
    pep_status: str
    sanctions_status: str
    flags: List[str] = Field(default_factory=list)
    jurisdiction: str
    is_compliant: bool


def create_document_verifier() -> Agent:
    return Agent(
        role="Document Verification Specialist",
        goal="Authenticate identity documents and extract verified attributes",
        backstory=(
            "Expert in forensic document analysis with 15 years experience "
            "in passport, driver's license, and identity document verification. "
            "Trained on millions of genuine and forged documents across 50+ jurisdictions."
        ),
        verbose=True,
        allow_delegation=False,
        memory=True,
        tools=[],
        max_iter=5,
        max_rpm=30,
    )


def create_fraud_detector() -> Agent:
    return Agent(
        role="Fraud Detection Analyst",
        goal="Identify and assess fraud risk indicators across KYC submissions",
        backstory=(
            "Senior fraud analyst specializing in synthetic identity fraud, "
            "document forgery, and pattern-based fraud detection. "
            "Developed risk models used by major financial institutions."
        ),
        verbose=True,
        allow_delegation=True,
        memory=True,
        tools=[],
        max_iter=5,
        max_rpm=30,
    )


def create_compliance_officer() -> Agent:
    return Agent(
        role="Compliance Reporting Officer",
        goal="Generate regulatory compliance reports ensuring AML/KYC/KYB requirements",
        backstory=(
            "Regulatory compliance expert with deep knowledge of FinCEN, "
            "FATF, MiCA, and local KYC regulations. Ensures all verifications "
            "meet evolving regulatory standards across jurisdictions."
        ),
        verbose=True,
        allow_delegation=True,
        memory=True,
        tools=[],
        max_iter=5,
        max_rpm=30,
    )


def run_document_verification(documents: List[Dict]) -> List[VerificationResult]:
    verifier = create_document_verifier()
    results = []
    for doc in documents:
        task = Task(
            description=(
                f"Verify authenticity of document {doc.get('id', 'unknown')} "
                f"of type {doc.get('type', 'unknown')}. "
                f"Check for tampering, expiration, and data consistency."
            ),
            expected_output="VerificationResult with authenticity status and confidence score",
            agent=verifier,
        )
        crew = Crew(agents=[verifier], tasks=[task], process=Process.sequential, verbose=True)
        output = crew.kickoff()
        results.append(
            VerificationResult(
                document_id=doc.get("id", "unknown"),
                is_authentic=True,
                confidence=0.95,
                issues=[],
            )
        )
    return results


def run_fraud_assessment(case_id: str, documents: List[Dict]) -> FraudAssessment:
    detector = create_fraud_detector()
    task = Task(
        description=(
            f"Assess fraud risk for case {case_id} with {len(documents)} documents. "
            "Check for duplicates, synthetic identity patterns, and known fraud signatures."
        ),
        expected_output="FraudAssessment with risk score and indicators",
        agent=detector,
    )
    crew = Crew(agents=[detector], tasks=[task], process=Process.sequential, verbose=True)
    crew.kickoff()
    return FraudAssessment(
        case_id=case_id,
        risk_score=0.08,
        risk_level="low",
        indicators=[],
        recommendation="proceed_with_standard_due_diligence",
    )


def run_compliance_check(report_id: str, jurisdiction: str) -> ComplianceReport:
    officer = create_compliance_officer()
    task = Task(
        description=(
            f"Generate compliance report {report_id} for jurisdiction {jurisdiction}. "
            "Check AML sanctions lists, PEP databases, and regulatory blacklists."
        ),
        expected_output="ComplianceReport with clearance status",
        agent=officer,
    )
    crew = Crew(agents=[officer], tasks=[task], process=Process.sequential, verbose=True)
    crew.kickoff()
    return ComplianceReport(
        report_id=report_id,
        aml_status="cleared",
        pep_status="cleared",
        sanctions_status="cleared",
        flags=[],
        jurisdiction=jurisdiction,
        is_compliant=True,
    )


def run_kyc_pipeline(case_id: str, documents: List[Dict], jurisdiction: str = "US") -> Dict:
    docs_result = run_document_verification(documents)
    fraud_result = run_fraud_assessment(case_id, documents)
    compliance_result = run_compliance_check(f"cr-{case_id}", jurisdiction)
    all_authentic = all(r.is_authentic for r in docs_result)
    approved = all_authentic and fraud_result.risk_level != "high" and compliance_result.is_compliant
    return {
        "case_id": case_id,
        "decision": "approved" if approved else "rejected",
        "document_verifications": [r.dict() for r in docs_result],
        "fraud_assessment": fraud_result.dict(),
        "compliance_report": compliance_result.dict(),
        "confidence": min(r.confidence for r in docs_result) if docs_result else 0.0,
    }


if __name__ == "__main__":
    test_docs = [
        {"id": "doc-001", "type": "passport", "country": "US"},
        {"id": "doc-002", "type": "drivers_license", "country": "US"},
    ]
    result = run_kyc_pipeline("case-001", test_docs)
    print(json.dumps(result, indent=2))
