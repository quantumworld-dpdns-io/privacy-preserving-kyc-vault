*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create Vault Session
Suite Teardown    Delete All Sessions

*** Variables ***
${VAULT_BASE}    ${BASE_URL}/api/v1/vault
${VAULT_DIR}     ${BASE_DIR}/deploy/vault

*** Keywords ***
Create Vault Session
    Create Session    vault    ${BASE_URL}

Write Secret
    [Arguments]    ${path}    ${data}
    ${body}=    Create Dictionary    path=${path}    data=${data}
    ${resp}=    POST On Session    vault    ${VAULT_BASE}/secrets/${path}    json=${body}
    RETURN    ${resp}

Read Secret
    [Arguments]    ${path}
    ${resp}=    GET On Session    vault    ${VAULT_BASE}/secrets/${path}
    RETURN    ${resp}

Delete Secret
    [Arguments]    ${path}
    ${resp}=    DELETE On Session    vault    ${VAULT_BASE}/secrets/${path}
    RETURN    ${resp}

List Secrets
    [Arguments]    ${path}
    ${resp}=    GET On Session    vault    ${VAULT_BASE}/secrets/${path}/list
    RETURN    ${resp}

Get Policy
    [Arguments]    ${name}
    ${resp}=    GET On Session    vault    ${VAULT_BASE}/policies/${name}
    RETURN    ${resp}

Create Policy
    [Arguments]    ${name}    ${rules}
    ${body}=    Create Dictionary    name=${name}    rules=${rules}
    ${resp}=    POST On Session    vault    ${VAULT_BASE}/policies    json=${body}
    RETURN    ${resp}

Enable SecretEngine
    [Arguments]    ${engine_type}    ${path}
    ${body}=    Create Dictionary    type=${engine_type}    path=${path}
    ${resp}=    POST On Session    vault    ${VAULT_BASE}/engines    json=${body}
    RETURN    ${resp}

*** Test Cases ***
Vault Directory Exists
    [Documentation]    Verify Vault configuration directory exists
    [Tags]    vault    structure
    Directory Should Exist    ${VAULT_DIR}

Write Secret To Kv Store
    [Documentation]    Verify secret can be written to KV store
    [Tags]    vault    secret    write
    ${data}=    Create Dictionary    api_key=sk-abc123    endpoint=https://example.com
    ${resp}=    Write Secret    kyc-vault/api    ${data}
    Status Should Be    201    ${resp}
    Should Be Equal    ${resp.json()}[path]    kyc-vault/api

Read Secret From Kv Store
    [Documentation]    Verify secret can be read from KV store
    [Tags]    vault    secret    read
    ${resp}=    Read Secret    kyc-vault/api
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    data
    Dictionary Should Contain Key    ${resp.json()}[data]    api_key

Read Non Existent Secret Fails
    [Documentation]    Verify reading non-existent secret returns 404
    [Tags]    vault    secret    missing
    ${resp}=    Read Secret    kyc-vault/non-existent
    Status Should Be    404    ${resp}

Delete Secret
    [Documentation]    Verify secret can be deleted
    [Tags]    vault    secret    delete
    ${data}=    Create Dictionary    temp=value
    ${resp}=    Write Secret    kyc-vault/temp    ${data}
    ${resp}=    Delete Secret    kyc-vault/temp
    Status Should Be    204    ${resp}

List Secrets In Path
    [Documentation]    Verify list secrets returns keys
    [Tags]    vault    secret    list
    ${resp}=    List Secrets    kyc-vault
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    keys
    ${keys}=    Get Length    ${resp.json()}[keys]
    Should Be True    ${keys} > 0

Create Vault Policy
    [Documentation]    Verify policy can be created
    [Tags]    vault    policy    create
    ${rules}=    Set Variable    path "kyc-vault/*" { capabilities = ["read"] }
    ${resp}=    Create Policy    kyc-vault-readonly    ${rules}
    Status Should Be    201    ${resp}
    Should Be Equal    ${resp.json()}[name]    kyc-vault-readonly

Get Policy Details
    [Documentation]    Verify policy details endpoint returns rules
    [Tags]    vault    policy    detail
    ${resp}=    Get Policy    kyc-vault-admin
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    rules
    Should Contain    ${resp.json()}[rules]    path

Enable Secret Engine
    [Documentation]    Verify secret engine can be enabled
    [Tags]    vault    engine    enable
    ${resp}=    Enable SecretEngine    kv    kyc-vault-engine
    Status Should Be    201    ${resp}
    Should Be Equal    ${resp.json()}[type]    kv
