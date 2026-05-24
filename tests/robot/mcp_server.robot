*** Settings ***
Library    RequestsLibrary
Library    Collections

*** Variables ***
${MCP_BASE_URL}    http://localhost:8080
${MCP_API_PATH}    /mcp/v1

*** Keywords ***
Create MCP Session
    Create Session    mcp    ${MCP_BASE_URL}

List MCP Tools
    ${resp}=    GET On Session    mcp    ${MCP_API_PATH}/tools
    RETURN    ${resp}

Call MCP Tool
    [Arguments]    ${tool_name}    ${arguments}
    ${body}=    Create Dictionary    name=${tool_name}    arguments=${arguments}
    ${resp}=    POST On Session    mcp    ${MCP_API_PATH}/tools/call    json=${body}
    RETURN    ${resp}

Access MCP Resource
    [Arguments]    ${resource_uri}
    ${resp}=    GET On Session    mcp    ${MCP_API_PATH}/resources/${resource_uri}
    RETURN    ${resp}

*** Test Cases ***
List MCP Tools Returns Tool List
    [Documentation]    Verify tool listing endpoint returns available tools
    [Tags]    mcp    tools    list
    Given Create MCP Session
    ${resp}=    List MCP Tools
    Status Should Be    200    ${resp}
    ${tools}=    Get Length    ${resp.json()}[tools]
    Should Be True    ${tools} > 0

MCP Tools List Includes DID Resolve
    [Documentation]    Verify DID resolve tool is listed
    [Tags]    mcp    tools    did
    Given Create MCP Session
    ${resp}=    List MCP Tools
    Status Should Be    200    ${resp}
    ${tool_names}=    Evaluate    [t["name"] for t in $resp.json()["tools"]]
    Should Contain    ${tool_names}    did_resolve

MCP Tools List Includes Credential Issue
    [Documentation]    Verify credential issue tool is listed
    [Tags]    mcp    tools    credential
    Given Create MCP Session
    ${resp}=    List MCP Tools
    Status Should Be    200    ${resp}
    ${tool_names}=    Evaluate    [t["name"] for t in $resp.json()["tools"]]
    Should Contain    ${tool_names}    credential_issue

MCP Tools List Includes Credential Verify
    [Documentation]    Verify credential verify tool is listed
    [Tags]    mcp    tools    verify
    Given Create MCP Session
    ${resp}=    List MCP Tools
    Status Should Be    200    ${resp}
    ${tool_names}=    Evaluate    [t["name"] for t in $resp.json()["tools"]]
    Should Contain    ${tool_names}    credential_verify

Call DID Resolve Tool
    [Documentation]    Verify calling DID resolve tool returns document
    [Tags]    mcp    call    did
    Given Create MCP Session
    ${args}=    Create Dictionary    did=did:key:z6MkfTest
    ${resp}=    Call MCP Tool    did_resolve    ${args}
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    result
    Should Contain    ${resp.json()}[result][id]    did:key

Call Credential Issue Tool
    [Documentation]    Verify calling credential issue tool returns credential
    [Tags]    mcp    call    credential
    Given Create MCP Session
    ${claims}=    Create Dictionary    name=Alice    age=30
    ${args}=    Create Dictionary    subjectDid=did:example:alice    type=VerifiableCredential    claims=${claims}
    ${resp}=    Call MCP Tool    credential_issue    ${args}
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}[result]    id
    Dictionary Should Contain Key    ${resp.json()}[result]    credentialSubject

Call Credential Verify Tool
    [Documentation]    Verify calling credential verify tool returns result
    [Tags]    mcp    call    verify
    Given Create MCP Session
    ${cred}=    Create Dictionary    id=urn:uuid:test    type=VerifiableCredential
    ${args}=    Create Dictionary    credential=${cred}
    ${resp}=    Call MCP Tool    credential_verify    ${args}
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}[result]    verified

Access DID Resource
    [Documentation]    Verify accessing DID resource returns document
    [Tags]    mcp    resource    did
    Given Create MCP Session
    ${resp}=    Access MCP Resource    did:key:z6MkfResourceTest
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    id

Call Tool With Missing Arguments Returns Error
    [Documentation]    Verify missing arguments return error
    [Tags]    mcp    error    validation
    Given Create MCP Session
    ${args}=    Create Dictionary
    ${resp}=    Call MCP Tool    did_resolve    ${args}
    Status Should Be    400    ${resp}

Call Unknown Tool Returns Error
    [Documentation]    Verify unknown tool returns 404
    [Tags]    mcp    error    unknown
    Given Create MCP Session
    ${args}=    Create Dictionary
    ${resp}=    Call MCP Tool    nonexistent_tool    ${args}
    Status Should Be    404    ${resp}

MCP Tools Include PQC Key Generation
    [Documentation]    Verify PQC key generation tool is listed
    [Tags]    mcp    tools    pqc
    Given Create MCP Session
    ${resp}=    List MCP Tools
    Status Should Be    200    ${resp}
    ${tool_names}=    Evaluate    [t["name"] for t in $resp.json()["tools"]]
    Should Contain    ${tool_names}    pqc_generate_key

Access Non-Existent Resource Returns Error
    [Documentation]    Verify accessing unknown resource returns 404
    [Tags]    mcp    resource    error
    Given Create MCP Session
    ${resp}=    Access MCP Resource    nonexistent/resource/path
    Status Should Be    404    ${resp}
