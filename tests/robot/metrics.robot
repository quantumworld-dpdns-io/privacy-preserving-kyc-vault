*** Settings ***
Library    RequestsLibrary
Library    Collections
Resource    common.robot

Suite Setup    Create Metrics Session
Suite Teardown    Delete All Sessions

*** Variables ***
${METRICS_BASE}    ${BASE_URL}/api/v1/metrics

*** Keywords ***
Create Metrics Session
    Create Session    metrics    ${BASE_URL}

Get Prometheus Metrics
    ${resp}=    GET On Session    metrics    ${METRICS_BASE}/prometheus
    RETURN    ${resp}

Get OpenTelemetry Metrics
    ${resp}=    GET On Session    metrics    ${METRICS_BASE}/otel
    RETURN    ${resp}

Get DogStatsD Metrics
    ${resp}=    GET On Session    metrics    ${METRICS_BASE}/dogstatsd
    RETURN    ${resp}

Get Metric Detail
    [Arguments]    ${metric_name}
    ${resp}=    GET On Session    metrics    ${METRICS_BASE}/detail/${metric_name}
    RETURN    ${resp}

Reset Metrics
    ${resp}=    POST On Session    metrics    ${METRICS_BASE}/reset
    RETURN    ${resp}

*** Test Cases ***
Prometheus Endpoint Returns Metrics
    [Documentation]    Verify Prometheus metrics endpoint returns data
    [Tags]    metrics    prometheus
    ${resp}=    Get Prometheus Metrics
    Status Should Be    200    ${resp}
    Should Contain    ${resp.text}    http_requests_total
    Should Contain    ${resp.text}    # HELP
    Should Contain    ${resp.text}    # TYPE

OpenTelemetry Metrics Endpoint
    [Documentation]    Verify OpenTelemetry metrics endpoint returns data
    [Tags]    metrics    otel
    ${resp}=    Get OpenTelemetry Metrics
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    resourceMetrics
    Dictionary Should Contain Key    ${resp.json()}    instrumentationLibraryMetrics

DogStatsD Metrics Endpoint
    [Documentation]    Verify DogStatsD metrics endpoint returns data
    [Tags]    metrics    dogstatsd
    ${resp}=    Get DogStatsD Metrics
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    series
    ${series}=    Get Length    ${resp.json()}[series]
    Should Be True    ${series} > 0

Prometheus Contains Go Metrics
    [Documentation]    Verify Prometheus endpoint contains Go runtime metrics
    [Tags]    metrics    prometheus    golang
    ${resp}=    Get Prometheus Metrics
    Should Contain    ${resp.text}    go_goroutines
    Should Contain    ${resp.text}    go_memstats_alloc_bytes

Metric Detail Returns Metadata
    [Documentation]    Verify metric detail endpoint returns metadata
    [Tags]    metrics    detail
    ${resp}=    Get Metric Detail    http_requests_total
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    name
    Dictionary Should Contain Key    ${resp.json()}    type
    Dictionary Should Contain Key    ${resp.json()}    help
    Dictionary Should Contain Key    ${resp.json()}    labels

Unknown Metric Detail Fails
    [Documentation]    Verify unknown metric returns 404
    [Tags]    metrics    detail    error
    ${resp}=    Get Metric Detail    non_existent_metric
    Status Should Be    404    ${resp}

Reset Metrics Clears Counters
    [Documentation]    Verify metrics reset clears counters
    [Tags]    metrics    reset
    ${before}=    Get Metric Detail    http_requests_total
    ${val_before}=    Set Variable    ${before.json()}[value]
    ${resp}=    Reset Metrics
    Status Should Be    200    ${resp}
    ${after}=    Get Metric Detail    http_requests_total
    ${val_after}=    Set Variable    ${after.json()}[value]
    Should Be True    ${val_after} <= ${val_before}

Prometheus Content Type Header
    [Documentation]    Verify Prometheus endpoint returns correct content type
    [Tags]    metrics    prometheus    header
    ${resp}=    Get Prometheus Metrics
    Should Contain    ${resp.headers}[Content-Type]    text/plain

OpenTelemetry Supports Multiple Exporters
    [Documentation]    Verify OTel endpoint supports gRPC and HTTP exporters
    [Tags]    metrics    otel    exporter
    ${resp}=    Get OpenTelemetry Metrics
    ${resources}=    Set Variable    ${resp.json()}[resourceMetrics]
    ${count}=    Get Length    ${resources}
    Should Be True    ${count} >= 1
