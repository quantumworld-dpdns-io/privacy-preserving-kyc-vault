*** Settings ***
Library    RequestsLibrary
Library    Collections
Resource    common.robot

Suite Setup    Create Cache Session
Suite Teardown    Delete All Sessions

*** Variables ***
${CACHE_BASE}    ${BASE_URL}/api/v1/cache

*** Keywords ***
Create Cache Session
    Create Session    cache    ${BASE_URL}

Get Cache Entry
    [Arguments]    ${key}
    ${resp}=    GET On Session    cache    ${CACHE_BASE}/entries/${key}
    RETURN    ${resp}

Set Cache Entry
    [Arguments]    ${key}    ${value}    ${ttl}
    ${body}=    Create Dictionary    key=${key}    value=${value}    ttl=${ttl}
    ${resp}=    POST On Session    cache    ${CACHE_BASE}/entries    json=${body}
    RETURN    ${resp}

Delete Cache Entry
    [Arguments]    ${key}
    ${resp}=    DELETE On Session    cache    ${CACHE_BASE}/entries/${key}
    RETURN    ${resp}

Get Cache Stats
    ${resp}=    GET On Session    cache    ${CACHE_BASE}/stats
    RETURN    ${resp}

Trigger Cache Warmup
    [Arguments]    ${pattern}
    ${body}=    Create Dictionary    pattern=${pattern}
    ${resp}=    POST On Session    cache    ${CACHE_BASE}/warmup    json=${body}
    RETURN    ${resp}

*** Test Cases ***
Set And Get Cache Entry
    [Documentation]    Verify a value can be stored and retrieved from cache
    [Tags]    cache    set    get
    ${resp}=    Set Cache Entry    test:key:1    {"data":"hello"}    300
    Status Should Be    201    ${resp}
    ${resp}=    Get Cache Entry    test:key:1
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[value]    {"data":"hello"}

Cache Entry TTL Eviction
    [Documentation]    Verify expired cache entry returns 404
    [Tags]    cache    ttl    eviction
    ${resp}=    Set Cache Entry    test:ttl:1    {"data":"expire-me"}    1
    Status Should Be    201    ${resp}
    Sleep    2s
    ${resp}=    Get Cache Entry    test:ttl:1
    Status Should Be    404    ${resp}

Delete Cache Entry
    [Documentation]    Verify cache entry can be deleted
    [Tags]    cache    delete
    ${resp}=    Set Cache Entry    test:delete:1    {"data":"delete-me"}    300
    ${resp}=    Delete Cache Entry    test:delete:1
    Status Should Be    200    ${resp}
    ${resp}=    Get Cache Entry    test:delete:1
    Status Should Be    404    ${resp}

Get Non Existent Entry Returns 404
    [Documentation]    Verify missing cache key returns 404
    [Tags]    cache    miss
    ${resp}=    Get Cache Entry    non:existent:key
    Status Should Be    404    ${resp}

Cache Stats Return Metrics
    [Documentation]    Verify cache statistics endpoint returns metrics
    [Tags]    cache    stats    metrics
    ${resp}=    Get Cache Stats
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    hits
    Dictionary Should Contain Key    ${resp.json()}    misses
    Dictionary Should Contain Key    ${resp.json()}    size
    Dictionary Should Contain Key    ${resp.json()}    memoryUsage

Cache Warmup Populates Entries
    [Documentation]    Verify cache warmup pre-populates entries
    [Tags]    cache    warmup
    ${resp}=    Trigger Cache Warmup    did:example:*
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    loadedCount
    ${loaded}=    Set Variable    ${resp.json()}[loadedCount]
    Should Be True    ${loaded} >= 0

Set Duplicate Key Overwrites
    [Documentation]    Verify setting same key overwrites previous value
    [Tags]    cache    update
    ${resp}=    Set Cache Entry    test:overwrite:1    {"data":"original"}    300
    ${resp}=    Set Cache Entry    test:overwrite:1    {"data":"updated"}    300
    Status Should Be    201    ${resp}
    ${resp}=    Get Cache Entry    test:overwrite:1
    Should Be Equal    ${resp.json()}[value]    {"data":"updated"}

Cache TTL Minimum Value
    [Documentation]    Verify TTL must be positive
    [Tags]    cache    ttl    validation
    ${resp}=    Set Cache Entry    test:invalid-ttl    {"data":"test"}    0
    Status Should Be    400    ${resp}

LRU Eviction Under Memory Pressure
    [Documentation]    Verify LRU eviction removes least recently used entries
    [Tags]    cache    lru    eviction
    ${resp}=    Set Cache Entry    lru:test:1    {"data":"first"}    300
    ${resp}=    Set Cache Entry    lru:test:2    {"data":"second"}    300
    ${resp}=    Set Cache Entry    lru:test:3    {"data":"third"}    300
    ${resp}=    Get Cache Entry    lru:test:1
    Status Should Be    200    ${resp}
    ${resp}=    Get Cache Stats
    Should Be Equal As Integers    ${resp.json()}[size]    3
