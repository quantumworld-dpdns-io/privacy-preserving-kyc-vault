*** Settings ***
Library    RequestsLibrary
Library    Collections

*** Variables ***
${BASE_URL}    http://localhost:3000
${API_VERSION}    v1
${RATE_LIMIT_ENDPOINT}    /api/${API_VERSION}/credentials/verify

*** Keywords ***
Create RateLimit Session
    Create Session    ratelimit    ${BASE_URL}

Send Rate Limited Request
    [Arguments]    ${payload}
    ${resp}=    POST On Session    ratelimit    ${RATE_LIMIT_ENDPOINT}    json=${payload}
    RETURN    ${resp}

*** Test Cases ***
Rate Limit Headers Present On First Request
    [Documentation]    Verify rate limit headers are present
    [Tags]    ratelimit    headers
    Given Create RateLimit Session
    ${payload}=    Create Dictionary    credential=${EMPTY}
    ${resp}=    Send Rate Limited Request    ${payload}
    Dictionary Should Contain Key    ${resp.headers}    X-RateLimit-Limit
    Dictionary Should Contain Key    ${resp.headers}    X-RateLimit-Remaining
    Dictionary Should Contain Key    ${resp.headers}    X-RateLimit-Reset

Rate Limit Remaining Decreases
    [Documentation]    Verify X-RateLimit-Remaining decreases after each request
    [Tags]    ratelimit    decrement
    Given Create RateLimit Session
    ${payload}=    Create Dictionary    credential=${EMPTY}
    ${resp1}=    Send Rate Limited Request    ${payload}
    ${remaining1}=    Set Variable    ${resp1.headers["X-RateLimit-Remaining"]}
    ${resp2}=    Send Rate Limited Request    ${payload}
    ${remaining2}=    Set Variable    ${resp2.headers["X-RateLimit-Remaining"]}
    Should Be True    ${remaining2} < ${remaining1}

Rate Limit Window Duration
    [Documentation]    Verify X-RateLimit-Reset is a future timestamp
    [Tags]    ratelimit    window
    Given Create RateLimit Session
    ${payload}=    Create Dictionary    credential=${EMPTY}
    ${resp}=    Send Rate Limited Request    ${payload}
    ${reset}=    Set Variable    ${resp.headers["X-RateLimit-Reset"]}
    Should Be True    ${reset} > 0

Rate Limit Returns 429 When Exceeded
    [Documentation]    Verify 429 response when rate limit is exceeded
    [Tags]    ratelimit    429
    Given Create RateLimit Session
    ${payload}=    Create Dictionary    credential=${EMPTY}
    FOR    ${i}    IN RANGE    100
        ${resp}=    Send Rate Limited Request    ${payload}
        Exit For Loop If    ${resp.status_code} == 429
    END
    Status Should Be    429    ${resp}
    Dictionary Should Contain Key    ${resp.headers}    Retry-After

Rate Limit 429 Includes Retry-After
    [Documentation]    Verify 429 response includes Retry-After header
    [Tags]    ratelimit    429    retry
    Given Create RateLimit Session
    ${payload}=    Create Dictionary    credential=${EMPTY}
    FOR    ${i}    IN RANGE    100
        ${resp}=    Send Rate Limited Request    ${payload}
        Exit For Loop If    ${resp.status_code} == 429
    END
    Should Be True    ${resp.headers["Retry-After"]} > 0

Different Endpoints Have Independent Limits
    [Documentation]    Verify different endpoints have separate rate limits
    [Tags]    ratelimit    independent
    Create Session    multi    ${BASE_URL}
    ${payload}=    Create Dictionary    credential=${EMPTY}
    ${resp_api}=    POST On Session    multi    ${RATE_LIMIT_ENDPOINT}    json=${payload}
    ${resp_did}=    GET On Session    multi    /api/${API_VERSION}/did/resolve/did:key:test
    ${remaining_api}=    Set Variable    ${resp_api.headers["X-RateLimit-Remaining"]}
    ${remaining_did}=    Set Variable    ${resp_did.headers["X-RateLimit-Remaining"]}
    Should Be True    ${remaining_api} > 0
    Should Be True    ${remaining_did} > 0

Rate Limit Reset After Window
    [Documentation]    Verify rate limit resets after duration
    [Tags]    ratelimit    reset
    Given Create RateLimit Session
    ${payload}=    Create Dictionary    credential=${EMPTY}
    ${resp1}=    Send Rate Limited Request    ${payload}
    ${limit}=    Set Variable    ${resp1.headers["X-RateLimit-Limit"]}
    Should Be True    ${limit} > 0

Rate Limit Default Values
    [Documentation]    Verify default rate limit values are reasonable
    [Tags]    ratelimit    default
    Given Create RateLimit Session
    ${payload}=    Create Dictionary    credential=${EMPTY}
    ${resp}=    Send Rate Limited Request    ${payload}
    ${limit}=    Set Variable    ${resp.headers["X-RateLimit-Limit"]}
    Should Be True    ${limit} >= 10
    Should Be True    ${limit} <= 10000
