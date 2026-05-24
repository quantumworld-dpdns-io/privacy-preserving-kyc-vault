*** Settings ***
Library    RequestsLibrary
Library    Collections
Resource    common.robot

Suite Setup    Create ErrorHandling Session
Suite Teardown    Delete All Sessions

*** Variables ***
${API_BASE}    ${BASE_URL}/api/v1

*** Keywords ***
Create ErrorHandling Session
    Create Session    errors    ${BASE_URL}

Trigger Error
    [Arguments]    ${endpoint}    ${method}=GET    ${body}=${NONE}
    IF    "${method}" == "GET"
        ${resp}=    GET On Session    errors    ${API_BASE}${endpoint}    expected_status=any
    ELSE IF    "${method}" == "POST"
        ${resp}=    POST On Session    errors    ${API_BASE}${endpoint}    json=${body}    expected_status=any
    ELSE IF    "${method}" == "DELETE"
        ${resp}=    DELETE On Session    errors    ${API_BASE}${endpoint}    expected_status=any
    END
    RETURN    ${resp}

Validate Error Response
    [Arguments]    ${resp}    ${expected_status}    ${expected_error_type}
    Status Should Be    ${expected_status}    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    error
    Dictionary Should Contain Key    ${resp.json()}[error]    code
    Dictionary Should Contain Key    ${resp.json()}[error]    message
    Dictionary Should Contain Key    ${resp.json()}[error]    type
    Should Be Equal    ${resp.json()}[error][type]    ${expected_error_type}

*** Test Cases ***
404 Returns NotFound Error
    [Documentation]    Verify non-existent endpoint returns 404 with error body
    [Tags]    errors    404
    ${resp}=    Trigger Error    /nonexistent    GET
    ${resp}=    Validate Error Response    ${resp}    404    NOT_FOUND

400 Returns Validation Error
    [Documentation]    Verify invalid input returns 400 with validation details
    [Tags]    errors    400    validation
    ${body}=    Create Dictionary    invalid=input
    ${resp}=    Trigger Error    /credentials/verify    POST    ${body}
    ${resp}=    Validate Error Response    ${resp}    400    VALIDATION_ERROR
    Dictionary Should Contain Key    ${resp.json()}[error]    details

401 Returns Unauthorized Error
    [Documentation]    Verify missing auth returns 401
    [Tags]    errors    401    auth
    ${resp}=    Trigger Error    /kyc/workflows    GET
    Status Should Be    401    ${resp}
    Dictionary Should Contain Key    ${resp.json()}[error]    code
    Should Contain    ${resp.json()}[error][type]    UNAUTHORIZED

403 Returns Forbidden Error
    [Documentation]    Verify insufficient permissions returns 403
    [Tags]    errors    403    forbidden
    ${resp}=    Trigger Error    /admin/users    GET
    Status Should Be    403    ${resp}
    Should Contain    ${resp.json()}[error][type]    FORBIDDEN

409 Returns Conflict Error
    [Documentation]    Verify duplicate resource returns 409
    [Tags]    errors    409    conflict
    ${body}=    Create Dictionary    did=did:example:duplicate
    ${resp}=    Trigger Error    /did/register    POST    ${body}
    Status Should Be    409    ${resp}
    Should Contain    ${resp.json()}[error][type]    CONFLICT

422 Returns Unprocessable Error
    [Documentation]    Verify semantically invalid request returns 422
    [Tags]    errors    422    unprocessable
    ${body}=    Create Dictionary    credential=    proof=
    ${resp}=    Trigger Error    /credentials/verify    POST    ${body}
    Status Should Be    422    ${resp}
    Should Contain    ${resp.json()}[error][type]    UNPROCESSABLE_ENTITY

429 Returns RateLimit Error
    [Documentation]    Verify rate limit exceeded returns 429
    [Tags]    errors    429    ratelimit
    FOR    ${i}    IN RANGE    100
        ${resp}=    Trigger Error    /credentials/verify    POST    ${body}
        Exit For Loop If    ${resp.status_code} == 429
    END
    Status Should Be    429    ${resp}
    Should Contain    ${resp.json()}[error][type]    RATE_LIMIT_EXCEEDED
    Dictionary Should Contain Key    ${resp.headers}    Retry-After

500 Returns Internal Error
    [Documentation]    Verify server error returns 500
    [Tags]    errors    500    internal
    ${resp}=    Trigger Error    /debug/panic    GET
    Status Should Be    500    ${resp}
    Should Contain    ${resp.json()}[error][type]    INTERNAL_ERROR

Error Response Includes RequestId
    [Documentation]    Verify error response includes request ID for tracing
    [Tags]    errors    tracing
    ${resp}=    Trigger Error    /nonexistent    GET
    Dictionary Should Contain Key    ${resp.json()}[error]    requestId
    ${request_id}=    Set Variable    ${resp.json()}[error][requestId]
    Should Not Be Empty    ${request_id}

Error Response Has Consistent Structure
    [Documentation]    Verify all error responses follow same schema
    [Tags]    errors    schema
    ${resp}=    Trigger Error    /credentials/verify    POST    ${body}
    ${err}=    Set Variable    ${resp.json()}[error]
    Dictionary Should Contain Key    ${err}    code
    Dictionary Should Contain Key    ${err}    message
    Dictionary Should Contain Key    ${err}    type
    Dictionary Should Contain Key    ${err}    timestamp
    Dictionary Should Contain Key    ${err}    path
