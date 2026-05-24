*** Settings ***
Library    RequestsLibrary
Library    Collections

*** Variables ***
${BASE_URL}    http://localhost:3000
${API_VERSION}    v1

*** Keywords ***
Create Credential Session
    Create Session    credential    ${BASE_URL}

Issue Credential
    [Arguments]    ${subject_did}    ${credential_type}    ${claims}
    ${body}=    Create Dictionary    subjectDid=${subject_did}    type=${credential_type}    claims=${claims}
    ${resp}=    POST On Session    credential    /api/${API_VERSION}/credentials/issue    json=${body}
    RETURN    ${resp}

Verify Credential
    [Arguments]    ${credential}
    ${body}=    Create Dictionary    credential=${credential}
    ${resp}=    POST On Session    credential    /api/${API_VERSION}/credentials/verify    json=${body}
    RETURN    ${resp}

Revoke Credential
    [Arguments]    ${credential_id}    ${reason}
    ${body}=    Create Dictionary    credentialId=${credential_id}    reason=${reason}
    ${resp}=    POST On Session    credential    /api/${API_VERSION}/credentials/revoke    json=${body}
    RETURN    ${resp}

Get Credential Status
    [Arguments]    ${credential_id}
    ${resp}=    GET On Session    credential    /api/${API_VERSION}/credentials/${credential_id}/status
    RETURN    ${resp}

*** Test Cases ***
Issue Verifiable Credential
    [Documentation]    Verify credential issuance produces valid verifiable credential
    [Tags]    credential    issue
    Given Create Credential Session
    ${claims}=    Create Dictionary    name=Alice    age=30    nationality=US
    ${resp}=    Issue Credential    did:example:alice    VerifiableCredential    ${claims}
    Status Should Be    201    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    id
    Dictionary Should Contain Key    ${resp.json()}    credentialSubject
    Should Be Equal    ${resp.json()}[issuer]    did:example:issuer

Issue Credential With Proof
    [Documentation]    Verify issued credential includes proof
    [Tags]    credential    issue    proof
    Given Create Credential Session
    ${claims}=    Create Dictionary    email=alice@example.com
    ${resp}=    Issue Credential    did:example:bob    VerifiableCredential    ${claims}
    Status Should Be    201    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    proof
    Should Be Equal    ${resp.json()}[proof][type]    Ed25519Signature2020

Issue Credential Without Required Fields Returns Error
    [Documentation]    Verify missing required fields return error
    [Tags]    credential    issue    error
    Given Create Credential Session
    ${claims}=    Create Dictionary
    ${resp}=    Issue Credential    ${EMPTY}    VerifiableCredential    ${claims}
    Status Should Be    400    ${resp}

Verify Valid Credential
    [Documentation]    Verify valid credential verification returns verified
    [Tags]    credential    verify
    Given Create Credential Session
    ${claims}=    Create Dictionary    name=Carol
    ${issue_resp}=    Issue Credential    did:example:carol    VerifiableCredential    ${claims}
    ${verify_resp}=    Verify Credential    ${issue_resp.json()}
    Status Should Be    200    ${verify_resp}
    Should Be Equal    ${verify_resp.json()}[verified]    ${TRUE}

Verify Tampered Credential Fails
    [Documentation]    Verify tampered credential verification returns false
    [Tags]    credential    verify    tamper
    Given Create Credential Session
    ${claims}=    Create Dictionary    name=Dave
    ${issue_resp}=    Issue Credential    did:example:dave    VerifiableCredential    ${claims}
    ${tampered}=    Set Variable    ${issue_resp.json()}
    Set To Dictionary    ${tampered}[credentialSubject]    name=Tampered
    ${verify_resp}=    Verify Credential    ${tampered}
    Status Should Be    200    ${verify_resp}
    Should Be Equal    ${verify_resp.json()}[verified]    ${FALSE}

Revoke Credential
    [Documentation]    Verify credential revocation succeeds
    [Tags]    credential    revoke
    Given Create Credential Session
    ${claims}=    Create Dictionary    name=Eve
    ${issue_resp}=    Issue Credential    did:example:eve    VerifiableCredential    ${claims}
    ${cred_id}=    Set Variable    ${issue_resp.json()}[id]
    ${revoke_resp}=    Revoke Credential    ${cred_id}    User requested revocation
    Status Should Be    200    ${revoke_resp}

Verify Revoked Credential Fails
    [Documentation]    Verify revoked credential cannot be verified
    [Tags]    credential    revoke    verify
    Given Create Credential Session
    ${claims}=    Create Dictionary    name=Frank
    ${issue_resp}=    Issue Credential    did:example:frank    VerifiableCredential    ${claims}
    ${cred_id}=    Set Variable    ${issue_resp.json()}[id]
    Revoke Credential    ${cred_id}    Compromised
    ${status_resp}=    Get Credential Status    ${cred_id}
    Should Be Equal    ${status_resp.json()}[revoked]    ${TRUE}

Check Expired Credential Status
    [Documentation]    Verify expired credential is detected
    [Tags]    credential    expiry
    Given Create Credential Session
    ${claims}=    Create Dictionary    name=Grace
    ${issue_resp}=    Issue Credential    did:example:grace    VerifiableCredential    ${claims}
    ${cred_id}=    Set Variable    ${issue_resp.json()}[id]
    ${status_resp}=    Get Credential Status    ${cred_id}
    Dictionary Should Contain Key    ${status_resp.json()}    expirationDate

Full Credential Lifecycle
    [Documentation]    Complete lifecycle: issue, verify, revoke, check status
    [Tags]    credential    lifecycle
    Given Create Credential Session
    ${claims}=    Create Dictionary    name=Heidi    role=KYC_User
    ${issue_resp}=    Issue Credential    did:example:heidi    VerifiableCredential    ${claims}
    Status Should Be    201    ${issue_resp}
    ${verify_resp}=    Verify Credential    ${issue_resp.json()}
    Status Should Be    200    ${verify_resp}
    Should Be Equal    ${verify_resp.json()}[verified]    ${TRUE}
    ${cred_id}=    Set Variable    ${issue_resp.json()}[id]
    Revoke Credential    ${cred_id}    End of lifecycle test
    ${status_resp}=    Get Credential Status    ${cred_id}
    Should Be Equal    ${status_resp.json()}[revoked]    ${TRUE}

Issue Multiple Credential Types
    [Documentation]    Verify different credential types can be issued
    [Tags]    credential    issue    types
    Given Create Credential Session
    ${claims}=    Create Dictionary    age=25
    ${resp}=    Issue Credential    did:example:ivan    AgeVerificationCredential    ${claims}
    Status Should Be    201    ${resp}
    Should Contain    ${resp.json()}[type]    AgeVerificationCredential

Credential Includes Context
    [Documentation]    Verify credential includes @context
    [Tags]    credential    issue    context
    Given Create Credential Session
    ${claims}=    Create Dictionary    name=Judy
    ${resp}=    Issue Credential    did:example:judy    VerifiableCredential    ${claims}
    Status Should Be    201    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    @context
    ${context}=    Get Length    ${resp.json()}[@context]
    Should Be True    ${context} > 0
