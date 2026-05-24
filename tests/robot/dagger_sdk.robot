*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create Dagger Session
Suite Teardown    Delete All Sessions

*** Variables ***
${DAGGER_BASE}    ${BASE_URL}/api/v1/dagger
${DAGGER_DIR}    ${BASE_DIR}/ci/dagger

*** Keywords ***
Create Dagger Session
    Create Session    dagger    ${BASE_URL}

Run Dagger Pipeline
    [Arguments]    ${pipeline_name}    ${params}
    ${body}=    Create Dictionary    pipeline=${pipeline_name}    parameters=${params}
    ${resp}=    POST On Session    dagger    ${DAGGER_BASE}/execute    json=${body}
    RETURN    ${resp}

Get Pipeline Status
    [Arguments]    ${run_id}
    ${resp}=    GET On Session    dagger    ${DAGGER_BASE}/runs/${run_id}
    RETURN    ${resp}

List Dagger Pipelines
    ${resp}=    GET On Session    dagger    ${DAGGER_BASE}/pipelines
    RETURN    ${resp}

Get Pipeline Logs
    [Arguments]    ${run_id}
    ${resp}=    GET On Session    dagger    ${DAGGER_BASE}/runs/${run_id}/logs
    RETURN    ${resp}

*** Test Cases ***
Dagger Pipeline Directory Exists
    [Documentation]    Verify Dagger pipeline directory exists
    [Tags]    dagger    structure
    Directory Should Exist    ${DAGGER_DIR}

Dagger Pipeline File Exists
    [Documentation]    Verify Dagger pipeline definition files exist
    [Tags]    dagger    pipeline    files
    ${files}=    List Files In Directory    ${DAGGER_DIR}
    ${count}=    Get Length    ${files}
    Should Be True    ${count} > 0

List Available Pipelines
    [Documentation]    Verify list pipelines endpoint returns pipeline list
    [Tags]    dagger    pipelines    list
    ${resp}=    List Dagger Pipelines
    Status Should Be    200    ${resp}
    ${pipelines}=    Get Length    ${resp.json()}[pipelines]
    Should Be True    ${pipelines} > 0

Execute Dagger Pipeline
    [Documentation]    Verify a Dagger pipeline can be executed
    [Tags]    dagger    execute
    ${params}=    Create Dictionary    branch=main    commit=abc123
    ${resp}=    Run Dagger Pipeline    build-and-test    ${params}
    Status Should Be    201    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    runId
    Dictionary Should Contain Key    ${resp.json()}    status

Pipeline Status Returns Details
    [Documentation]    Verify pipeline status endpoint returns details
    [Tags]    dagger    status
    ${params}=    Create Dictionary    branch=main
    ${run}=    Run Dagger Pipeline    build-and-test    ${params}
    ${run_id}=    Set Variable    ${run.json()}[runId]
    ${resp}=    Get Pipeline Status    ${run_id}
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    pipeline
    Dictionary Should Contain Key    ${resp.json()}    status
    Dictionary Should Contain Key    ${resp.json()}    startedAt

Pipeline Execution With Invalid Name Fails
    [Documentation]    Verify executing non-existent pipeline fails
    [Tags]    dagger    execute    error
    ${params}=    Create Dictionary
    ${resp}=    Run Dagger Pipeline    non-existent-pipeline    ${params}
    Status Should Be    404    ${resp}

Pipeline Logs Retrieval
    [Documentation]    Verify pipeline logs endpoint returns log data
    [Tags]    dagger    logs
    ${params}=    Create Dictionary    branch=main
    ${run}=    Run Dagger Pipeline    build-and-test    ${params}
    ${run_id}=    Set Variable    ${run.json()}[runId]
    ${resp}=    Get Pipeline Logs    ${run_id}
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    logs

Dagger Module File Content
    [Documentation]    Verify Dagger module files have valid structure
    [Tags]    dagger    modules
    ${files}=    List Files In Directory    ${DAGGER_DIR}
    FOR    ${file}    IN    @{files}
        ${content}=    Get File    ${DAGGER_DIR}/${file}
        Should Contain    ${content}    import
    END
