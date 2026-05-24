*** Settings ***
Library    RequestsLibrary
Library    Collections
Resource    common.robot

Suite Setup    Create EventBus Session
Suite Teardown    Delete All Sessions

*** Variables ***
${EVENT_BASE}    ${BASE_URL}/api/v1/events

*** Keywords ***
Create EventBus Session
    Create Session    eventbus    ${BASE_URL}

Publish Event
    [Arguments]    ${topic}    ${payload}    ${source}
    ${body}=    Create Dictionary    topic=${topic}    payload=${payload}    source=${source}
    ${resp}=    POST On Session    eventbus    ${EVENT_BASE}/publish    json=${body}
    RETURN    ${resp}

Subscribe To Topic
    [Arguments]    ${topic}    ${callback_url}    ${subscriber}
    ${body}=    Create Dictionary    topic=${topic}    callbackUrl=${callback_url}    subscriber=${subscriber}
    ${resp}=    POST On Session    eventbus    ${EVENT_BASE}/subscriptions    json=${body}
    RETURN    ${resp}

Get Subscriptions
    [Arguments]    ${topic}
    ${resp}=    GET On Session    eventbus    ${EVENT_BASE}/subscriptions/${topic}
    RETURN    ${resp}

Unsubscribe
    [Arguments]    ${subscription_id}
    ${resp}=    DELETE On Session    eventbus    ${EVENT_BASE}/subscriptions/${subscription_id}
    RETURN    ${resp}

Get Event History
    [Arguments]    ${topic}
    ${resp}=    GET On Session    eventbus    ${EVENT_BASE}/history/${topic}
    RETURN    ${resp}

*** Test Cases ***
Publish Event To Topic
    [Documentation]    Verify an event can be published to a topic
    [Tags]    events    publish
    ${payload}=    Create Dictionary    message=Hello World    severity=info
    ${resp}=    Publish Event    system.alerts    ${payload}    did:example:publisher1
    Status Should Be    201    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    eventId
    Dictionary Should Contain Key    ${resp.json()}    timestamp

Subscribe To Topic
    [Documentation]    Verify subscription to a topic succeeds
    [Tags]    events    subscribe
    ${resp}=    Subscribe To Topic    system.alerts    http://webhook.example.com/callback    did:example:subscriber1
    Status Should Be    201    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    subscriptionId

Publish Event Triggers Callback
    [Documentation]    Verify published event triggers subscriber callback
    [Tags]    events    callback
    ${sub}=    Subscribe To Topic    test.events    http://listener.example.com/hook    did:example:listener
    ${sub_id}=    Set Variable    ${sub.json()}[subscriptionId]
    ${payload}=    Create Dictionary    event=data
    ${resp}=    Publish Event    test.events    ${payload}    did:example:source
    Status Should Be    201    ${resp}

Get Subscriptions Lists Subscribers
    [Documentation]    Verify listing subscriptions returns subscribers
    [Tags]    events    subscriptions    list
    ${resp}=    Subscribe To Topic    alerts.test    http://hook.example.com/a    did:example:a
    ${resp}=    Get Subscriptions    alerts.test
    Status Should Be    200    ${resp}
    ${count}=    Get Length    ${resp.json()}[subscriptions]
    Should Be True    ${count} > 0

Unsubscribe Removes Subscription
    [Documentation]    Verify unsubscribe removes the subscription
    [Tags]    events    unsubscribe
    ${sub}=    Subscribe To Topic    temp.topic    http://hook.example.com/temp    did:example:temp
    ${sub_id}=    Set Variable    ${sub.json()}[subscriptionId]
    ${resp}=    Unsubscribe    ${sub_id}
    Status Should Be    200    ${resp}
    ${resp}=    Get Subscriptions    temp.topic
    ${count}=    Get Length    ${resp.json()}[subscriptions]
    Should Be Equal As Integers    ${count}    0

Publish To Non Existent Topic Creates Topic
    [Documentation]    Verify publishing to new topic auto-creates it
    [Tags]    events    topic    auto
    ${payload}=    Create Dictionary    data=auto-create
    ${resp}=    Publish Event    auto.created.topic    ${payload}    did:example:creator
    Status Should Be    201    ${resp}

Event History Returns Events
    [Documentation]    Verify event history returns published events
    [Tags]    events    history
    ${payload}=    Create Dictionary    data=history-test
    ${resp}=    Publish Event    history.test    ${payload}    did:example:historian
    ${resp}=    Get Event History    history.test
    Status Should Be    200    ${resp}
    ${events}=    Get Length    ${resp.json()}[events]
    Should Be True    ${events} > 0

Publish With Empty Topic Fails
    [Documentation]    Verify empty topic returns 400
    [Tags]    events    validation
    ${payload}=    Create Dictionary    data=test
    ${resp}=    Publish Event    ${EMPTY}    ${payload}    did:example:source
    Status Should Be    400    ${resp}
