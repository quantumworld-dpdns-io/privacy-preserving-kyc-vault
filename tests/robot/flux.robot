*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create Flux Session
Suite Teardown    Delete All Sessions

*** Variables ***
${FLUX_BASE}    ${BASE_URL}/api/v1/flux
${FLUX_DIR}     ${BASE_DIR}/deploy/flux

*** Keywords ***
Create Flux Session
    Create Session    flux    ${BASE_URL}

Reconcile Kustomization
    [Arguments]    ${name}
    ${body}=    Create Dictionary    name=${name}
    ${resp}=    POST On Session    flux    ${FLUX_BASE}/reconcile    json=${body}
    RETURN    ${resp}

Get Kustomization Status
    [Arguments]    ${name}
    ${resp}=    GET On Session    flux    ${FLUX_BASE}/kustomizations/${name}
    RETURN    ${resp}

List Flux Resources
    ${resp}=    GET On Session    flux    ${FLUX_BASE}/resources
    RETURN    ${resp}

Suspend Kustomization
    [Arguments]    ${name}
    ${body}=    Create Dictionary    name=${name}
    ${resp}=    POST On Session    flux    ${FLUX_BASE}/suspend    json=${body}
    RETURN    ${resp}

Resume Kustomization
    [Arguments]    ${name}
    ${body}=    Create Dictionary    name=${name}
    ${resp}=    POST On Session    flux    ${FLUX_BASE}/resume    json=${body}
    RETURN    ${resp}

*** Test Cases ***
Flux Directory Exists
    [Documentation]    Verify Flux directory structure exists
    [Tags]    flux    structure
    Directory Should Exist    ${FLUX_DIR}

Flux Kustomization Files Exist
    [Documentation]    Verify Flux kustomization YAML files exist
    [Tags]    flux    kustomization
    ${files}=    List Files In Directory    ${FLUX_DIR}
    ${count}=    Get Length    ${files}
    Should Be True    ${count} > 0

List Flux Resources Returns Items
    [Documentation]    Verify list resources endpoint returns resources
    [Tags]    flux    list
    ${resp}=    List Flux Resources
    Status Should Be    200    ${resp}
    ${count}=    Get Length    ${resp.json()}[resources]
    Should Be True    ${count} > 0

Get Kustomization Status
    [Documentation]    Verify kustomization status endpoint returns status
    [Tags]    flux    status
    ${resp}=    Get Kustomization Status    kyc-vault
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    status
    Dictionary Should Contain Key    ${resp.json()}    revision

Reconcile Kustomization
    [Documentation]    Verify reconcile triggers a sync
    [Tags]    flux    reconcile
    ${resp}=    Reconcile Kustomization    kyc-vault
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[name]    kyc-vault
    Dictionary Should Contain Key    ${resp.json()}    reconciliationId

Suspend And Resume Kustomization
    [Documentation]    Verify suspend and resume workflow
    [Tags]    flux    suspend    resume
    ${resp}=    Suspend Kustomization    kyc-vault
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[suspended]    ${TRUE}
    ${resp}=    Resume Kustomization    kyc-vault
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[suspended]    ${FALSE}

Reconcile Non Existent Fails
    [Documentation]    Verify reconciling non-existent kustomization fails
    [Tags]    flux    reconcile    error
    ${resp}=    Reconcile Kustomization    non-existent
    Status Should Be    404    ${resp}

Kustomization Yaml Has Required Fields
    [Documentation]    Verify kustomization YAML has required fields
    [Tags]    flux    validation
    ${files}=    List Files In Directory    ${FLUX_DIR}
    FOR    ${file}    IN    @{files}
        ${content}=    Get File    ${FLUX_DIR}/${file}
        Should Contain    ${content}    kind
        Should Contain    ${content}    metadata
    END

Flux Source Status
    [Documentation]    Verify flux source controller is healthy
    [Tags]    flux    source
    ${resp}=    GET On Session    flux    ${FLUX_BASE}/sources
    Status Should Be    200    ${resp}
    ${sources}=    Get Length    ${resp.json()}[sources]
    Should Be True    ${sources} > 0
