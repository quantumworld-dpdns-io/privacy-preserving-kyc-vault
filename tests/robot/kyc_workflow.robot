*** Settings ***
Library    RequestsLibrary
Library    Collections

*** Variables ***
${BASE_URL}    http://localhost:3000
${API_VERSION}    v1

*** Keywords ***
Create KYC Session
    Create Session    kyc    ${BASE_URL}

Initiate KYC Workflow
    [Arguments]    ${subject_did}    ${tier}    ${platform_id}
    ${body}=    Create Dictionary    subjectDid=${subject_did}    tier=${tier}    platformId=${platform_id}
    ${resp}=    POST On Session    kyc    /api/${API_VERSION}/kyc/workflows    json=${body}
    RETURN    ${resp}

Submit KYC Document
    [Arguments]    ${workflow_id}    ${doc_type}    ${file_ref}
    ${body}=    Create Dictionary    documentType=${doc_type}    fileReference=${file_ref}
    ${resp}=    POST On Session    kyc    /api/${API_VERSION}/kyc/workflows/${workflow_id}/documents    json=${body}
    RETURN    ${resp}

*** Test Cases ***
Complete KYC Tier 1 Flow
    [Documentation]    Full Tier 1 KYC workflow from initiation to approval
    Given Create KYC Session
    When I initiate a Tier 1 KYC workflow for "did:example:user1"
    Then Workflow should be in "Initiated" state
    When I submit email verification document
    Then Document status should be "Pending"
    When I complete auto-verification
    Then Workflow should transition to "Approved" state

Complete KYC Tier 2 Flow
    [Documentation]    Full Tier 2 KYC workflow with identity document
    Given Create KYC Session
    When I initiate a Tier 2 KYC workflow for "did:example:user2"
    When I submit government ID document
    And I submit a selfie photo
    Then Document count should be 2
    When verification completes
    Then Workflow state should be either "Approved" or "UnderReview"

Credential Issuance After KYC
    [Documentation]    Verify credential issuance after successful KYC
    Given KYC is approved for "did:example:user3"
    When I request an "AgeVerificationCredential"
    Then Credential should be issued successfully
    And Credential should contain proof

Credential Verification Flow
    [Documentation]    Verify credential verification endpoint
    Given I have a valid credential
    When I submit it for verification
    Then Verification result should be "verified"

Platform Integration Flow
    [Documentation]    Verify platform can initiate KYC for its users
    Given Platform "plat-1" has valid API key
    When I initiate KYC for user "did:example:user4" on platform "plat-1"
    Then Platform should receive webhook on completion

Batch Credential Verification
    [Documentation]    Verify multiple credentials can be verified
    Given I have 5 valid credentials
    When I submit them for batch verification
    Then All 5 should be verified successfully
