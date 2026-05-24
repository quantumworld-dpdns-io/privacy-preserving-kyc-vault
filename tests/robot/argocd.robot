*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create ArgoCD Session
Suite Teardown    Delete All Sessions

*** Variables ***
${ARGOCD_BASE}    ${BASE_URL}/api/v1/argocd
${ARGOCD_DIR}     ${BASE_DIR}/deploy/argocd

*** Keywords ***
Create ArgoCD Session
    Create Session    argocd    ${BASE_URL}

Sync Application
    [Arguments]    ${app_name}
    ${body}=    Create Dictionary    appName=${app_name}
    ${resp}=    POST On Session    argocd    ${ARGOCD_BASE}/sync    json=${body}
    RETURN    ${resp}

Get Application Status
    [Arguments]    ${app_name}
    ${resp}=    GET On Session    argocd    ${ARGOCD_BASE}/applications/${app_name}
    RETURN    ${resp}

List Applications
    ${resp}=    GET On Session    argocd    ${ARGOCD_BASE}/applications
    RETURN    ${resp}

Get Sync History
    [Arguments]    ${app_name}
    ${resp}=    GET On Session    argocd    ${ARGOCD_BASE}/applications/${app_name}/history
    RETURN    ${resp}

Rollback Application
    [Arguments]    ${app_name}    ${revision}
    ${body}=    Create Dictionary    appName=${app_name}    revision=${revision}
    ${resp}=    POST On Session    argocd    ${ARGOCD_BASE}/rollback    json=${body}
    RETURN    ${resp}

*** Test Cases ***
ArgoCD Directory Exists
    [Documentation]    Verify ArgoCD application directory exists
    [Tags]    argocd    structure
    Directory Should Exist    ${ARGOCD_DIR}

Application YAML Files Exist
    [Documentation]    Verify ArgoCD application YAML files exist
    [Tags]    argocd    apps
    ${files}=    List Files In Directory    ${ARGOCD_DIR}
    ${count}=    Get Length    ${files}
    Should Be True    ${count} > 0

List ArgoCD Applications
    [Documentation]    Verify list applications endpoint returns apps
    [Tags]    argocd    list
    ${resp}=    List Applications
    Status Should Be    200    ${resp}
    ${count}=    Get Length    ${resp.json()}[applications]
    Should Be True    ${count} > 0

Get Application Status Returns Health
    [Documentation]    Verify application status returns health info
    [Tags]    argocd    status
    ${resp}=    Get Application Status    kyc-vault
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    health
    Dictionary Should Contain Key    ${resp.json()}    sync
    Dictionary Should Contain Key    ${resp.json()}    status

Sync Application Returns Job
    [Documentation]    Verify sync endpoint returns sync operation
    [Tags]    argocd    sync
    ${resp}=    Sync Application    kyc-vault
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    syncId
    Should Be Equal    ${resp.json()}[app]    kyc-vault

Sync History Available
    [Documentation]    Verify sync history endpoint returns history
    [Tags]    argocd    history
    ${resp}=    Get Sync History    kyc-vault
    Status Should Be    200    ${resp}
    ${history}=    Get Length    ${resp.json()}[history]
    Should Be True    ${history} >= 0

Rollback Application
    [Documentation]    Verify rollback endpoint works
    [Tags]    argocd    rollback
    ${resp}=    Get Sync History    kyc-vault
    ${history}=    Set Variable    ${resp.json()}[history]
    ${first}=    Set Variable    ${history}[0]
    ${resp}=    Rollback Application    kyc-vault    ${first}[revision]
    Status Should Be    200    ${resp}

Application YAML Structure Valid
    [Documentation]    Verify application YAML has required fields
    [Tags]    argocd    validation    yaml
    ${files}=    List Files In Directory    ${ARGOCD_DIR}
    FOR    ${file}    IN    @{files}
        ${content}=    Get File    ${ARGOCD_DIR}/${file}
        Should Contain    ${content}    destination
        Should Contain    ${content}    project
        Should Contain    ${content}    source
    END

Sync Non Existent App Fails
    [Documentation]    Verify syncing non-existent app returns 404
    [Tags]    argocd    sync    error
    ${resp}=    Sync Application    non-existent-app
    Status Should Be    404    ${resp}
