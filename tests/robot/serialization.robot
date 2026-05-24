*** Settings ***
Library    RequestsLibrary
Library    Collections
Resource    common.robot

Suite Setup    Create Serial Session
Suite Teardown    Delete All Sessions

*** Variables ***
${SERIAL_BASE}    ${BASE_URL}/api/v1/serialize

*** Keywords ***
Create Serial Session
    Create Session    serial    ${BASE_URL}

Serialize Data
    [Arguments]    ${data}    ${format}
    ${headers}=    Create Dictionary    Content-Type=application/json    Accept=application/${format}
    ${resp}=    POST On Session    serial    ${SERIAL_BASE}/encode    json=${data}    headers=${headers}
    RETURN    ${resp}

Deserialize Data
    [Arguments]    ${encoded_data}    ${format}
    ${headers}=    Create Dictionary    Content-Type=application/${format}
    ${body}=    Create Dictionary    data=${encoded_data}    format=${format}
    ${resp}=    POST On Session    serial    ${SERIAL_BASE}/decode    json=${body}    headers=${headers}
    RETURN    ${resp}

Get Supported Formats
    ${resp}=    GET On Session    serial    ${SERIAL_BASE}/formats
    RETURN    ${resp}

*** Test Cases ***
Json Serialization Roundtrip
    [Documentation]    Verify JSON serialize and deserialize roundtrip
    [Tags]    serial    json    roundtrip
    ${data}=    Create Dictionary    name=Alice    age=30    verified=${TRUE}
    ${encoded}=    Serialize Data    ${data}    json
    Status Should Be    200    ${encoded}
    ${decoded}=    Deserialize Data    ${encoded.json()}[encoded]    json
    Status Should Be    200    ${decoded}
    Should Be Equal    ${decoded.json()}[decoded][name]    Alice
    Should Be Equal As Integers    ${decoded.json()}[decoded][age]    30

Cbor Serialization Roundtrip
    [Documentation]    Verify CBOR serialize and deserialize roundtrip
    [Tags]    serial    cbor    roundtrip
    ${data}=    Create Dictionary    id=42    active=${TRUE}    tags=one    tags=two
    ${encoded}=    Serialize Data    ${data}    cbor
    Status Should Be    200    ${encoded}
    ${decoded}=    Deserialize Data    ${encoded.json()}[encoded]    cbor
    Status Should Be    200    ${decoded}
    Should Be Equal As Integers    ${decoded.json()}[decoded][id]    42

MsgPack Serialization Roundtrip
    [Documentation]    Verify MsgPack serialize and deserialize roundtrip
    [Tags]    serial    msgpack    roundtrip
    ${data}=    Create Dictionary    message=hello    count=100
    ${encoded}=    Serialize Data    ${data}    msgpack
    Status Should Be    200    ${encoded}
    ${decoded}=    Deserialize Data    ${encoded.json()}[encoded]    msgpack
    Status Should Be    200    ${decoded}
    Should Be Equal    ${decoded.json()}[decoded][message]    hello

Protobuf Serialization Roundtrip
    [Documentation]    Verify Protobuf serialize and deserialize roundtrip
    [Tags]    serial    protobuf    roundtrip
    ${data}=    Create Dictionary    id=1    name=Test    email=test@example.com
    ${encoded}=    Serialize Data    ${data}    protobuf
    Status Should Be    200    ${encoded}
    ${decoded}=    Deserialize Data    ${encoded.json()}[encoded]    protobuf
    Status Should Be    200    ${decoded}
    Should Be Equal    ${decoded.json()}[decoded][name]    Test

Avro Serialization Roundtrip
    [Documentation]    Verify Avro serialize and deserialize roundtrip
    [Tags]    serial    avro    roundtrip
    ${data}=    Create Dictionary    username=jdoe    email=j@example.com    role=admin
    ${encoded}=    Serialize Data    ${data}    avro
    Status Should Be    200    ${encoded}
    ${decoded}=    Deserialize Data    ${encoded.json()}[encoded]    avro
    Status Should Be    200    ${decoded}
    Should Be Equal    ${decoded.json()}[decoded][username]    jdoe

Unsupported Format Returns 400
    [Documentation]    Verify unsupported format returns 400
    [Tags]    serial    format    error
    ${data}=    Create Dictionary    test=value
    ${encoded}=    Serialize Data    ${data}    yaml
    Status Should Be    400    ${encoded}

Get Supported Formats List
    [Documentation]    Verify supported formats endpoint returns format list
    [Tags]    serial    formats    list
    ${resp}=    Get Supported Formats
    Status Should Be    200    ${resp}
    Should Contain    ${resp.json()}[formats]    json
    Should Contain    ${resp.json()}[formats]    cbor
    Should Contain    ${resp.json()}[formats]    msgpack
    Should Contain    ${resp.json()}[formats]    protobuf
    Should Contain    ${resp.json()}[formats]    avro

Deserialize Invalid Data Fails
    [Documentation]    Verify deserializing corrupt data returns 400
    [Tags]    serial    decode    error
    ${resp}=    Deserialize Data    aGVsbG8=    json
    Status Should Be    400    ${resp}

Large Payload Serialization
    [Documentation]    Verify serialization of large payloads
    [Tags]    serial    large    payload
    ${large}=    Create Dictionary    data=${EMPTY}
    FOR    ${i}    IN RANGE    100
        Set To Dictionary    ${large}    key${i}    value${i}
    END
    ${resp}=    Serialize Data    ${large}    json
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    encoded
    Dictionary Should Contain Key    ${resp.json()}    size
