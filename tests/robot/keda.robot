*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create Keda Session
Suite Teardown    Delete All Sessions

*** Variables ***
${KEDA_BASE}    ${BASE_URL}/api/v1/keda
${KEDA_DIR}     ${BASE_DIR}/deploy/keda

*** Keywords ***
Create Keda Session
    Create Session    keda    ${BASE_URL}

Get ScaledObject
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    keda    ${KEDA_BASE}/scaled-objects/${namespace}/${name}
    RETURN    ${resp}

List ScaledObjects
    [Arguments]    ${namespace}
    ${resp}=    GET On Session    keda    ${KEDA_BASE}/scaled-objects/${namespace}
    RETURN    ${resp}

Create ScaledObject
    [Arguments]    ${name}    ${namespace}    ${spec}
    ${body}=    Create Dictionary    name=${name}    namespace=${namespace}    spec=${spec}
    ${resp}=    POST On Session    keda    ${KEDA_BASE}/scaled-objects    json=${body}
    RETURN    ${resp}

Get TriggerAuthentication
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    keda    ${KEDA_BASE}/trigger-authentications/${namespace}/${name}
    RETURN    ${resp}

Get Scaling Status
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    keda    ${KEDA_BASE}/scale-status/${namespace}/${name}
    RETURN    ${resp}

Delete ScaledObject
    [Arguments]    ${name}    ${namespace}
    ${resp}=    DELETE On Session    keda    ${KEDA_BASE}/scaled-objects/${namespace}/${name}
    RETURN    ${resp}

*** Test Cases ***
Keda Directory Exists
    [Documentation]    Verify KEDA manifest directory exists
    [Tags]    keda    structure
    Directory Should Exist    ${KEDA_DIR}

ScaledObject Manifest Exists
    [Documentation]    Verify ScaledObject manifest exists
    [Tags]    keda    scaledobject
    File Should Exist    ${KEDA_DIR}/scaled-object.yaml

Get ScaledObject Details
    [Documentation]    Verify ScaledObject endpoint returns scaling config
    [Tags]    keda    scaledobject    detail
    ${resp}=    Get ScaledObject    kyc-vault-scaler    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    scaleTargetRef
    Dictionary Should Contain Key    ${resp.json()}    triggers
    ${triggers}=    Get Length    ${resp.json()}[triggers]
    Should Be True    ${triggers} > 0

List ScaledObjects Returns Items
    [Documentation]    Verify list ScaledObjects returns items
    [Tags]    keda    scaledobject    list
    ${resp}=    List ScaledObjects    default
    Status Should Be    200    ${resp}
    ${count}=    Get Length    ${resp.json()}[scaledObjects]
    Should Be True    ${count} > 0

Create ScaledObject
    [Documentation]    Verify ScaledObject can be created
    [Tags]    keda    scaledobject    create
    ${spec}=    Create Dictionary    scaleTargetRef=kyc-api    pollingInterval=30    cooldownPeriod=300    minReplicaCount=1    maxReplicaCount=10
    ${resp}=    Create ScaledObject    test-scaler    default    ${spec}
    Status Should Be    201    ${resp}
    Should Be Equal    ${resp.json()}[name]    test-scaler

Trigger Authentication Present
    [Documentation]    Verify TriggerAuthentication endpoint works
    [Tags]    keda    authentication
    ${resp}=    Get TriggerAuthentication    kyc-vault-auth    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    secretTargetRef

Get Scaling Status
    [Documentation]    Verify scaling status endpoint returns current replicas
    [Tags]    keda    scaling    status
    ${resp}=    Get Scaling Status    kyc-vault-scaler    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    currentReplicas
    Dictionary Should Contain Key    ${resp.json()}    desiredReplicas
    Dictionary Should Contain Key    ${resp.json()}    scalingActive

Delete ScaledObject
    [Documentation]    Verify ScaledObject can be deleted
    [Tags]    keda    scaledobject    delete
    ${resp}=    Delete ScaledObject    test-scaler    default
    Status Should Be    204    ${resp}

ScaledObject Has Polling Interval
    [Documentation]    Verify ScaledObject has polling interval configured
    [Tags]    keda    scaledobject    config
    ${resp}=    Get ScaledObject    kyc-vault-scaler    default
    Dictionary Should Contain Key    ${resp.json()}    pollingInterval
    Should Be True    ${resp.json()}[pollingInterval] >= 10

Trigger Type Is Valid
    [Documentation]    Verify trigger types are recognized
    [Tags]    keda    trigger    validation
    ${resp}=    Get ScaledObject    kyc-vault-scaler    default
    ${triggers}=    Set Variable    ${resp.json()}[triggers]
    FOR    ${trigger}    IN    @{triggers}
        Dictionary Should Contain Key    ${trigger}    type
        Dictionary Should Contain Key    ${trigger}    metadata
    END
