*** Settings ***
Library    RequestsLibrary
Library    Collections
Resource    common.robot

Suite Setup    Create Governance Session
Suite Teardown    Delete All Sessions

*** Variables ***
${GOV_BASE}    ${BASE_URL}/api/v1/governance

*** Keywords ***
Create Governance Session
    Create Session    governance    ${BASE_URL}

Propose Resolution
    [Arguments]    ${title}    ${description}    ${voting_deadline}
    ${body}=    Create Dictionary    title=${title}    description=${description}    votingDeadline=${voting_deadline}
    ${resp}=    POST On Session    governance    ${GOV_BASE}/proposals    json=${body}
    RETURN    ${resp}

Cast Vote
    [Arguments]    ${proposal_id}    ${vote}    ${voter_did}
    ${body}=    Create Dictionary    proposalId=${proposal_id}    vote=${vote}    voterDid=${voter_did}
    ${resp}=    POST On Session    governance    ${GOV_BASE}/proposals/${proposal_id}/votes    json=${body}
    RETURN    ${resp}

Get Proposal
    [Arguments]    ${proposal_id}
    ${resp}=    GET On Session    governance    ${GOV_BASE}/proposals/${proposal_id}
    RETURN    ${resp}

Add Authority
    [Arguments]    ${did}    ${role}
    ${body}=    Create Dictionary    did=${did}    role=${role}
    ${resp}=    POST On Session    governance    ${GOV_BASE}/authorities    json=${body}
    RETURN    ${resp}

Remove Authority
    [Arguments]    ${did}
    ${resp}=    DELETE On Session    governance    ${GOV_BASE}/authorities/${did}
    RETURN    ${resp}

List Authorities
    ${resp}=    GET On Session    governance    ${GOV_BASE}/authorities
    RETURN    ${resp}

*** Test Cases ***
Create Governance Proposal
    [Documentation]    Verify a new governance proposal can be created
    [Tags]    governance    proposal    create
    ${resp}=    Propose Resolution    Upgrade Protocol v2    Upgrade to zero-knowledge proofs    2026-06-30T23:59:59Z
    Status Should Be    201    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    proposalId
    Should Be Equal    ${resp.json()}[title]    Upgrade Protocol v2

Proposal Requires Title
    [Documentation]    Verify proposal without title fails
    [Tags]    governance    proposal    validation
    ${resp}=    Propose Resolution    ${EMPTY}    Some description    2026-06-30T23:59:59Z
    Status Should Be    400    ${resp}

Cast Vote On Proposal
    [Documentation]    Verify a vote can be cast on an active proposal
    [Tags]    governance    vote    cast
    ${prop}=    Propose Resolution    Vote Test    Test description    2026-06-30T23:59:59Z
    ${prop_id}=    Set Variable    ${prop.json()}[proposalId]
    ${resp}=    Cast Vote    ${prop_id}    approve    did:example:authority1
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[vote]    approve

Vote With Invalid Proposal Fails
    [Documentation]    Verify voting on non-existent proposal fails
    [Tags]    governance    vote    error
    ${resp}=    Cast Vote    non-existent-proposal    approve    did:example:authority1
    Status Should Be    404    ${resp}

Add Authority Member
    [Documentation]    Verify authority member can be added
    [Tags]    governance    authority    add
    ${resp}=    Add Authority    did:example:new-authority    admin
    Status Should Be    201    ${resp}
    Should Be Equal    ${resp.json()}[role]    admin

Remove Authority Member
    [Documentation]    Verify authority member can be removed
    [Tags]    governance    authority    remove
    ${resp}=    Add Authority    did:example:remove-me    viewer
    ${did}=    Set Variable    ${resp.json()}[did]
    ${resp}=    Remove Authority    ${did}
    Status Should Be    200    ${resp}

List Authorities Returns Members
    [Documentation]    Verify listing authorities returns all members
    [Tags]    governance    authority    list
    ${resp}=    Add Authority    did:example:list-test    admin
    ${resp}=    List Authorities
    Status Should Be    200    ${resp}
    ${count}=    Get Length    ${resp.json()}[authorities]
    Should Be True    ${count} > 0

Duplicate Authority Fails
    [Documentation]    Verify adding duplicate authority fails
    [Tags]    governance    authority    duplicate
    ${resp}=    Add Authority    did:example:dup-authority    admin
    Status Should Be    201    ${resp}
    ${resp}=    Add Authority    did:example:dup-authority    admin
    Status Should Be    409    ${resp}
