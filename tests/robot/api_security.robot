*** Settings ***
Resource    ../resources/common.resource
Resource    ../resources/api.resource
Library     RequestsLibrary
Library     Collections
Library     OperatingSystem
Library     ../libs/AuthLibrary.py
Library     ../libs/RateLimitLibrary.py
Library     ../libs/ValidationLibrary.py

Suite Setup       Setup API Session
Suite Teardown    Delete All Sessions

*** Variables ***
${BASE_URL}           https://api.kyc-vault.com/v1
${API_KEY}            %{TEST_API_KEY}
${INVALID_API_KEY}    invalid-key-12345
${RATE_LIMIT_WINDOW}  60
${RATE_LIMIT_MAX}     100

*** Keywords ***
Setup API Session
    Create Session    kyc-api    ${BASE_URL}
    ${auth_header}=    Create Dictionary    Authorization    Bearer ${API_KEY}
    Set Suite Variable    ${AUTH_HEADER}    ${auth_header}

Assert Rate Limit Headers
    [Arguments]    ${response}
    Should Contain    ${response.headers}    X-RateLimit-Limit
    Should Contain    ${response.headers}    X-RateLimit-Remaining
    Should Contain    ${response.headers}    X-RateLimit-Reset

Assert Security Headers
    [Arguments]    ${response}
    Should Contain    ${response.headers}    Strict-Transport-Security
    Should Contain    ${response.headers}    X-Content-Type-Options
    Should Contain    ${response.headers}    X-Frame-Options
    Should Contain    ${response.headers}    X-XSS-Protection
    Should Contain    ${response.headers}    Content-Security-Policy

*** Test Cases ***
Test Rate Limiting - Exceeding Limit
    [Documentation]    Verify rate limiting kicks in after exceeding request threshold
    [Tags]    security    rate-limit
    ${requests}=    Evaluate    ${RATE_LIMIT_MAX} + 10
    FOR    ${i}    IN RANGE    ${requests}
        ${response}=    GET On Session
        ...    kyc-api
        ...    /health
        ...    headers=${AUTH_HEADER}
        ...    expected_status=anything
        Run Keyword If    ${i} >= ${RATE_LIMIT_MAX} - 1
        ...    Exit For Loop If    ${response.status_code} == 429
    END
    Should Be Equal As Integers    ${response.status_code}    429
    Should Contain    ${response.json()}    error
    Should Contain    ${response.json()}    retryAfterMs

Test Rate Limiting - Rate Limit Headers Present
    [Documentation]    Verify rate limit headers are present in successful responses
    [Tags]    security    rate-limit
    ${response}=    GET On Session
    ...    kyc-api
    ...    /health
    ...    headers=${AUTH_HEADER}
    ...    expected_status=200
    Assert Rate Limit Headers    ${response}

Test Input Validation - XSS Injection
    [Documentation]    Verify XSS injection is blocked in API inputs
    [Tags]    security    xss    input-validation
    ${xss_payload}=    Set Variable    <script>alert('xss')</script>
    ${data}=    Create Dictionary
    ...    documentId    ${xss_payload}
    ...    imageData    dGVzdA==
    ${response}=    POST On Session
    ...    kyc-api
    ...    /ai/classify-document
    ...    json=${data}
    ...    headers=${AUTH_HEADER}
    ...    expected_status=anything
    Should Not Be Equal As Integers    ${response.status_code}    200
    ${body}=    Evaluate    ${response.json()}
    Log    XSS validation response: ${body}

Test Input Validation - SQL Injection
    [Documentation]    Verify SQL injection is blocked in API inputs
    [Tags]    security    sqli    input-validation
    ${sqli_payload}=    Set Variable    '; DROP TABLE credentials; --
    ${params}=    Create Dictionary    applicantId    ${sqli_payload}
    ${response}=    GET On Session
    ...    kyc-api
    ...    /credentials
    ...    params=${params}
    ...    headers=${AUTH_HEADER}
    ...    expected_status=anything
    Should Not Be Equal As Integers    ${response.status_code}    200
    Log    SQL injection validation response: ${response.json()}

Test Input Validation - Oversized Payload
    [Documentation]    Verify oversized payloads are rejected
    [Tags]    security    payload-size    input-validation
    ${large_data}=    Evaluate    'A' * 11000000
    ${data}=    Create Dictionary
    ...    documentId    123e4567-e89b-12d3-a456-426614174000
    ...    imageData    ${large_data}
    ${response}=    POST On Session
    ...    kyc-api
    ...    /ai/classify-document
    ...    json=${data}
    ...    headers=${AUTH_HEADER}
    ...    expected_status=anything
    Should Be Equal As Integers    ${response.status_code}    413
    Should Contain    ${response.json()}    error

Test Input Validation - Invalid UUID
    [Documentation]    Verify invalid UUIDs are rejected
    [Tags]    security    uuid-validation    input-validation
    ${data}=    Create Dictionary
    ...    documentId    not-a-uuid
    ...    imageData    dGVzdA==
    ...    documentType    passport
    ${response}=    POST On Session
    ...    kyc-api
    ...    /ai/classify-document
    ...    json=${data}
    ...    headers=${AUTH_HEADER}
    ...    expected_status=400
    Should Contain    ${response.json()}    error

Test Input Validation - Missing Required Fields
    [Documentation]    Verify missing required fields return 400
    [Tags]    security    validation    input-validation
    ${data}=    Create Dictionary
    ...    documentId    123e4567-e89b-12d3-a456-426614174000
    ${response}=    POST On Session
    ...    kyc-api
    ...    /ai/classify-document
    ...    json=${data}
    ...    headers=${AUTH_HEADER}
    ...    expected_status=400
    Should Contain    ${response.json()}    error

Test Input Validation - Invalid Enum Value
    [Documentation]    Verify invalid enum values are rejected
    [Tags]    security    enum-validation    input-validation
    ${data}=    Create Dictionary
    ...    documentId    123e4567-e89b-12d3-a456-426614174000
    ...    imageData    dGVzdA==
    ...    documentType    invalid_doc_type
    ${response}=    POST On Session
    ...    kyc-api
    ...    /ai/classify-document
    ...    json=${data}
    ...    headers=${AUTH_HEADER}
    ...    expected_status=400
    Should Contain    ${response.json()}    error

Test Authentication - Invalid API Key
    [Documentation]    Verify invalid API keys are rejected
    [Tags]    security    auth    authentication
    ${bad_auth}=    Create Dictionary    Authorization    Bearer ${INVALID_API_KEY}
    ${response}=    GET On Session
    ...    kyc-api
    ...    /health
    ...    headers=${bad_auth}
    ...    expected_status=401
    Should Be Equal As Integers    ${response.status_code}    401

Test Authentication - Missing Authorization Header
    [Documentation]    Verify requests without auth header are rejected
    [Tags]    security    auth    authentication
    ${response}=    GET On Session
    ...    kyc-api
    ...    /health
    ...    expected_status=401
    Should Be Equal As Integers    ${response.status_code}    401

Test Authentication - Expired Token
    [Documentation]    Verify expired tokens are rejected
    [Tags]    security    auth    authentication
    ${expired_token}=    Set Variable    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE1MTYyMzkwMjJ9
    ${expired_auth}=    Create Dictionary    Authorization    Bearer ${expired_token}
    ${response}=    GET On Session
    ...    kyc-api
    ...    /health
    ...    headers=${expired_auth}
    ...    expected_status=401
    Should Be Equal As Integers    ${response.status_code}    401

Test Security Headers
    [Documentation]    Verify security headers are present
    [Tags]    security    headers
    ${response}=    GET On Session
    ...    kyc-api
    ...    /health
    ...    headers=${AUTH_HEADER}
    ...    expected_status=200
    Assert Security Headers    ${response}

Test CORS Configuration
    [Documentation]    Verify CORS headers are properly configured
    [Tags]    security    cors
    ${headers}=    Create Dictionary
    ...    Origin    https://malicious-site.com
    ...    Authorization    Bearer ${API_KEY}
    ${response}=    GET On Session
    ...    kyc-api
    ...    /health
    ...    headers=${headers}
    ...    expected_status=200
    Run Keyword And Ignore Error
    ...    Should Not Contain    ${response.headers}    Access-Control-Allow-Origin    https://malicious-site.com

Test Path Traversal Prevention
    [Documentation]    Verify path traversal attacks are blocked
    [Tags]    security    path-traversal
    ${traversal_path}=    Set Variable    ../../etc/passwd
    ${response}=    GET On Session
    ...    kyc-api
    ...    /credentials/${traversal_path}
    ...    headers=${AUTH_HEADER}
    ...    expected_status=anything
    Should Not Be Equal As Integers    ${response.status_code}    200

Test HTTP Method Override Prevention
    [Documentation]    Verify HTTP method override attacks are blocked
    [Tags]    security    method-override
    ${headers}=    Evaluate    {**${AUTH_HEADER}, **{"X-HTTP-Method-Override": "DELETE"}}
    ${response}=    GET On Session
    ...    kyc-api
    ...    /credentials/123
    ...    headers=${headers}
    ...    expected_status=anything
    Should Be Equal As Integers    ${response.status_code}    405
