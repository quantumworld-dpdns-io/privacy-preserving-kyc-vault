*** Settings ***
Resource    ../resources/common.resource
Resource    ../resources/crypto.resource
Library     ../libs/CryptoLibrary.py
Library     ../libs/HPKELibrary.py
Library     ../libs/ShamirLibrary.py
Library     Collections
Library     OperatingSystem

Suite Setup       Initialize Crypto Suite
Suite Teardown    Cleanup Crypto Suite

*** Variables ***
${KEY_SIZE_BITS}              256
${HPKE_MODE}                  base
${HPKE_KEM_ID}                32
${HPKE_KDF_ID}                3
${HPKE_AEAD_ID}               1
${SHAMIR_SHARES}              5
${SHAMIR_THRESHOLD}           3
${SHAMIR_MODULUS}             2**127 - 1
${TEST_MESSAGE}               KYC Vault Test Credential Data - Confidential
${ITERATIONS}                 10

*** Keywords ***
Initialize Crypto Suite
    Import Library    CryptoLibrary
    Log    Crypto test suite initialized with ${ITERATIONS} iterations

Cleanup Crypto Suite
    Log    Crypto test suite cleanup complete

Generate Random Bytes
    [Arguments]    ${length}
    ${bytes}=    Evaluate    __import__('os').urandom(${length})
    [Return]    ${bytes}

*** Test Cases ***
Test ECDSA Key Generation
    [Documentation]    Verify ECDSA key pair generation produces valid keys
    [Tags]    crypto    ecdsa    key-generation
    FOR    ${i}    IN RANGE    ${ITERATIONS}
        ${keys}=    Generate ECDSA Key Pair    P-256
        Should Contain    ${keys}    private_key
        Should Contain    ${keys}    public_key
        ${private_len}=    Get Length    ${keys}[private_key]
        ${public_len}=    Get Length    ${keys}[public_key]
        Should Be True    ${private_len} > 0
        Should Be True    ${public_len} > 0
        Log    Generated ECDSA P-256 key pair: priv=${private_len}B, pub=${public_len}B
    END

Test Ed25519 Key Generation
    [Documentation]    Verify Ed25519 key pair generation
    [Tags]    crypto    ed25519    key-generation
    ${keys}=    Generate Ed25519 Key Pair
    Should Contain    ${keys}    private_key
    Should Contain    ${keys}    public_key
    Should Be Equal As Integers    ${keys}[private_key_bytes]    32
    Should Be Equal As Integers    ${keys}[public_key_bytes]    32
    Log    Generated Ed25519 key pair successfully

Test Signing and Verification (ECDSA)
    [Documentation]    Verify ECDSA signing and verification roundtrip
    [Tags]    crypto    ecdsa    signing
    ${keys}=    Generate ECDSA Key Pair    P-256
    ${message}=    Generate Random Bytes    64
    ${signature}=    Sign Message    ${keys}[private_key]    ${message}    P-256
    Should Be True    ${signature} != ${EMPTY}
    ${is_valid}=    Verify Signature    ${keys}[public_key]    ${message}    ${signature}    P-256
    Should Be True    ${is_valid}
    Log    ECDSA sign/verify roundtrip successful

Test Signing and Verification (Ed25519)
    [Documentation]    Verify Ed25519 signing and verification
    [Tags]    crypto    ed25519    signing
    ${keys}=    Generate Ed25519 Key Pair
    ${message}=    Generate Random Bytes    128
    ${signature}=    Sign Message    ${keys}[private_key]    ${message}    Ed25519
    ${is_valid}=    Verify Signature    ${keys}[public_key]    ${message}    ${signature}    Ed25519
    Should Be True    ${is_valid}
    Log    Ed25519 sign/verify roundtrip successful

Test Signature Tamper Detection
    [Documentation]    Verify tampered signatures are detected
    [Tags]    crypto    signing    tamper
    ${keys}=    Generate ECDSA Key Pair    P-256
    ${message}=    Generate Random Bytes    64
    ${signature}=    Sign Message    ${keys}[private_key]    ${message}    P-256
    ${tampered_message}=    Generate Random Bytes    64
    ${is_valid}=    Verify Signature    ${keys}[public_key]    ${tampered_message}    ${signature}    P-256
    Should Not Be True    ${is_valid}
    Log    Tampered signature correctly rejected

Test HPKE Encrypt Roundtrip (Base Mode)
    [Documentation]    Verify HPKE encryption and decryption roundtrip
    [Tags]    crypto    hpke    encryption
    ${receiver_keys}=    Generate ECDSA Key Pair    P-256
    ${info}=    Evaluate    b'kyc-vault-hpke-test'
    ${plaintext}=    Evaluate    b'${TEST_MESSAGE}'
    ${aad}=    Evaluate    b'kyc-vault-aad'
    ${encrypted}=    HPKE Seal Base
    ...    ${receiver_keys}[public_key]
    ...    ${info}
    ...    ${plaintext}
    ...    ${aad}
    Should Contain    ${encrypted}    ciphertext
    Should Contain    ${encrypted}    enc
    ${decrypted}=    HPKE Open Base
    ...    ${receiver_keys}[private_key]
    ...    ${info}
    ...    ${encrypted}[enc]
    ...    ${encrypted}[ciphertext]
    ...    ${aad}
    Should Be Equal    ${decrypted}    ${plaintext}
    Log    HPKE Base mode roundtrip successful

Test HPKE Encrypt Roundtrip (Auth Mode)
    [Documentation]    Verify HPKE Auth mode encryption roundtrip
    [Tags]    crypto    hpke    auth
    ${sender_keys}=    Generate ECDSA Key Pair    P-256
    ${receiver_keys}=    Generate ECDSA Key Pair    P-256
    ${info}=    Evaluate    b'kyc-vault-hpke-auth-test'
    ${plaintext}=    Evaluate    b'Authenticated HPKE test message'
    ${aad}=    Evaluate    b'kyc-vault-auth-aad'
    ${encrypted}=    HPKE Seal Auth
    ...    ${receiver_keys}[public_key]
    ...    ${info}
    ...    ${plaintext}
    ...    ${aad}
    ...    ${sender_keys}[private_key]
    Should Contain    ${encrypted}    ciphertext
    ${decrypted}=    HPKE Open Auth
    ...    ${receiver_keys}[private_key]
    ...    ${info}
    ...    ${encrypted}[enc]
    ...    ${encrypted}[ciphertext]
    ...    ${aad}
    ...    ${sender_keys}[public_key]
    Should Be Equal    ${decrypted}    ${plaintext}
    Log    HPKE Auth mode roundtrip successful

Test HPKE Tampered Ciphertext Detection
    [Documentation]    Verify tampered HPKE ciphertext is detected
    [Tags]    crypto    hpke    tamper
    ${keys}=    Generate ECDSA Key Pair    P-256
    ${info}=    Evaluate    b'kyc-vault-tamper-test'
    ${plaintext}=    Evaluate    b'Test message for tamper detection'
    ${aad}=    Evaluate    b'kyc-vault-aad'
    ${encrypted}=    HPKE Seal Base    ${keys}[public_key]    ${info}    ${plaintext}    ${aad}
    ${tampered}=    Evaluate    b'X' + ${encrypted}[ciphertext][1:]
    Run Keyword And Expect Error    *    HPKE Open Base
    ...    ${keys}[private_key]
    ...    ${info}
    ...    ${encrypted}[enc]
    ...    ${tampered}
    ...    ${aad}
    Log    Tampered HPKE ciphertext correctly rejected

Test Shamir Secret Sharing - Split and Recover
    [Documentation]    Verify Shamir secret sharing split and recovery
    [Tags]    crypto    shamir    secret-sharing
    ${secret}=    Evaluate    b'KYC-VAULT-MASTER-SECRET-2026'
    ${shares}=    Shamir Split    ${secret}    ${SHAMIR_SHARES}    ${SHAMIR_THRESHOLD}
    ${shares_count}=    Get Length    ${shares}
    Should Be Equal As Integers    ${shares_count}    ${SHAMIR_SHARES}
    ${recovered}=    Shamir Combine    ${shares}[:${SHAMIR_THRESHOLD}]
    Should Be Equal    ${recovered}    ${secret}
    Log    Shamir split/combine roundtrip successful with ${SHAMIR_SHARES} shares, threshold ${SHAMIR_THRESHOLD}

Test Shamir Secret Sharing - Threshold Requirement
    [Documentation]    Verify Shamir recovery requires threshold shares
    [Tags]    crypto    shamir    threshold
    ${secret}=    Evaluate    b'THRESHOLD-TEST-SECRET'
    ${shares}=    Shamir Split    ${secret}    5    3
    Run Keyword And Expect Error    *    Shamir Combine    ${shares}[:2]
    Log    Shamir correctly rejects insufficient shares (2 < threshold 3)

Test Shamir Secret Sharing - Any Threshold Subset Works
    [Documentation]    Verify any threshold-sized subset recovers the secret
    [Tags]    crypto    shamir    threshold
    ${secret}=    Evaluate    b'ANY-SUBSET-TEST'
    ${shares}=    Shamir Split    ${secret}    5    3
    ${subset1}=    Evaluate    [${shares}[0], ${shares}[2], ${shares}[4]]
    ${recovered1}=    Shamir Combine    ${subset1}
    Should Be Equal    ${recovered1}    ${secret}
    ${subset2}=    Evaluate    [${shares}[1], ${shares}[3], ${shares}[4]]
    ${recovered2}=    Shamir Combine    ${subset2}
    Should Be Equal    ${recovered2}    ${secret}
    Log    Any threshold=3 subset correctly recovers the secret

Test Hash Function - SHA-256
    [Documentation]    Verify SHA-256 hash computation
    [Tags]    crypto    hash    sha256
    ${data}=    Evaluate    b'KYC Vault Test Data'
    ${hash}=    Compute Hash    ${data}    SHA256
    Should Be Equal As Integers    ${hash}[digest_size]    32
    Should Be True    ${hash}[hex] != ${EMPTY}
    Log    SHA-256: ${hash}[hex]

Test Hash Function - SHA-384
    [Documentation]    Verify SHA-384 hash computation
    [Tags]    crypto    hash    sha384
    ${data}=    Evaluate    b'KYC Vault Test Data'
    ${hash}=    Compute Hash    ${data}    SHA384
    Should Be Equal As Integers    ${hash}[digest_size]    48
    Log    SHA-384: ${hash}[hex]

Test Hash Function - BLAKE2b
    [Documentation]    Verify BLAKE2b hash computation
    [Tags]    crypto    hash    blake2
    ${data}=    Evaluate    b'KYC Vault Test Data'
    ${hash}=    Compute Hash    ${data}    BLAKE2b
    Should Be Equal As Integers    ${hash}[digest_size]    64
    Log    BLAKE2b: ${hash}[hex]

Test HKDF Key Derivation
    [Documentation]    Verify HKDF-based key derivation
    [Tags]    crypto    kdf    hkdf
    ${ikm}=    Evaluate    b'KYC-Vault-Input-Key-Material'
    ${salt}=    Evaluate    b'KYC-Vault-Salt'
    ${info}=    Evaluate    b'kyc-vault-key-derivation'
    ${derived}=    HKDF Derive    ${ikm}    ${salt}    ${info}    32
    Should Be Equal As Integers    ${derived}[length]    32
    Should Be True    ${derived}[key] != ${EMPTY}
    Log    HKDF derived key: ${derived}[hex]

Test Deterministic Key Derivation Consistency
    [Documentation]    Verify HKDF produces consistent output for same inputs
    [Tags]    crypto    kdf    deterministic
    ${ikm}=    Evaluate    b'KYC-Vault-Deterministic-Input'
    ${salt}=    Evaluate    b'KYC-Vault-Deterministic-Salt'
    ${info}=    Evaluate    b'kyc-vault-deterministic-test'
    ${key1}=    HKDF Derive    ${ikm}    ${salt}    ${info}    32
    ${key2}=    HKDF Derive    ${ikm}    ${salt}    ${info}    32
    Should Be Equal    ${key1}[hex]    ${key2}[hex]
    Log    HKDF deterministic output verified
