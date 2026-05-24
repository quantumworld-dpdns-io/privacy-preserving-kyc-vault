*** Settings ***
Library    RequestsLibrary
Library    Collections
Resource    common.robot

Suite Setup    Create Oracle Session
Suite Teardown    Delete All Sessions

*** Variables ***
${ORACLE_BASE}    ${BASE_URL}/api/v1/oracle

*** Keywords ***
Create Oracle Session
    Create Session    oracle    ${BASE_URL}

Get Price Feed
    [Arguments]    ${asset_pair}
    ${resp}=    GET On Session    oracle    ${ORACLE_BASE}/prices/${asset_pair}
    RETURN    ${resp}

Run Sanctions Check
    [Arguments]    ${did}    ${jurisdiction}
    ${body}=    Create Dictionary    did=${did}    jurisdiction=${jurisdiction}
    ${resp}=    POST On Session    oracle    ${ORACLE_BASE}/sanctions    json=${body}
    RETURN    ${resp}

Get Credit Score
    [Arguments]    ${did}
    ${resp}=    GET On Session    oracle    ${ORACLE_BASE}/credit/${did}
    RETURN    ${resp}

Get Oracle Status
    ${resp}=    GET On Session    oracle    ${ORACLE_BASE}/status
    RETURN    ${resp}

*** Test Cases ***
Get Price Feed Returns Current Price
    [Documentation]    Verify price feed returns current price for asset pair
    [Tags]    oracle    prices    read
    ${resp}=    Get Price Feed    ETH/USD
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    price
    Dictionary Should Contain Key    ${resp.json()}    timestamp
    Dictionary Should Contain Key    ${resp.json()}    source

Price Feed Value Is Positive
    [Documentation]    Verify returned price is a positive number
    [Tags]    oracle    prices    validation
    ${resp}=    Get Price Feed    BTC/USD
    ${price}=    Set Variable    ${resp.json()}[price]
    Should Be True    ${price} > 0

Price Feed For Unknown Asset Fails
    [Documentation]    Verify unknown asset pair returns 404
    [Tags]    oracle    prices    error
    ${resp}=    Get Price Feed    UNKNOWN/XYZ
    Status Should Be    404    ${resp}

Sanctions Check Returns Clear
    [Documentation]    Verify sanctions check returns clear for clean DID
    [Tags]    oracle    sanctions    clear
    ${resp}=    Run Sanctions Check    did:example:clean-entity    US
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    clear

Sanctions Check Flags Entity
    [Documentation]    Verify sanctions check flags sanctioned entities
    [Tags]    oracle    sanctions    flagged
    ${resp}=    Run Sanctions Check    did:example:ofac-listed    US
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    flagged
    Should Contain    ${resp.json()}    matches

Sanctions Check Invalid Jurisdiction
    [Documentation]    Verify invalid jurisdiction returns 400
    [Tags]    oracle    sanctions    validation
    ${resp}=    Run Sanctions Check    did:example:test    XX
    Status Should Be    400    ${resp}

Get Credit Score Returns Data
    [Documentation]    Verify credit score endpoint returns score data
    [Tags]    oracle    credit    read
    ${resp}=    Get Credit Score    did:example:borrower1
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    score
    Dictionary Should Contain Key    ${resp.json()}    tier
    Should Contain    ${resp.json()}[tier]    excellent    good    fair    poor

Credit Score In Range
    [Documentation]    Verify credit score is between 300 and 850
    [Tags]    oracle    credit    range
    ${resp}=    Get Credit Score    did:example:borrower2
    ${score}=    Set Variable    ${resp.json()}[score]
    Should Be True    ${score} >= 300
    Should Be True    ${score} <= 850

Oracle Status Returns Healthy
    [Documentation]    Verify oracle service reports healthy status
    [Tags]    oracle    status    health
    ${resp}=    Get Oracle Status
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    healthy
    Dictionary Should Contain Key    ${resp.json()}    uptime
    Dictionary Should Contain Key    ${resp.json()}    lastSync
