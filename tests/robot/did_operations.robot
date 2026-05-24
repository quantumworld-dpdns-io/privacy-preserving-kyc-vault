*** Settings ***
Library    RequestsLibrary
Library    Collections

*** Variables ***
${BASE_URL}    http://localhost:3000
${API_VERSION}    v1

*** Keywords ***
Create DID Session
    Create Session    did    ${BASE_URL}

Resolve DID
    [Arguments]    ${did}
    ${resp}=    GET On Session    did    /api/${API_VERSION}/did/resolve/${did}
    RETURN    ${resp}

Batch Resolve DIDs
    [Arguments]    ${dids}
    ${body}=    Create Dictionary    dids=${dids}
    ${resp}=    POST On Session    did    /api/${API_VERSION}/did/batch-resolve    json=${body}
    RETURN    ${resp}

*** Test Cases ***
Resolve DID Key Method
    [Documentation]    Verify DID key method resolution returns 200
    [Tags]    did    resolve    key
    Given Create DID Session
    ${resp}=    Resolve DID    did:key:z6MkfTestKey123
    Status Should Be    200    ${resp}
    Should Contain    ${resp.json()}[id]    did:key
    Dictionary Should Contain Key    ${resp.json()}    verificationMethod
    Dictionary Should Contain Key    ${resp.json()}    authentication

Resolve DID Web Method
    [Documentation]    Verify DID web method resolution
    [Tags]    did    resolve    web
    Given Create DID Session
    ${resp}=    Resolve DID    did:web:example.com
    Status Should Be    200    ${resp}
    Should Contain    ${resp.json()}[id]    did:web

Resolve DID Ethr Method
    [Documentation]    Verify DID ethr method resolution
    [Tags]    did    resolve    ethr
    Given Create DID Session
    ${resp}=    Resolve DID    did:ethr:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
    Status Should Be    200    ${resp}
    Should Contain    ${resp.json()}[id]    did:ethr

Resolve DID Returns Verification Method
    [Documentation]    Verify resolved DID includes verification method
    [Tags]    did    resolve    verification
    Given Create DID Session
    ${resp}=    Resolve DID    did:key:z6MkfVerifyKey
    Status Should Be    200    ${resp}
    ${vm}=    Get Length    ${resp.json()}[verificationMethod]
    Should Be True    ${vm} > 0
    Should Contain    ${resp.json()}[verificationMethod][0][type]    Ed25519VerificationKey2020

Resolve Invalid DID Returns 400
    [Documentation]    Verify invalid DID format returns 400
    [Tags]    did    error    invalid
    Given Create DID Session
    ${resp}=    Resolve DID    not-a-did
    Status Should Be    400    ${resp}

Resolve Empty DID Returns 400
    [Documentation]    Verify empty DID returns 400
    [Tags]    did    error    empty
    Given Create DID Session
    ${resp}=    Resolve DID    ${EMPTY}
    Status Should Be    400    ${resp}

Resolve Unsupported Method Returns 400
    [Documentation]    Verify unsupported DID method returns error
    [Tags]    did    error    unsupported
    Given Create DID Session
    ${resp}=    Resolve DID    did:unsupported:abc123
    Status Should Be    400    ${resp}

Batch Resolve Multiple DIDs
    [Documentation]    Verify batch resolve returns results for all DIDs
    [Tags]    did    batch    resolve
    Given Create DID Session
    ${dids}=    Create List    did:key:z6MkfA    did:key:z6MkfB
    ${resp}=    Batch Resolve DIDs    ${dids}
    Status Should Be    200    ${resp}
    ${results}=    Get Length    ${resp.json()}[results]
    Should Be Equal As Integers    ${results}    2

Batch Resolve Empty List
    [Documentation]    Verify batch resolve with empty list
    [Tags]    did    batch    error
    Given Create DID Session
    ${dids}=    Create List
    ${resp}=    Batch Resolve DIDs    ${dids}
    Status Should Be    400    ${resp}

Resolve DID Includes Created Timestamp
    [Documentation]    Verify resolved DID includes metadata
    [Tags]    did    resolve    metadata
    Given Create DID Session
    ${resp}=    Resolve DID    did:key:z6MkfMetaTest
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    created

Resolve DID With Path Segments
    [Documentation]    Verify DID with path resolves correctly
    [Tags]    did    resolve    path
    Given Create DID Session
    ${resp}=    Resolve DID    did:web:example.com:path:service
    Status Should Be    200    ${resp}
    Should Contain    ${resp.json()}[id]    did:web
