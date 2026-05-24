*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create Istio Session
Suite Teardown    Delete All Sessions

*** Variables ***
${ISTIO_BASE}    ${BASE_URL}/api/v1/istio
${ISTIO_DIR}     ${BASE_DIR}/deploy/istio

*** Keywords ***
Create Istio Session
    Create Session    istio    ${BASE_URL}

Get VirtualService
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    istio    ${ISTIO_BASE}/virtual-services/${namespace}/${name}
    RETURN    ${resp}

List VirtualServices
    [Arguments]    ${namespace}
    ${resp}=    GET On Session    istio    ${ISTIO_BASE}/virtual-services/${namespace}
    RETURN    ${resp}

Get DestinationRule
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    istio    ${ISTIO_BASE}/destination-rules/${namespace}/${name}
    RETURN    ${resp}

Get AuthorizationPolicy
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    istio    ${ISTIO_BASE}/authorization-policies/${namespace}/${name}
    RETURN    ${resp}

Get PeerAuthentication
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    istio    ${ISTIO_BASE}/peer-authentications/${namespace}/${name}
    RETURN    ${resp}

Get Mtls Status
    [Arguments]    ${namespace}
    ${resp}=    GET On Session    istio    ${ISTIO_BASE}/mtls/${namespace}
    RETURN    ${resp}

*** Test Cases ***
Istio Directory Exists
    [Documentation]    Verify Istio manifest directory exists
    [Tags]    istio    structure
    Directory Should Exist    ${ISTIO_DIR}

VirtualService Manifest Exists
    [Documentation]    Verify VirtualService manifest exists
    [Tags]    istio    virtualservice
    File Should Exist    ${ISTIO_DIR}/virtual-service.yaml

DestinationRule Manifest Exists
    [Documentation]    Verify DestinationRule manifest exists
    [Tags]    istio    destinationrule
    File Should Exist    ${ISTIO_DIR}/destination-rule.yaml

Get VirtualService Details
    [Documentation]    Verify VirtualService endpoint returns routing rules
    [Tags]    istio    virtualservice    detail
    ${resp}=    Get VirtualService    kyc-vault-vs    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    hosts
    Dictionary Should Contain Key    ${resp.json()}    http
    ${http}=    Get Length    ${resp.json()}[http]
    Should Be True    ${http} > 0

List VirtualServices Returns Items
    [Documentation]    Verify list VirtualServices endpoint works
    [Tags]    istio    virtualservice    list
    ${resp}=    List VirtualServices    default
    Status Should Be    200    ${resp}
    ${count}=    Get Length    ${resp.json()}[virtualServices]
    Should Be True    ${count} > 0

Get DestinationRule With TrafficPolicy
    [Documentation]    Verify DestinationRule includes traffic policy
    [Tags]    istio    destinationrule    traffic
    ${resp}=    Get DestinationRule    kyc-vault-dr    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    host
    Dictionary Should Contain Key    ${resp.json()}    trafficPolicy
    Dictionary Should Contain Key    ${resp.json()}[trafficPolicy]    tls
    Should Be Equal    ${resp.json()}[trafficPolicy][tls][mode]    ISTIO_MUTUAL

Get AuthorizationPolicy
    [Documentation]    Verify AuthorizationPolicy endpoint returns rules
    [Tags]    istio    authorization    policy
    ${resp}=    Get AuthorizationPolicy    kyc-vault-authz    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    rules
    Dictionary Should Contain Key    ${resp.json()}    action
    ${rules}=    Get Length    ${resp.json()}[rules]
    Should Be True    ${rules} > 0

Get PeerAuthentication
    [Documentation]    Verify PeerAuthentication endpoint returns mTLS config
    [Tags]    istio    peerauthentication    mtls
    ${resp}=    Get PeerAuthentication    default    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    mtls
    Dictionary Should Contain Key    ${resp.json()}[mtls]    mode

mTLS Status Is Enabled
    [Documentation]    Verify mTLS status returns enabled for namespace
    [Tags]    istio    mtls    status
    ${resp}=    Get Mtls Status    default
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    enabled
    Dictionary Should Contain Key    ${resp.json()}    strictPercentage

VirtualService Has Http Routes
    [Documentation]    Verify VirtualService has HTTP route definitions
    [Tags]    istio    virtualservice    routes
    ${resp}=    Get VirtualService    kyc-vault-vs    default
    ${http}=    Set Variable    ${resp.json()}[http]
    FOR    ${route}    IN    @{http}
        Dictionary Should Contain Key    ${route}    match
        Dictionary Should Contain Key    ${route}    route
    END
