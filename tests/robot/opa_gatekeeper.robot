*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create Gatekeeper Session
Suite Teardown    Delete All Sessions

*** Variables ***
${GATE_BASE}    ${BASE_URL}/api/v1/gatekeeper
${GATE_DIR}     ${BASE_DIR}/deploy/gatekeeper

*** Keywords ***
Create Gatekeeper Session
    Create Session    gatekeeper    ${BASE_URL}

Get ConstraintTemplate
    [Arguments]    ${name}
    ${resp}=    GET On Session    gatekeeper    ${GATE_BASE}/constraint-templates/${name}
    RETURN    ${resp}

List ConstraintTemplates
    ${resp}=    GET On Session    gatekeeper    ${GATE_BASE}/constraint-templates
    RETURN    ${resp}

Create ConstraintTemplate
    [Arguments]    ${name}    ${rego}
    ${body}=    Create Dictionary    name=${name}    rego=${rego}
    ${resp}=    POST On Session    gatekeeper    ${GATE_BASE}/constraint-templates    json=${body}
    RETURN    ${resp}

Get Constraint
    [Arguments]    ${name}
    ${resp}=    GET On Session    gatekeeper    ${GATE_BASE}/constraints/${name}
    RETURN    ${resp}

List Constraints
    ${resp}=    GET On Session    gatekeeper    ${GATE_BASE}/constraints
    RETURN    ${resp}

Validate Against Constraint
    [Arguments]    ${constraint_name}    ${resource}
    ${body}=    Create Dictionary    constraint=${constraint_name}    resource=${resource}
    ${resp}=    POST On Session    gatekeeper    ${GATE_BASE}/validate    json=${body}
    RETURN    ${resp}

Get Audit Results
    ${resp}=    GET On Session    gatekeeper    ${GATE_BASE}/audit
    RETURN    ${resp}

*** Test Cases ***
Gatekeeper Directory Exists
    [Documentation]    Verify Gatekeeper manifest directory exists
    [Tags]    opa    gatekeeper    structure
    Directory Should Exist    ${GATE_DIR}

ConstraintTemplate Manifest Exists
    [Documentation]    Verify constraint template manifest exists
    [Tags]    opa    gatekeeper    template
    File Should Exist    ${GATE_DIR}/constraint-template.yaml

Get ConstraintTemplate Details
    [Documentation]    Verify constraint template endpoint returns rego
    [Tags]    opa    gatekeeper    template    detail
    ${resp}=    Get ConstraintTemplate    k8srequiredlabels
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    rego
    Should Contain    ${resp.json()}[rego]    violation

List ConstraintTemplates Returns Items
    [Documentation]    Verify list constraint templates returns items
    [Tags]    opa    gatekeeper    template    list
    ${resp}=    List ConstraintTemplates
    Status Should Be    200    ${resp}
    ${count}=    Get Length    ${resp.json()}[constraintTemplates]
    Should Be True    ${count} > 0

Create ConstraintTemplate
    [Documentation]    Verify constraint template can be created
    [Tags]    opa    gatekeeper    template    create
    ${rego}=    Set Variable    package k8srequiredlabels\nviolation[{"msg": msg}] {\n  input.request.object.metadata.labels\n  not input.request.object.metadata.labels["kyc-vault"}\n  msg := "Missing kyc-vault label"\n}
    ${resp}=    Create ConstraintTemplate    require-kyc-label    ${rego}
    Status Should Be    201    ${resp}

Get Constraint Details
    [Documentation]    Verify constraint endpoint returns enforcement
    [Tags]    opa    gatekeeper    constraint    detail
    ${resp}=    Get Constraint    require-kyc-label
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    enforcementAction
    Dictionary Should Contain Key    ${resp.json()}    match

List Constraints
    [Documentation]    Verify list constraints returns enforced constraints
    [Tags]    opa    gatekeeper    constraint    list
    ${resp}=    List Constraints
    Status Should Be    200    ${resp}
    ${count}=    Get Length    ${resp.json()}[constraints]
    Should Be True    ${count} > 0

Validate Resource Against Constraint
    [Documentation]    Verify validation endpoint checks resource
    [Tags]    opa    gatekeeper    validate
    ${resource}=    Create Dictionary    apiVersion=v1    kind=Pod    metadata=${EMPTY}
    Set To Dictionary    ${resource}[metadata]    name=test-pod    labels=${EMPTY}
    Set To Dictionary    ${resource}[metadata][labels]    kyc-vault=enabled
    ${resp}=    Validate Against Constraint    require-kyc-label    ${resource}
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[allowed]    ${TRUE}

Validation Rejects Non Compliant
    [Documentation]    Verify validation rejects resources missing required labels
    [Tags]    opa    gatekeeper    validate    reject
    ${resource}=    Create Dictionary    apiVersion=v1    kind=Pod    metadata=${EMPTY}
    Set To Dictionary    ${resource}[metadata]    name=bad-pod    labels=${EMPTY}
    ${resp}=    Validate Against Constraint    require-kyc-label    ${resource}
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[allowed]    ${FALSE}
    ${violations}=    Get Length    ${resp.json()}[violations]
    Should Be True    ${violations} > 0

Get Audit Results
    [Documentation]    Verify audit endpoint returns audit results
    [Tags]    opa    gatekeeper    audit
    ${resp}=    Get Audit Results
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    auditTimestamp
    Dictionary Should Contain Key    ${resp.json()}    violations
    Dictionary Should Contain Key    ${resp.json()}    totalViolations
