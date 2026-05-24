*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create CertManager Session
Suite Teardown    Delete All Sessions

*** Variables ***
${CERT_BASE}    ${BASE_URL}/api/v1/cert-manager
${CERT_DIR}     ${BASE_DIR}/deploy/cert-manager

*** Keywords ***
Create CertManager Session
    Create Session    certman    ${BASE_URL}

Get Certificate
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    certman    ${CERT_BASE}/certificates/${namespace}/${name}
    RETURN    ${resp}

List Certificates
    [Arguments]    ${namespace}
    ${resp}=    GET On Session    certman    ${CERT_BASE}/certificates/${namespace}
    RETURN    ${resp}

Create Certificate
    [Arguments]    ${name}    ${namespace}    ${domain}    ${issuer}
    ${body}=    Create Dictionary    name=${name}    namespace=${namespace}    domain=${domain}    issuer=${issuer}
    ${resp}=    POST On Session    certman    ${CERT_BASE}/certificates    json=${body}
    RETURN    ${resp}

Get Issuer
    [Arguments]    ${name}    ${namespace}
    ${resp}=    GET On Session    certman    ${CERT_BASE}/issuers/${namespace}/${name}
    RETURN    ${resp}

Renew Certificate
    [Arguments]    ${name}    ${namespace}
    ${body}=    Create Dictionary    name=${name}    namespace=${namespace}
    ${resp}=    POST On Session    certman    ${CERT_BASE}/renew    json=${body}
    RETURN    ${resp}

*** Test Cases ***
Cert Manager Directory Exists
    [Documentation]    Verify cert-manager manifest directory exists
    [Tags]    certmanager    structure
    Directory Should Exist    ${CERT_DIR}

Certificate Issuer Manifest Exists
    [Documentation]    Verify issuer manifest exists
    [Tags]    certmanager    issuer
    File Should Exist    ${CERT_DIR}/issuer.yaml

Certificate Manifest Exists
    [Documentation]    Verify certificate manifest exists
    [Tags]    certmanager    certificate
    File Should Exist    ${CERT_DIR}/certificate.yaml

Get Issuer Details
    [Documentation]    Verify issuer endpoint returns issuer config
    [Tags]    certmanager    issuer    detail
    ${resp}=    Get Issuer    kyc-vault-issuer    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    kind
    Dictionary Should Contain Key    ${resp.json()}    status

List Certificates Returns Items
    [Documentation]    Verify list certificates endpoint returns certs
    [Tags]    certmanager    list
    ${resp}=    List Certificates    default
    Status Should Be    200    ${resp}
    ${count}=    Get Length    ${resp.json()}[certificates]
    Should Be True    ${count} > 0

Get Certificate Details
    [Documentation]    Verify certificate endpoint returns certificate details
    [Tags]    certmanager    certificate    detail
    ${resp}=    Get Certificate    kyc-vault-tls    default
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    domain
    Dictionary Should Contain Key    ${resp.json()}    issuer
    Dictionary Should Contain Key    ${resp.json()}    status
    Dictionary Should Contain Key    ${resp.json()}    notAfter

Create Certificate Request
    [Documentation]    Verify certificate creation endpoint works
    [Tags]    certmanager    create
    ${resp}=    Create Certificate    test-cert    default    test.kyc-vault.example.com    kyc-vault-issuer
    Status Should Be    201    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    domain

Renew Certificate
    [Documentation]    Verify certificate renewal endpoint works
    [Tags]    certmanager    renew
    ${resp}=    Renew Certificate    kyc-vault-tls    default
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    renewing
    Dictionary Should Contain Key    ${resp.json()}    renewedAt

Certificate Status Ready
    [Documentation]    Verify certificate status is ready
    [Tags]    certmanager    status
    ${resp}=    Get Certificate    kyc-vault-tls    default
    Should Be Equal    ${resp.json()}[status]    ready

Certificate Has Domain San
    [Documentation]    Verify certificate has SAN entries
    [Tags]    certmanager    san
    ${resp}=    Get Certificate    kyc-vault-tls    default
    Dictionary Should Contain Key    ${resp.json()}    sans
    ${sans}=    Get Length    ${resp.json()}[sans]
    Should Be True    ${sans} >= 1
