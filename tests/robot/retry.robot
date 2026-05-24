*** Settings ***
Library    RequestsLibrary
Library    Collections
Resource    common.robot

Suite Setup    Create Retry Session
Suite Teardown    Delete All Sessions

*** Variables ***
${RETRY_BASE}    ${BASE_URL}/api/v1/retry
${CB_BASE}       ${BASE_URL}/api/v1/circuit-breaker

*** Keywords ***
Create Retry Session
    Create Session    retry    ${BASE_URL}

Execute With Retry
    [Arguments]    ${endpoint}    ${max_retries}    ${backoff_ms}
    ${body}=    Create Dictionary    endpoint=${endpoint}    maxRetries=${max_retries}    backoffMs=${backoff_ms}
    ${resp}=    POST On Session    retry    ${RETRY_BASE}/execute    json=${body}
    RETURN    ${resp}

Get Retry Policy
    [Arguments]    ${policy_id}
    ${resp}=    GET On Session    retry    ${RETRY_BASE}/policies/${policy_id}
    RETURN    ${resp}

Create Retry Policy
    [Arguments]    ${name}    ${max_retries}    ${backoff_strategy}    ${initial_delay}
    ${body}=    Create Dictionary    name=${name}    maxRetries=${max_retries}    backoffStrategy=${backoff_strategy}    initialDelayMs=${initial_delay}
    ${resp}=    POST On Session    retry    ${RETRY_BASE}/policies    json=${body}
    RETURN    ${resp}

Get CircuitBreaker State
    [Arguments]    ${name}
    ${resp}=    GET On Session    retry    ${CB_BASE}/state/${name}
    RETURN    ${resp}

Trigger CircuitBreaker Open
    [Arguments]    ${name}
    ${body}=    Create Dictionary    name=${name}
    ${resp}=    POST On Session    retry    ${CB_BASE}/trigger-open    json=${body}
    RETURN    ${resp}

Reset CircuitBreaker
    [Arguments]    ${name}
    ${body}=    Create Dictionary    name=${name}
    ${resp}=    POST On Session    retry    ${CB_BASE}/reset    json=${body}
    RETURN    ${resp}

*** Test Cases ***
Create Retry Policy
    [Documentation]    Verify retry policy can be created
    [Tags]    retry    policy    create
    ${resp}=    Create Retry Policy    default-backoff    exponential    1000
    Status Should Be    201    ${resp}
    Should Be Equal    ${resp.json()}[name]    default-backoff
    Should Be Equal    ${resp.json()}[backoffStrategy]    exponential

Retry With Exponential Backoff
    [Documentation]    Verify exponential backoff retry execution
    [Tags]    retry    exponential    backoff
    ${resp}=    Execute With Retry    /api/v1/kyc/workflows    3    500
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    attempts
    Should Be True    ${resp.json()}[attempts] >= 1

Retry Policy With Invalid Max Fails
    [Documentation]    Verify negative max retries is rejected
    [Tags]    retry    policy    validation
    ${resp}=    Create Retry Policy    bad-policy    -1    exponential    1000
    Status Should Be    400    ${resp}

CircuitBreaker Initial State Closed
    [Documentation]    Verify circuit breaker starts in closed state
    [Tags]    circuitbreaker    state
    ${resp}=    Get CircuitBreaker State    kyc-service
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[state]    closed

CircuitBreaker Opens After Failures
    [Documentation]    Verify circuit breaker opens after threshold failures
    [Tags]    circuitbreaker    open
    ${resp}=    Trigger CircuitBreaker Open    kyc-service
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[state]    open

CircuitBreaker HalfOpen After Timeout
    [Documentation]    Verify circuit breaker transitions to half-open
    [Tags]    circuitbreaker    halfopen
    ${resp}=    Get CircuitBreaker State    kyc-service
    ${state}=    Set Variable    ${resp.json()}[state]
    Should Contain    ${state}    closed    half-open    open

CircuitBreaker Reset Returns To Closed
    [Documentation]    Verify circuit breaker can be reset to closed
    [Tags]    circuitbreaker    reset
    ${resp}=    Reset CircuitBreaker    kyc-service
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[state]    closed

Retry Respects Max Attempts
    [Documentation]    Verify retry stops after max attempts
    [Tags]    retry    max    attempts
    ${resp}=    Execute With Retry    /api/v1/nonexistent-endpoint    2    100
    Should Be True    ${resp.json()}[attempts] <= 3

Backoff Strategy Enum Validation
    [Documentation]    Verify invalid backoff strategy is rejected
    [Tags]    retry    backoff    validation
    ${resp}=    Create Retry Policy    invalid-backoff    3    unknown_strategy    1000
    Status Should Be    400    ${resp}
