*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Create ArgoWf Session
Suite Teardown    Delete All Sessions

*** Variables ***
${ARGO_WF_BASE}    ${BASE_URL}/api/v1/argo/workflows
${WF_DIR}          ${BASE_DIR}/deploy/argo/workflows

*** Keywords ***
Create ArgoWf Session
    Create Session    argowf    ${BASE_URL}

Submit Workflow
    [Arguments]    ${template_name}    ${params}
    ${body}=    Create Dictionary    template=${template_name}    parameters=${params}
    ${resp}=    POST On Session    argowf    ${ARGO_WF_BASE}    json=${body}
    RETURN    ${resp}

Get Workflow Status
    [Arguments]    ${workflow_name}
    ${resp}=    GET On Session    argowf    ${ARGO_WF_BASE}/${workflow_name}
    RETURN    ${resp}

List Workflow Templates
    ${resp}=    GET On Session    argowf    ${ARGO_WF_BASE}/templates
    RETURN    ${resp}

Get Workflow Logs
    [Arguments]    ${workflow_name}    ${pod_name}
    ${resp}=    GET On Session    argowf    ${ARGO_WF_BASE}/${workflow_name}/logs/${pod_name}
    RETURN    ${resp}

Stop Workflow
    [Arguments]    ${workflow_name}
    ${resp}=    POST On Session    argowf    ${ARGO_WF_BASE}/${workflow_name}/stop
    RETURN    ${resp}

*** Test Cases ***
Argo Workflow Directory Exists
    [Documentation]    Verify Argo workflow templates directory exists
    [Tags]    argo    structure
    Directory Should Exist    ${WF_DIR}

Workflow Templates Defined
    [Documentation]    Verify workflow template YAML files exist
    [Tags]    argo    templates
    Directory Should Exist    ${WF_DIR}
    ${files}=    List Files In Directory    ${WF_DIR}
    ${count}=    Get Length    ${files}
    Should Be True    ${count} > 0

Submit Workflow From Template
    [Documentation]    Verify workflow can be submitted from template
    [Tags]    argo    submit
    ${params}=    Create Dictionary    branch=main    environment=staging
    ${resp}=    Submit Workflow    kyc-ci-pipeline    ${params}
    Status Should Be    201    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    status

Workflow Status Returns Progress
    [Documentation]    Verify workflow status endpoint returns progress
    [Tags]    argo    status
    ${params}=    Create Dictionary    branch=main
    ${wf}=    Submit Workflow    kyc-ci-pipeline    ${params}
    ${wf_name}=    Set Variable    ${wf.json()}[name]
    ${resp}=    Get Workflow Status    ${wf_name}
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    phase
    Dictionary Should Contain Key    ${resp.json()}    startedAt
    Dictionary Should Contain Key    ${resp.json()}    nodes

List Available Templates
    [Documentation]    Verify list templates endpoint returns available templates
    [Tags]    argo    templates    list
    ${resp}=    List Workflow Templates
    Status Should Be    200    ${resp}
    ${templates}=    Get Length    ${resp.json()}[templates]
    Should Be True    ${templates} > 0

Stop Running Workflow
    [Documentation]    Verify running workflow can be stopped
    [Tags]    argo    stop
    ${params}=    Create Dictionary    branch=feature/long-running
    ${wf}=    Submit Workflow    kyc-ci-pipeline    ${params}
    ${wf_name}=    Set Variable    ${wf.json()}[name]
    ${resp}=    Stop Workflow    ${wf_name}
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()}[status]    Stopped

Submit Workflow With Invalid Template Fails
    [Documentation]    Verify submitting non-existent template fails
    [Tags]    argo    submit    error
    ${params}=    Create Dictionary
    ${resp}=    Submit Workflow    non-existent-template    ${params}
    Status Should Be    404    ${resp}

Workflow Template Has Valid Yaml
    [Documentation]    Verify workflow template YAML is valid
    [Tags]    argo    validation
    ${files}=    List Files In Directory    ${WF_DIR}
    FOR    ${file}    IN    @{files}
        ${content}=    Get File    ${WF_DIR}/${file}
        Should Contain    ${content}    apiVersion
        Should Contain    ${content}    kind
    END

Workflow Logs Retrieval
    [Documentation]    Verify workflow logs endpoint works
    [Tags]    argo    logs
    ${params}=    Create Dictionary    branch=main
    ${wf}=    Submit Workflow    kyc-ci-pipeline    ${params}
    ${wf_name}=    Set Variable    ${wf.json()}[name]
    ${resp}=    Get Workflow Logs    ${wf_name}    main
    Status Should Be    200    ${resp}
