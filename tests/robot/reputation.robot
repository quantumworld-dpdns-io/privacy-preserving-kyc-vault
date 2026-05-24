*** Settings ***
Library    RequestsLibrary
Library    Collections
Resource    common.robot

Suite Setup    Create Reputation Session
Suite Teardown    Delete All Sessions

*** Variables ***
${REP_BASE}    ${BASE_URL}/api/v1/reputation

*** Keywords ***
Create Reputation Session
    Create Session    reputation    ${BASE_URL}

Get Reputation Score
    [Arguments]    ${did}
    ${resp}=    GET On Session    reputation    ${REP_BASE}/scores/${did}
    RETURN    ${resp}

Submit Feedback
    [Arguments]    ${target_did}    ${rating}    ${comment}    ${source_did}
    ${body}=    Create Dictionary    targetDid=${target_did}    rating=${rating}    comment=${comment}    sourceDid=${source_did}
    ${resp}=    POST On Session    reputation    ${REP_BASE}/feedback    json=${body}
    RETURN    ${resp}

Get Trust Graph
    [Arguments]    ${did}
    ${resp}=    GET On Session    reputation    ${REP_BASE}/trust-graph/${did}
    RETURN    ${resp}

Get Feedback History
    [Arguments]    ${did}
    ${resp}=    GET On Session    reputation    ${REP_BASE}/feedback/${did}
    RETURN    ${resp}

*** Test Cases ***
Retrieve Reputation Score
    [Documentation]    Verify a DID has an initial reputation score
    [Tags]    reputation    score    read
    ${resp}=    Get Reputation Score    did:example:user1
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    score
    Dictionary Should Contain Key    ${resp.json()}    confidence

Reputation Score In Range
    [Documentation]    Verify reputation score is between 0 and 100
    [Tags]    reputation    score    range
    ${resp}=    Get Reputation Score    did:example:user1
    ${score}=    Set Variable    ${resp.json()}[score]
    Should Be True    ${score} >= 0
    Should Be True    ${score} <= 100

Submit Feedback Increases Score
    [Documentation]    Verify submitting positive feedback increases reputation
    [Tags]    reputation    feedback    submit
    ${before}=    Get Reputation Score    did:example:feedback-target
    ${score_before}=    Set Variable    ${before.json()}[score]
    ${resp}=    Submit Feedback    did:example:feedback-target    5    Great collaborator    did:example:reviewer1
    Status Should Be    201    ${resp}
    ${after}=    Get Reputation Score    did:example:feedback-target
    ${score_after}=    Set Variable    ${after.json()}[score]
    Should Be True    ${score_after} >= ${score_before}

Submit Negative Feedback Decreases Score
    [Documentation]    Verify negative feedback decreases reputation
    [Tags]    reputation    feedback    negative
    ${before}=    Get Reputation Score    did:example:neg-target
    ${score_before}=    Set Variable    ${before.json()}[score]
    ${resp}=    Submit Feedback    did:example:neg-target    1    Poor experience    did:example:reviewer2
    Status Should Be    201    ${resp}
    ${after}=    Get Reputation Score    did:example:neg-target
    ${score_after}=    Set Variable    ${after.json()}[score]
    Should Be True    ${score_after} < ${score_before}

Feedback With Invalid Rating Fails
    [Documentation]    Verify rating outside 1-5 range fails
    [Tags]    reputation    feedback    validation
    ${resp}=    Submit Feedback    did:example:bad-rating    6    Invalid    did:example:reviewer3
    Status Should Be    400    ${resp}

Retrieve Trust Graph
    [Documentation]    Verify trust graph returns connections
    [Tags]    reputation    trustgraph    read
    ${resp}=    Get Trust Graph    did:example:user1
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    nodes
    Dictionary Should Contain Key    ${Resp.json()}    edges

Trust Graph Contains Weighted Edges
    [Documentation]    Verify trust graph edges have weights
    [Tags]    reputation    trustgraph    edges
    ${resp}=    Get Trust Graph    did:example:user1
    ${edges}=    Set Variable    ${resp.json()}[edges]
    FOR    ${edge}    IN    @{edges}
        Dictionary Should Contain Key    ${edge}    weight
        Dictionary Should Contain Key    ${edge}    source
        Dictionary Should Contain Key    ${edge}    target
    END

Feedback History Pagination
    [Documentation]    Verify feedback history returns paginated results
    [Tags]    reputation    feedback    history
    ${resp}=    Get Feedback History    did:example:user1
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    feedback
    Dictionary Should Contain Key    ${resp.json()}    total

Score For Unknown DID Initializes
    [Documentation]    Verify unknown DID initializes at neutral score
    [Tags]    reputation    score    init
    ${resp}=    Get Reputation Score    did:example:never-seen-before
    Status Should Be    200    ${resp}
    ${score}=    Set Variable    ${resp.json()}[score]
    Should Be Equal As Integers    ${score}    50
