*** Settings ***
Documentation       Robot Framework test suite for the KYC Vault API
Library             RequestsLibrary
Library             Collections
Library             String
Library             DateTime
Resource            kyc_vault_keywords.resource

Suite Setup         Setup KYC Vault Session
Suite Teardown      Delete All Sessions

Test Tags           api    regression

*** Variables ***
${BASE_URL}         https://api.staging.kyc-vault.com/v1
${AUTH_TOKEN}       %{KYC_VAULT_TOKEN}
${ISSUER_DID}       did:kyc:issuer:test-vault-001
${SUBJECT_DID}      did:kyc:subject:test-user-001
${TEST_CRED_ID}     ${EMPTY}
${TEST_WF_ID}       ${EMPTY}

*** Keywords ***
Setup KYC Vault Session
    Create Session    kyc_vault    ${BASE_URL}    headers=${AUTH_HEADER}
    ${headers}=    Create Dictionary    Authorization=Bearer ${AUTH_TOKEN}    Content-Type=application/json
    ${AUTH_HEADER}=    Set Variable    ${headers}
    Set Suite Variable    ${AUTH_HEADER}

Health Check Should Succeed
    ${resp}=    GET On Session    kyc_vault    /health    expected_status=200
    Should Be Equal As Strings    ${resp.json()}[status]    ok
    Log    Service status: ${resp.json()}[status]

Create Credential And Return ID
    [Arguments]    ${subject_id}=${SUBJECT_DID}
    ${body}=    Create Dictionary
    ...    credential=${CRED_TEMPLATE}
    ...    options=${PROOF_OPTIONS}
    Set To Dictionary    ${CRED_TEMPLATE}[credentialSubject]    id=${subject_id}
    ${resp}=    POST On Session    kyc_vault    /credentials    json=${body}    expected_status=201
    ${cred_id}=    Set Variable    ${resp.json()}[data][credentialId]
    RETURN    ${cred_id}

Verify Credential Status
    [Arguments]    ${cred_id}
    ${resp}=    POST On Session    kyc_vault    /credentials/${cred_id}/verify    expected_status=200
    Should Be True    ${resp.json()}[data][valid]
    RETURN    ${resp.json()}[data]

Start KYC Workflow And Return ID
    [Arguments]    ${applicant_id}=${SUBJECT_DID}
    ${uuid}=    Generate Random String    8    [NUMBERS][LETTERS]
    ${body}=    Create Dictionary
    ...    verificationId=wf-${uuid}
    ...    applicantId=${applicant_id}
    ...    documents=${DOCUMENTS}
    ...    options=${WF_OPTIONS}
    ${resp}=    POST On Session    kyc_vault    /v1/verify    json=${body}    expected_status=202
    ${wf_id}=    Set Variable    ${resp.json()}[data][verificationId]
    RETURN    ${wf_id}

*** Test Cases ***

TC01 - Health Check
    [Tags]    smoke    health
    Given Health Check Should Succeed

TC02 - Issue Credential
    [Tags]    smoke    credential
    ${cred_id}=    Create Credential And Return ID
    Set Suite Variable    ${TEST_CRED_ID}    ${cred_id}
    Should Not Be Empty    ${cred_id}
    Log    Issued credential: ${cred_id}

TC03 - Verify Credential
    [Tags]    smoke    credential    verify
    Skip If    "${TEST_CRED_ID}" == "${EMPTY}"    No credential to verify
    ${result}=    Verify Credential Status    ${TEST_CRED_ID}
    Log    Verification result: ${result}

TC04 - Revoke Credential
    [Tags]    credential    revocation
    Skip If    "${TEST_CRED_ID}" == "${EMPTY}"    No credential to revoke
    ${resp}=    DELETE On Session    kyc_vault    /credentials/${TEST_CRED_ID}    expected_status=200
    Should Be True    ${resp.json()}[success]
    Log    Credential revoked: ${TEST_CRED_ID}

TC05 - Start KYC Workflow
    [Tags]    smoke    kyc
    ${wf_id}=    Start KYC Workflow And Return ID
    Set Suite Variable    ${TEST_WF_ID}    ${wf_id}
    Should Not Be Empty    ${wf_id}
    Log    Workflow started: ${wf_id}

TC06 - Fraud Detection
    [Tags]    ai    fraud
    Skip If    "${TEST_WF_ID}" == "${EMPTY}"    No workflow to check
    ${body}=    Create Dictionary
    ...    verificationId=${TEST_WF_ID}
    ...    applicantId=${SUBJECT_DID}
    ...    documents=${EMPTY_LIST}
    ${resp}=    POST On Session    kyc_vault    /ai/fraud-detection    json=${body}    expected_status=200
    Should Contain    ${resp.json()}[data][riskLevel]    low    medium    high
    Log    Fraud risk: ${resp.json()}[data][riskLevel] (score: ${resp.json()}[data][riskScore])

TC07 - Classify Document
    [Tags]    ai    document
    ${body}=    Create Dictionary
    ...    documentId=doc-${TEST_CRED_ID}
    ...    imageData=PHN2ZyB4bWxucz0iaHR0cD...A
    ...    documentType=passport
    ${resp}=    POST On Session    kyc_vault    /ai/classify-document    json=${body}    expected_status=200
    Should Be Equal As Strings    ${resp.json()}[data][predictedType]    passport
    Should Be True    ${resp.json()}[data][confidence] > 0.5
    Log    Document classified: ${resp.json()}[data][predictedType] (confidence: ${resp.json()}[data][confidence])

TC08 - DID Resolution
    [Tags]    did
    ${body}=    Create Dictionary    did=${ISSUER_DID}
    ${resp}=    POST On Session    kyc_vault    /did/resolve    json=${body}    expected_status=200
    Should Be Equal    ${resp.json()}[data][id]    ${ISSUER_DID}
    Log    Resolved DID: ${resp.json()}[data][id]

TC09 - List Workflows
    [Tags]    kyc    list
    ${resp}=    POST On Session    kyc_vault    /kyc/list    json=\{\}    expected_status=200
    Log    Retrieved workflow list

TC10 - Full KYC Lifecycle
    [Tags]    integration    full
    [Setup]    Setup KYC Vault Session
    Health Check Should Succeed
    ${cred_id}=    Create Credential And Return ID    did:kyc:subject:lifecycle-test
    ${verify}=    Verify Credential Status    ${cred_id}
    Should Be True    ${verify}[valid]
    ${wf_id}=    Start KYC Workflow And Return ID    did:kyc:subject:lifecycle-test
    Should Not Be Empty    ${wf_id}
    ${body}=    Create Dictionary
    ...    verificationId=${wf_id}
    ...    applicantId=did:kyc:subject:lifecycle-test
    ...    documents=${EMPTY_LIST}
    ${fraud}=    POST On Session    kyc_vault    /ai/fraud-detection    json=${body}    expected_status=200
    Should Be True    ${fraud.json()}[data][riskScore] < 0.5
    DELETE On Session    kyc_vault    /credentials/${cred_id}    expected_status=200
    Log    Full lifecycle completed successfully
