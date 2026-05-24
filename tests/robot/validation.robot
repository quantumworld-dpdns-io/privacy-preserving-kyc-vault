*** Settings ***
Library    RequestsLibrary
Library    Collections
Resource    common.robot

Suite Setup    Create Validation Session
Suite Teardown    Delete All Sessions

*** Variables ***
${API_BASE}    ${BASE_URL}/api/v1

*** Keywords ***
Create Validation Session
    Create Session    validation    ${BASE_URL}

Send Validation Request
    [Arguments]    ${endpoint}    ${method}=POST    ${body}=${NONE}
    ${resp}=    POST On Session    validation    ${API_BASE}${endpoint}    json=${body}    expected_status=any
    RETURN    ${resp}

*** Test Cases ***
Empty String Rejected
    [Documentation]    Verify empty strings are rejected across all domains
    [Tags]    validation    empty
    ${body}=    Create Dictionary    did=${EMPTY}    credentialType=AgeVerificationCredential
    ${resp}=    Send Validation Request    /credentials/issue    POST    ${body}
    Status Should Be    400    ${resp}
    Should Contain    ${resp.json()}[error][type]    VALIDATION_ERROR

Missing Required Fields
    [Documentation]    Verify missing required fields return validation error
    [Tags]    validation    required
    ${body}=    Create Dictionary    incomplete=payload
    ${resp}=    Send Validation Request    /kyc/workflows    POST    ${body}
    Status Should Be    400    ${resp}
    Dictionary Should Contain Key    ${resp.json()}[error]    details
    ${details}=    Get Length    ${resp.json()}[error][details]
    Should Be True    ${details} > 0

Invalid Did Format
    [Documentation]    Verify invalid DID format is rejected
    [Tags]    validation    did
    ${body}=    Create Dictionary    did=not-a-valid-did
    ${resp}=    Send Validation Request    /did/resolve    POST    ${body}
    Status Should Be    400    ${resp}

Invalid Email Format
    [Documentation]    Verify invalid email format is rejected
    [Tags]    validation    email
    ${body}=    Create Dictionary    email=not-an-email    did=did:example:test
    ${resp}=    Send Validation Request    /credentials/issue    POST    ${body}
    Status Should Be    400    ${resp}

Field Exceeds Max Length
    [Documentation]    Verify strings exceeding maximum length are rejected
    [Tags]    validation    length
    ${long_str}=    Evaluate    'A' * 10000
    ${body}=    Create Dictionary    did=did:example:test    description=${long_str}
    ${resp}=    Send Validation Request    /kyc/workflows    POST    ${body}
    Status Should Be    400    ${resp}

Negative Numeric Values
    [Documentation]    Verify negative numeric values are rejected where inappropriate
    [Tags]    validation    numeric
    ${body}=    Create Dictionary    did=did:example:test    amount=-100
    ${resp}=    Send Validation Request    /credentials/issue    POST    ${body}
    Status Should Be    400    ${resp}

Invalid Json Body
    [Documentation]    Verify malformed JSON body is rejected
    [Tags]    validation    json
    ${resp}=    POST On Session    validation    ${API_BASE}/credentials/verify    data={invalid json}    expected_status=any
    Status Should Be    400    ${resp}

Unsupported Credential Type
    [Documentation]    Verify unsupported credential type is rejected
    [Tags]    validation    credential
    ${body}=    Create Dictionary    did=did:example:test    credentialType=UnsupportedType
    ${resp}=    Send Validation Request    /credentials/issue    POST    ${body}
    Status Should Be    400    ${resp}

Invalid Enum Value
    [Documentation]    Verify invalid enum values are rejected
    [Tags]    validation    enum
    ${body}=    Create Dictionary    status=invalid_status    did=did:example:test
    ${resp}=    Send Validation Request    /kyc/workflows    POST    ${body}
    Status Should Be    400    ${resp}

Extra Unknown Fields Rejected
    [Documentation]    Verify unknown fields in request body are rejected
    [Tags]    validation    unknown
    ${body}=    Create Dictionary    did=did:example:valid    unknownField=shouldNotBeHere    anotherBadField=alsoBad
    ${resp}=    Send Validation Request    /credentials/verify    POST    ${body}
    Status Should Be    400    ${resp}

Invalid Array Elements
    [Documentation]    Verify arrays with invalid elements are rejected
    [Tags]    validation    array
    ${invalid_list}=    Create List    ${EMPTY}    ${NONE}
    ${body}=    Create Dictionary    dids=${invalid_list}
    ${resp}=    Send Validation Request    /did/batch-resolve    POST    ${body}
    Status Should Be    400    ${resp}
