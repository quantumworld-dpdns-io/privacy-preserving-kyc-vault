*** Settings ***
Library    RequestsLibrary
Library    Collections
Library    OperatingSystem
Library    String

*** Variables ***
${BASE_URL}    http://localhost:3000
${API_KEY}     test_api_key_placeholder

*** Keywords ***
Create API Session
    Create Session    kyc-vault    ${BASE_URL}    headers=${HEADERS}

*** Test Cases ***
OWASP-01: Broken Access Control - IDOR on Credential Endpoints
    [Documentation]    Verify that users cannot access other users' credentials
    Given Create API Session
    When I request credential "cred-001" without proper auth
    Then Response status should be 401 or 403

OWASP-01: Broken Access Control - Privilege Escalation
    [Documentation]    Verify low-privilege user cannot access admin endpoints
    Given Create API Session
    When I access admin endpoint "/api/v1/admin/users" with user token
    Then Response status should be 403

OWASP-02: Cryptographic Failures - Weak TLS Check
    [Documentation]    Verify server uses strong TLS ciphers
    Given Create API Session
    When I check TLS configuration
    Then TLS version should be 1.3 with strong ciphers

OWASP-02: Cryptographic Failures - Sensitive Data Exposure
    [Documentation]    Verify no sensitive data in responses
    Given Create API Session
    When I request credential details
    Then Response should not contain "password", "secret", or "private_key"

OWASP-03: Injection - SQL Injection
    [Documentation]    Verify endpoints are not vulnerable to SQL injection
    Given Create API Session
    When I send malicious input "' OR '1'='1" in DID parameter
    Then Response should indicate invalid input (4xx)

OWASP-03: Injection - NoSQL Injection
    [Documentation]    Verify NoSQL injection protection
    Given Create API Session
    When I send JSON with $gt operator in query
    Then Response should sanitize operator injection

OWASP-04: Insecure Design - Rate Limiting
    [Documentation]    Verify rate limiting is enforced
    Given Create API Session
    When I send 100 requests in 1 second
    Then Some requests should be rate-limited (429)

OWASP-04: Insecure Design - Missing Access Controls
    [Documentation]    Verify all endpoints have access controls
    When I enumerate all API endpoints
    Then Each endpoint should have authentication middleware

OWASP-05: Security Misconfiguration - Debug Endpoints
    [Documentation]    Verify debug endpoints are disabled in production
    Given Create API Session
    When I access "/debug", "/info", "/trace"
    Then Response should be 404

OWASP-05: Security Misconfiguration - Verbose Errors
    [Documentation]    Verify error messages don't leak internals
    Given Create API Session
    When I trigger an error with invalid input
    Then Error response should not include stack traces

OWASP-06: Vulnerable Components - Dependency Check
    [Documentation]    Verify no known vulnerable dependencies
    When I run OWASP Dependency Check
    Then No critical or high severity vulnerabilities found

OWASP-07: Authentication Flaws - Weak JWT
    [Documentation]    Verify JWT uses strong algorithms
    Given Create API Session
    When I decode the JWT token
    Then JWT algorithm should be RS256 or EdDSA, not "none"

OWASP-07: Authentication Flaws - Session Fixation
    [Documentation]    Verify session tokens change after login
    Given Create API Session
    When I authenticate and get a session token
    Then Token should be newly generated

OWASP-08: Integrity Failures - Unsigned Updates
    [Documentation]    Verify software updates are signed
    When I check update mechanism
    Then Updates should require cryptographic signature

OWASP-08: Integrity Failures - CSP Bypass
    [Documentation]    Verify Content Security Policy is set
    Given Create API Session
    When I check response headers
    Then Content-Security-Policy header should be present

OWASP-09: Logging Failures - Sensitive Data in Logs
    [Documentation]    Verify credentials not logged
    Given Create API Session
    When I perform operations with credentials
    Then Logs should not contain plaintext credentials

OWASP-09: Logging Failures - Missing Audit Trail
    [Documentation]    Verify sensitive operations are logged
    When I perform admin operations
    Then Audit log should capture who, what, when

OWASP-10: SSRF - Internal Network Access
    [Documentation]    Verify SSRF protection
    Given Create API Session
    When I request URL with "http://169.254.169.254" (metadata IP)
    Then Request should be rejected or sanitized
