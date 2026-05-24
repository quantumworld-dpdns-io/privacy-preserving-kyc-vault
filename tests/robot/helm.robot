*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create Helm Session
Suite Teardown    Delete All Sessions

*** Variables ***
${HELM_BASE}    ${BASE_URL}/api/v1/helm
${HELM_DIR}     ${BASE_DIR}/deploy/helm

*** Keywords ***
Create Helm Session
    Create Session    helm    ${BASE_URL}

Get Helm Releases
    ${resp}=    GET On Session    helm    ${HELM_BASE}/releases
    RETURN    ${resp}

Get Release Status
    [Arguments]    ${release_name}    ${namespace}
    ${resp}=    GET On Session    helm    ${HELM_BASE}/releases/${namespace}/${release_name}
    RETURN    ${resp}

Install Release
    [Arguments]    ${release_name}    ${chart}    ${namespace}    ${values}
    ${body}=    Create Dictionary    name=${release_name}    chart=${chart}    namespace=${namespace}    values=${values}
    ${resp}=    POST On Session    helm    ${HELM_BASE}/releases    json=${body}
    RETURN    ${resp}

Upgrade Release
    [Arguments]    ${release_name}    ${namespace}    ${values}
    ${body}=    Create Dictionary    values=${values}
    ${resp}=    PUT On Session    helm    ${HELM_BASE}/releases/${namespace}/${release_name}    json=${body}
    RETURN    ${resp}

Uninstall Release
    [Arguments]    ${release_name}    ${namespace}
    ${resp}=    DELETE On Session    helm    ${HELM_BASE}/releases/${namespace}/${release_name}
    RETURN    ${resp}

Get Chart Values
    [Arguments]    ${chart_name}
    ${resp}=    GET On Session    helm    ${HELM_BASE}/charts/${chart_name}/values
    RETURN    ${resp}

*** Test Cases ***
Helm Chart Directory Exists
    [Documentation]    Verify Helm chart directory exists
    [Tags]    helm    structure
    Directory Should Exist    ${HELM_DIR}
    File Should Exist    ${HELM_DIR}/Chart.yaml

Chart Yaml Has Required Fields
    [Documentation]    Verify Chart.yaml has required fields
    [Tags]    helm    chart    validation
    ${content}=    Get File    ${HELM_DIR}/Chart.yaml
    Should Contain    ${content}    apiVersion
    Should Contain    ${content}    name
    Should Contain    ${content}    version
    Should Contain    ${content}    description

List Helm Releases
    [Documentation]    Verify list releases endpoint returns releases
    [Tags]    helm    release    list
    ${resp}=    Get Helm Releases
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    releases

Get Release Status
    [Documentation]    Verify release status endpoint returns details
    [Tags]    helm    release    status
    ${resp}=    Get Release Status    kyc-vault    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    namespace
    Dictionary Should Contain Key    ${resp.json()}    revision
    Dictionary Should Contain Key    ${resp.json()}    status

Install Helm Release
    [Documentation]    Verify a Helm release can be installed
    [Tags]    helm    install
    ${values}=    Create Dictionary    replicaCount=3    imageTag=latest
    ${resp}=    Install Release    test-release    kyc-vault    test-ns    ${values}
    Status Should Be    201    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Should Be Equal    ${resp.json()}[name]    test-release

Upgrade Helm Release
    [Documentation]    Verify Helm release can be upgraded
    [Tags]    helm    upgrade
    ${values}=    Create Dictionary    replicaCount=5    imageTag=v2.0.0
    ${resp}=    Upgrade Release    kyc-vault    default    ${values}
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    revision

Uninstall Helm Release
    [Documentation]    Verify Helm release can be uninstalled
    [Tags]    helm    uninstall
    ${values}=    Create Dictionary    replicaCount=1
    ${resp}=    Install Release    temp-release    kyc-vault    temp-ns    ${values}
    ${resp}=    Uninstall Release    temp-release    temp-ns
    Status Should Be    200    ${resp}

Get Chart Default Values
    [Documentation]    Verify chart values endpoint returns defaults
    [Tags]    helm    values
    ${resp}=    Get Chart Values    kyc-vault
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    values
    Dictionary Should Contain Key    ${resp.json()}    values    replicaCount

Values Template Has Expected Keys
    [Documentation]    Verify values.yaml has expected configuration keys
    [Tags]    helm    values    validation
    ${content}=    Get File    ${HELM_DIR}/values.yaml
    Should Contain    ${content}    replicaCount
    Should Contain    ${content}    image
    Should Contain    ${content}    service

Template Directory Exists
    [Documentation]    Verify Helm templates directory exists
    [Tags]    helm    templates
    Directory Should Exist    ${HELM_DIR}/templates
    ${files}=    List Files In Directory    ${HELM_DIR}/templates
    ${count}=    Get Length    ${files}
    Should Be True    ${count} > 0
