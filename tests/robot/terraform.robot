*** Settings ***
Library    Collections
Library    OperatingSystem
Resource    common.robot

Suite Setup    Set Terraform Paths
Suite Teardown    No Operation

*** Variables ***
${TF_DIR}    ${BASE_DIR}/deploy/terraform

*** Keywords ***
Set Terraform Paths
    Directory Should Exist    ${TF_DIR}

Run Terraform Init
    ${rc}=    Run And Return Rc    terraform init -backend=false    ${TF_DIR}
    RETURN    ${rc}

Run Terraform Validate
    ${rc}=    Run And Return Rc    terraform validate    ${TF_DIR}
    RETURN    ${rc}

Run Terraform Plan
    ${rc}=    Run And Return Rc    terraform plan -detailed-exitcode    ${TF_DIR}
    RETURN    ${rc}

Run Terraform Output
    [Arguments]    ${output_name}
    ${result}=    Run Process    terraform    output    ${output_name}    cwd=${TF_DIR}
    RETURN    ${result.stdout}

Get Terraform Module Structure
    ${files}=    List Files In Directory    ${TF_DIR}/modules
    RETURN    ${files}

*** Test Cases ***
Terraform Directory Exists
    [Documentation]    Verify Terraform directory structure exists
    [Tags]    terraform    structure
    Directory Should Exist    ${TF_DIR}
    File Should Exist    ${TF_DIR}/main.tf
    File Should Exist    ${TF_DIR}/variables.tf
    File Should Exist    ${TF_DIR}/outputs.tf

Terraform Modules Directory Exists
    [Documentation]    Verify Terraform modules directory exists
    [Tags]    terraform    modules
    Directory Should Exist    ${TF_DIR}/modules

Terraform Init Succeeds
    [Documentation]    Verify terraform init completes without error
    [Tags]    terraform    init
    ${rc}=    Run Terraform Init
    Should Be Equal As Integers    ${rc}    0

Terraform Validate Succeeds
    [Documentation]    Verify terraform validate passes
    [Tags]    terraform    validate
    ${rc}=    Run Terraform Validate
    Should Be Equal As Integers    ${rc}    0

Terraform Plan Succeeds
    [Documentation]    Verify terraform plan generates output
    [Tags]    terraform    plan
    ${rc}=    Run Terraform Plan
    Should Be Equal As Integers    ${rc}    0

Terraform Outputs Defined
    [Documentation]    Verify outputs.tf defines expected outputs
    [Tags]    terraform    outputs
    ${content}=    Get File    ${TF_DIR}/outputs.tf
    Should Contain    ${content}    output

Terraform Variables Have Types
    [Documentation]    Verify variables.tf has type constraints
    [Tags]    terraform    variables
    ${content}=    Get File    ${TF_DIR}/variables.tf
    Should Contain    ${content}    type

Main Tf References Modules
    [Documentation]    Verify main.tf references module blocks
    [Tags]    terraform    modules
    ${content}=    Get File    ${TF_DIR}/main.tf
    Should Contain    ${content}    module

Terraform Required Provider
    [Documentation]    Verify terraform configuration has required providers
    [Tags]    terraform    provider
    ${content}=    Get File    ${TF_DIR}/main.tf
    Should Contain    ${content}    required_providers

Terraform Backend Configuration
    [Documentation]    Verify terraform has backend configuration
    [Tags]    terraform    backend
    ${content}=    Get File    ${TF_DIR}/main.tf
    Should Contain    ${content}    backend
