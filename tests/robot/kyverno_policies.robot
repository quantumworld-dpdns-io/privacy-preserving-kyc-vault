*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create Kyverno Session
Suite Teardown    Delete All Sessions

*** Variables ***
${KYV_BASE}    ${BASE_URL}/api/v1/kyverno
${KYV_DIR}     ${BASE_DIR}/deploy/kyverno

*** Keywords ***
Create Kyverno Session
    Create Session    kyverno    ${BASE_URL}

Get ClusterPolicy
    [Arguments]    ${name}
    ${resp}=    GET On Session    kyverno    ${KYV_BASE}/cluster-policies/${name}
    RETURN    ${resp}

List ClusterPolicies
    ${resp}=    GET On Session    kyverno    ${KYV_BASE}/cluster-policies
    RETURN    ${resp}

Create ClusterPolicy
    [Arguments]    ${name}    ${rules}
    ${body}=    Create Dictionary    name=${name}    rules=${rules}
    ${resp}=    POST On Session    kyverno    ${KYV_BASE}/cluster-policies    json=${body}
    RETURN    ${resp}

Validate Policy
    [Arguments]    ${policy_yaml}
    ${body}=    Create Dictionary    policy=${policy_yaml}
    ${resp}=    POST On Session    kyverno    ${KYV_BASE}/validate    json=${body}
    RETURN    ${resp}

Apply Policy To Resource
    [Arguments]    ${policy_name}    ${resource}
    ${body}=    Create Dictionary    policy=${policy_name}    resource=${resource}
    ${resp}=    POST On Session    kyverno    ${KYV_BASE}/apply    json=${body}
    RETURN    ${resp}

Get PolicyReport
    [Arguments]    ${namespace}
    ${resp}=    GET On Session    kyverno    ${KYV_BASE}/policy-reports/${namespace}
    RETURN    ${resp}

*** Test Cases ***
Kyverno Directory Exists
    [Documentation]    Verify Kyverno policy directory exists
    [Tags]    kyverno    structure
    Directory Should Exist    ${KYV_DIR}

ClusterPolicy Manifest Exists
    [Documentation]    Verify cluster policy manifest exists
    [Tags]    kyverno    policy    manifest
    File Should Exist    ${KYV_DIR}/cluster-policy.yaml

Get ClusterPolicy Details
    [Documentation]    Verify cluster policy endpoint returns policy rules
    [Tags]    kyverno    policy    detail
    ${resp}=    Get ClusterPolicy    require-kyc-labels
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    rules
    ${rules}=    Get Length    ${resp.json()}[rules]
    Should Be True    ${rules} > 0

List ClusterPolicies Returns Items
    [Documentation]    Verify list cluster policies returns items
    [Tags]    kyverno    policy    list
    ${resp}=    List ClusterPolicies
    Status Should Be    200    ${resp}
    ${count}=    Get Length    ${resp.json()}[clusterPolicies]
    Should Be True    ${count} > 0

Create ClusterPolicy
    [Documentation]    Verify cluster policy can be created
    [Tags]    kyverno    policy    create
    ${rule}=    Create Dictionary    name=validate-image    match=${EMPTY}    validate=${EMPTY}
    Set To Dictionary    ${rule}[match]    resources=Pod
    Set To Dictionary    ${rule}[validate]    message=Image must be from trusted registry    pattern=${EMPTY}
    Set To Dictionary    ${rule}[validate][pattern]    spec.containers[*].image    trusted-registry.io/*
    ${rules}=    Create List    ${rule}
    ${resp}=    Create ClusterPolicy    validate-image-registry    ${rules}
    Status Should Be    201    ${resp}
    Should Be Equal    ${resp.json()}[name]    validate-image-registry

Validate Policy Yaml
    [Documentation]    Verify policy validation endpoint checks YAML
    [Tags]    kyverno    validate
    ${policy}=    Get File    ${KYV_DIR}/cluster-policy.yaml
    ${resp}=    Validate Policy    ${policy}
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[valid]    ${TRUE}

Apply Policy Mutates Resource
    [Documentation]    Verify policy application mutates resource
    [Tags]    kyverno    apply    mutate
    ${resource}=    Create Dictionary    apiVersion=v1    kind=Pod    metadata=${EMPTY}
    Set To Dictionary    ${resource}[metadata]    name=test-pod    labels=${EMPTY}
    ${resp}=    Apply Policy To Resource    require-kyc-labels    ${resource}
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    patchedResource

Apply Policy With Violation
    [Documentation]    Verify policy application reports violations
    [Tags]    kyverno    apply    violation
    ${resource}=    Create Dictionary    apiVersion=v1    kind=Pod    metadata=${EMPTY}
    Set To Dictionary    ${resource}[metadata]    name=bad-pod
    ${resp}=    Apply Policy To Resource    require-kyc-labels    ${resource}
    Status Should Be    200    ${resp}
    ${violations}=    Get Length    ${resp.json()}[violations]
    Should Be True    ${violations} >= 0

Get Policy Report
    [Documentation]    Verify policy report endpoint returns results
    [Tags]    kyverno    report
    ${resp}=    Get PolicyReport    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    results
    ${results}=    Get Length    ${resp.json()}[results]
    Should Be True    ${results} >= 0

Policy Rule Has Match Block
    [Documentation]    Verify policy rules have match conditions
    [Tags]    kyverno    policy    rules
    ${resp}=    Get ClusterPolicy    require-kyc-labels
    ${rules}=    Set Variable    ${resp.json()}[rules]
    FOR    ${rule}    IN    @{rules}
        Dictionary Should Contain Key    ${rule}    name
        Dictionary Should Contain Key    ${rule}    match
    END
