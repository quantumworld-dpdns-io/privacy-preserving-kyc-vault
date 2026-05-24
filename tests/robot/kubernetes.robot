*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create K8s Session
Suite Teardown    Delete All Sessions

*** Variables ***
${K8S_BASE}    ${BASE_URL}/api/v1/kubernetes
${K8S_DIR}     ${BASE_DIR}/deploy/kubernetes

*** Keywords ***
Create K8s Session
    Create Session    k8s    ${BASE_URL}

Get Resource
    [Arguments]    ${kind}    ${name}    ${namespace}
    ${resp}=    GET On Session    k8s    ${K8S_BASE}/resources/${namespace}/${kind}/${name}
    RETURN    ${resp}

List Resources
    [Arguments]    ${kind}    ${namespace}
    ${resp}=    GET On Session    k8s    ${K8S_BASE}/resources/${namespace}/${kind}
    RETURN    ${resp}

Apply Resource
    [Arguments]    ${manifest}
    ${body}=    Create Dictionary    manifest=${manifest}
    ${resp}=    POST On Session    k8s    ${K8S_BASE}/resources    json=${body}
    RETURN    ${resp}

Delete Resource
    [Arguments]    ${kind}    ${name}    ${namespace}
    ${resp}=    DELETE On Session    k8s    ${K8S_BASE}/resources/${namespace}/${kind}/${name}
    RETURN    ${resp}

Get Rbac Role
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    k8s    ${K8S_BASE}/rbac/roles/${namespace}/${name}
    RETURN    ${resp}

Get NetworkPolicy
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    k8s    ${K8S_BASE}/network-policies/${namespace}/${name}
    RETURN    ${resp}

*** Test Cases ***
Kubernetes Manifests Directory Exists
    [Documentation]    Verify Kubernetes manifest directory exists
    [Tags]    k8s    structure
    Directory Should Exist    ${K8S_DIR}

Deployment Manifest Exists
    [Documentation]    Verify deployment manifest exists
    [Tags]    k8s    deployment
    File Should Exist    ${K8S_DIR}/deployment.yaml

Service Manifest Exists
    [Documentation]    Verify service manifest exists
    [Tags]    k8s    service
    File Should Exist    ${K8S_DIR}/service.yaml

List Namespaced Resources
    [Documentation]    Verify list resources endpoint works
    [Tags]    k8s    list
    ${resp}=    List Resources    pods    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    items
    Dictionary Should Contain Key    ${resp.json()}    count

Get Deployment Details
    [Documentation]    Verify get deployment endpoint returns deployment details
    [Tags]    k8s    deployment    detail
    ${resp}=    Get Resource    deployment    kyc-vault    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    metadata
    Dictionary Should Contain Key    ${resp.json()}    spec
    Dictionary Should Contain Key    ${resp.json()}[spec]    replicas
    Dictionary Should Contain Key    ${resp.json()}[spec]    template

Apply Kubernetes Manifest
    [Documentation]    Verify apply manifest endpoint works
    [Tags]    k8s    apply
    ${manifest}=    Get File    ${K8S_DIR}/configmap.yaml
    ${resp}=    Apply Resource    ${manifest}
    Status Should Be    201    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    kind

Delete Kubernetes Resource
    [Documentation]    Verify delete resource endpoint works
    [Tags]    k8s    delete
    ${resp}=    Delete Resource    configmap    test-config    default
    Status Should Be    200    ${resp}

Get Rbac Role Details
    [Documentation]    Verify RBAC role endpoint returns permissions
    [Tags]    k8s    rbac    role
    ${resp}=    Get Rbac Role    kyc-vault-role    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    rules
    ${rules}=    Get Length    ${resp.json()}[rules]
    Should Be True    ${rules} > 0

Get Network Policy
    [Documentation]    Verify network policy endpoint returns rules
    [Tags]    k8s    network    policy
    ${resp}=    Get NetworkPolicy    kyc-vault-network-policy    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    spec
    Dictionary Should Contain Key    ${resp.json()}[spec]    ingress
    Dictionary Should Contain Key    ${resp.json()}[spec]    egress

Namespace Has Resource Quotas
    [Documentation]    Verify namespace has resource quotas configured
    [Tags]    k8s    quota
    ${resp}=    GET On Session    k8s    ${K8S_BASE}/quotas/default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    quotas
    ${quotas}=    Get Length    ${resp.json()}[quotas]
    Should Be True    ${quotas} > 0

Service Account Exists
    [Documentation]    Verify service account exists
    [Tags]    k8s    serviceaccount
    File Should Exist    ${K8S_DIR}/service-account.yaml
    File Should Exist    ${K8S_DIR}/role-binding.yaml
