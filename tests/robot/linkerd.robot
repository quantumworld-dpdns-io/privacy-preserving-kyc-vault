*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create Linkerd Session
Suite Teardown    Delete All Sessions

*** Variables ***
${LINKERD_BASE}    ${BASE_URL}/api/v1/linkerd
${LINKERD_DIR}     ${BASE_DIR}/deploy/linkerd

*** Keywords ***
Create Linkerd Session
    Create Session    linkerd    ${BASE_URL}

Get Mesh Status
    ${resp}=    GET On Session    linkerd    ${LINKERD_BASE}/status
    RETURN    ${resp}

Get Proxy Status
    [Arguments]    ${pod_name}    ${namespace}
    ${resp}=    GET On Session    linkerd    ${LINKERD_BASE}/proxies/${namespace}/${pod_name}
    RETURN    ${resp}

List Meshed Pods
    [Arguments]    ${namespace}
    ${resp}=    GET On Session    linkerd    ${LINKERD_BASE}/pods/${namespace}
    RETURN    ${resp}

Get Mtls Status
    ${resp}=    GET On Session    linkerd    ${LINKERD_BASE}/mtls
    RETURN    ${resp}

Check ServiceProfile
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    linkerd    ${LINKERD_BASE}/service-profiles/${namespace}/${name}
    RETURN    ${resp}

Run Linkerd Check
    ${resp}=    GET On Session    linkerd    ${LINKERD_BASE}/check
    RETURN    ${resp}

*** Test Cases ***
Linkerd Directory Exists
    [Documentation]    Verify Linkerd manifest directory exists
    [Tags]    linkerd    structure
    Directory Should Exist    ${LINKERD_DIR}

Mesh Status Returns Healthy
    [Documentation]    Verify mesh status endpoint returns healthy
    [Tags]    linkerd    status
    ${resp}=    Get Mesh Status
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    healthy
    Dictionary Should Contain Key    ${resp.json()}    meshedPods
    Dictionary Should Contain Key    ${resp.json()}    uptime

mTLS Status Enabled
    [Documentation]    Verify mTLS status returns enabled
    [Tags]    linkerd    mtls
    ${resp}=    Get Mtls Status
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[mtls]    enabled
    Dictionary Should Contain Key    ${resp.json()}    percentage

List Meshed Pods In Namespace
    [Documentation]    Verify list meshed pods returns proxy-injected pods
    [Tags]    linkerd    pods    list
    ${resp}=    List Meshed Pods    default
    Status Should Be    200    ${resp}
    ${count}=    Get Length    ${resp.json()}[pods]
    Should Be True    ${count} > 0
    FOR    ${pod}    IN    @{resp.json()}[pods]
        Dictionary Should Contain Key    ${pod}    name
        Dictionary Should Contain Key    ${pod}    proxyStatus
    END

Get Proxy Status
    [Documentation]    Verify proxy status endpoint returns proxy info
    [Tags]    linkerd    proxy    status
    ${resp}=    List Meshed Pods    default
    ${pods}=    Set Variable    ${resp.json()}[pods]
    ${first}=    Set Variable    ${pods}[0]
    ${resp}=    Get Proxy Status    ${first}[name]    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    proxy
    Dictionary Should Contain Key    ${resp.json()}    controlPlane

ServiceProfile Exists
    [Documentation]    Verify ServiceProfile endpoint returns profile
    [Tags]    linkerd    serviceprofile
    ${resp}=    Check ServiceProfile    kyc-vault    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    routes
    ${routes}=    Get Length    ${resp.json()}[routes]
    Should Be True    ${routes} > 0

Run Linkerd Pre Flight Check
    [Documentation]    Verify linkerd check runs successfully
    [Tags]    linkerd    check
    ${resp}=    Run Linkerd Check
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    passed
    Dictionary Should Contain Key    ${resp.json()}    checks
    ${checks}=    Get Length    ${resp.json()}[checks]
    Should Be True    ${checks} > 0

Linkerd Proxy Annotation Present
    [Documentation]    Verify deployment manifest has linkerd injection annotation
    [Tags]    linkerd    annotation
    ${content}=    Get File    ${LINKERD_DIR}/linkerd-deployment.yaml
    Should Contain    ${content}    linkerd.io/inject

All Pods Have Linkerd Proxy
    [Documentation]    Verify all pods in namespace have linkerd proxy
    [Tags]    linkerd    proxy    all
    ${resp}=    List Meshed Pods    default
    ${pods}=    Set Variable    ${resp.json()}[pods]
    FOR    ${pod}    IN    @{pods}
        Should Be Equal    ${pod}[proxyStatus]    running
    END
