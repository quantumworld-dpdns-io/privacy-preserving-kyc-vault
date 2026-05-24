*** Settings ***
Library    RequestsLibrary
Library    Collections

*** Variables ***
${BASE_URL}    http://localhost:3000

*** Test Cases ***
Generate Age Verification Proof
    [Documentation]    ZKP proof generation for age >= 21
    Given Create Session    zkp    ${BASE_URL}
    ${body}=    Create Dictionary
    ...    circuit_id=age_verification
    ...    public_inputs=["25","21"]
    ${resp}=    POST On Session    zkp    /api/v1/zkp/generate    json=${body}
    Should Be Equal As Numbers    ${resp.status_code}    200
    Dictionary Should Contain Key    ${resp.json()}    proof_id

Verify Age Verification Proof
    [Documentation]    ZKP proof verification
    Given Generate Age Verification Proof
    ${proof}=    POST On Session    zkp    /api/v1/zkp/generate    json=${body}
    ${verify_body}=    Create Dictionary    proof=${proof.json()}[proof]
    ${resp}=    POST On Session    zkp    /api/v1/zkp/verify    json=${verify_body}
    Should Be Equal As Strings    ${resp.json()}[verified]    True

Selective Disclosure Test
    [Documentation]    Verify selective disclosure works
    Given I have a credential with multiple attributes
    When I request disclosure of only "age" field
    Then Response should include "age" but not "fullName" or "address"

Zero-Knowledge Range Proof
    [Documentation]    Range proof for income verification
    ${body}=    Create Dictionary
    ...    circuit_id=range_proof
    ...    public_inputs=["0","100000"]
    ${resp}=    POST On Session    zkp    /api/v1/zkp/generate    json=${body}
    Should Be Equal As Numbers    ${resp.status_code}    200
