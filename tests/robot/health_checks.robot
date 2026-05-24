*** Settings ***
Library    RequestsLibrary
Library    Collections
Resource    common.robot

Suite Setup    Create Health Session
Suite Teardown    Delete All Sessions

*** Variables ***
${HEALTH_BASE}    ${BASE_URL}/healthz

*** Keywords ***
Create Health Session
    Create Session    health    ${BASE_URL}

Get Liveness Probe
    ${resp}=    GET On Session    health    ${HEALTH_BASE}/live
    RETURN    ${resp}

Get Readiness Probe
    ${resp}=    GET On Session    health    ${HEALTH_BASE}/ready
    RETURN    ${resp}

Get Startup Probe
    ${resp}=    GET On Session    health    ${HEALTH_BASE}/startup
    RETURN    ${resp}

Get Deep Health
    ${resp}=    GET On Session    health    ${HEALTH_BASE}/deep
    RETURN    ${resp}

Get Database Health
    ${resp}=    GET On Session    health    ${HEALTH_BASE}/database
    RETURN    ${resp}

Get Cache Health
    ${resp}=    GET On Session    health    ${HEALTH_BASE}/cache
    RETURN    ${resp}

Get External Dependencies Health
    ${resp}=    GET On Session    health    ${HEALTH_BASE}/dependencies
    RETURN    ${resp}

*** Test Cases ***
Liveness Probe Returns Ok
    [Documentation]    Verify liveness probe returns healthy status
    [Tags]    health    liveness
    ${resp}=    Get Liveness Probe
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    ok

Readiness Probe Returns Ok
    [Documentation]    Verify readiness probe returns ready status
    [Tags]    health    readiness
    ${resp}=    Get Readiness Probe
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    ok

Startup Probe Returns Ok
    [Documentation]    Verify startup probe returns started status
    [Tags]    health    startup
    ${resp}=    Get Startup Probe
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    ok

Deep Health Returns Component Status
    [Documentation]    Verify deep health endpoint returns all component statuses
    [Tags]    health    deep
    ${resp}=    Get Deep Health
    Status Should Be    200    ${resp}
    ${components}=    Set Variable    ${resp.json()}[components]
    Dictionary Should Contain Key    ${components}    api
    Dictionary Should Contain Key    ${components}    database
    Dictionary Should Contain Key    ${components}    cache

Database Health Check
    [Documentation]    Verify database health endpoint
    [Tags]    health    database
    ${resp}=    Get Database Health
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    ok
    Dictionary Should Contain Key    ${resp.json()}    latencyMs
    Dictionary Should Contain Key    ${resp.json()}    connections

Cache Health Check
    [Documentation]    Verify cache health endpoint
    [Tags]    health    cache
    ${resp}=    Get Cache Health
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    ok
    Dictionary Should Contain Key    ${resp.json()}    hitRate
    Should Be True    ${resp.json()}[hitRate] >= 0.0

External Dependencies Health
    [Documentation]    Verify external dependencies health endpoint
    [Tags]    health    dependencies
    ${resp}=    Get External Dependencies Health
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    dependencies
    ${deps}=    Set Variable    ${resp.json()}[dependencies]
    ${count}=    Get Length    ${deps}
    Should Be True    ${count} > 0

All Probes Return In Under 500ms
    [Documentation]    Verify all probes respond within acceptable time
    [Tags]    health    performance
    ${resp}=    Get Liveness Probe
    Should Be True    ${resp.elapsed.total_seconds()} < 0.5
    ${resp}=    Get Readiness Probe
    Should Be True    ${resp.elapsed.total_seconds()} < 0.5
    ${resp}=    Get Startup Probe
    Should Be True    ${resp.elapsed.total_seconds()} < 0.5

Health Endpoint Returns Json Content Type
    [Documentation]    Verify health endpoints return JSON content type
    [Tags]    health    headers
    ${resp}=    Get Deep Health
    Should Contain    ${resp.headers}[Content-Type]    application/json
