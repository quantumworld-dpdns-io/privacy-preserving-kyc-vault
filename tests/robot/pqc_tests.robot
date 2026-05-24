*** Settings ***
Resource    ../resources/common.resource
Library     ../libs/PQCLibrary.py
Library     ../libs/CryptoLibrary.py
Library     Collections
Library     OperatingSystem

Suite Setup       Initialize PQC Suite
Suite Teardown    Cleanup PQC Suite

*** Variables ***
${MLKEM_MODE}          ML-KEM-768
${MLDSA_MODE}          ML-DSA-65
${SLHDSA_MODE}         SLH-DSA-SHAKE-128s
${FN_DSA_MODE}         FN-DSA-512
${TEST_MESSAGE}        KYC Vault PQC Test - Post-Quantum Signature
${PQC_ITERATIONS}      5

*** Keywords ***
Initialize PQC Suite
    Import Library    PQCLibrary
    Log    PQC test suite initialized with modes: ${MLKEM_MODE}, ${MLDSA_MODE}, ${SLHDSA_MODE}

Cleanup PQC Suite
    Log    PQC test suite cleanup complete

*** Test Cases ***
Test ML-KEM Key Generation
    [Documentation]    Verify ML-KEM (Kyber) key pair generation
    [Tags]    pqc    ml-kem    kyber    key-generation
    FOR    ${mode}    IN    ML-KEM-512    ML-KEM-768    ML-KEM-1024
        ${keys}=    Generate MLKEM Key Pair    ${mode}
        Should Contain    ${keys}    private_key
        Should Contain    ${keys}    public_key
        ${pk_len}=    Get Length    ${keys}[public_key]
        ${sk_len}=    Get Length    ${keys}[private_key]
        Log    ${mode}: pk=${pk_len}B, sk=${sk_len}B
    END

Test ML-KEM Encapsulation Roundtrip
    [Documentation]    Verify ML-KEM encaps/decaps roundtrip
    [Tags]    pqc    ml-kem    kyber    kem
    ${keys}=    Generate MLKEM Key Pair    ML-KEM-768
    ${encaps}=    MLKEM Encapsulate    ${keys}[public_key]
    Should Contain    ${encaps}    ciphertext
    Should Contain    ${encaps}    shared_secret
    ${decaps}=    MLKEM Decapsulate    ${keys}[private_key]    ${encaps}[ciphertext]
    Should Be Equal    ${decaps}[shared_secret]    ${encaps}[shared_secret]
    Log    ML-KEM-768 encaps/decaps roundtrip successful

Test ML-KEM Multiple Encapsulations
    [Documentation]    Verify each encapsulation produces unique shared secret
    [Tags]    pqc    ml-kem    kyber    kem
    ${keys}=    Generate MLKEM Key Pair    ML-KEM-768
    ${secrets}=    Create List
    FOR    ${i}    IN RANGE    5
        ${encaps}=    MLKEM Encapsulate    ${keys}[public_key]
        Append To List    ${secrets}    ${encaps}[shared_secret]
    END
    ${unique}=    Evaluate    len(set(${secrets}))
    Should Be Equal As Integers    ${unique}    5
    Log    All 5 encapsulations produced unique shared secrets

Test ML-DSA Key Generation
    [Documentation]    Verify ML-DSA (Dilithium) key pair generation
    [Tags]    pqc    ml-dsa    dilithium    key-generation
    FOR    ${mode}    IN    ML-DSA-44    ML-DSA-65    ML-DSA-87
        ${keys}=    Generate MLDSA Key Pair    ${mode}
        Should Contain    ${keys}    private_key
        Should Contain    ${keys}    public_key
        Log    ${mode}: keys generated successfully
    END

Test ML-DSA Signing and Verification
    [Documentation]    Verify ML-DSA signing and verification roundtrip
    [Tags]    pqc    ml-dsa    dilithium    signing
    ${keys}=    Generate MLDSA Key Pair    ML-DSA-65
    ${message}=    Evaluate    b'${TEST_MESSAGE}'
    ${signature}=    MLDSA Sign    ${keys}[private_key]    ${message}
    Should Be True    ${signature} != ${EMPTY}
    ${is_valid}=    MLDSA Verify    ${keys}[public_key]    ${message}    ${signature}
    Should Be True    ${is_valid}
    Log    ML-DSA-65 sign/verify roundtrip successful

Test ML-DSA Tamper Detection
    [Documentation]    Verify tampered ML-DSA signatures are detected
    [Tags]    pqc    ml-dsa    tamper
    ${keys}=    Generate MLDSA Key Pair    ML-DSA-65
    ${message}=    Evaluate    b'Sensitive KYC credential data'
    ${signature}=    MLDSA Sign    ${keys}[private_key]    ${message}
    ${tampered_msg}=    Evaluate    b'Tampered KYC credential data'
    ${is_valid}=    MLDSA Verify    ${keys}[public_key]    ${tampered_msg}    ${signature}
    Should Not Be True    ${is_valid}
    Log    Tampered message correctly rejected by ML-DSA-65

Test SLH-DSA Key Generation (SPHINCS+)
    [Documentation]    Verify SLH-DSA (SPHINCS+) key generation
    [Tags]    pqc    slh-dsa    sphincs    key-generation
    ${keys}=    Generate SLHDSA Key Pair    SLH-DSA-SHAKE-128s
    Should Contain    ${keys}    private_key
    Should Contain    ${keys}    public_key
    Log    SLH-DSA-SHAKE-128s keys generated

Test SLH-DSA Signing and Verification
    [Documentation]    Verify SLH-DSA signing and verification
    [Tags]    pqc    slh-dsa    sphincs    signing
    ${keys}=    Generate SLHDSA Key Pair    SLH-DSA-SHAKE-128s
    ${message}=    Evaluate    b'KYC Vault stateful hash-based signature test'
    ${signature}=    SLHDSA Sign    ${keys}[private_key]    ${message}
    Should Be True    ${signature} != ${EMPTY}
    ${is_valid}=    SLHDSA Verify    ${keys}[public_key]    ${message}    ${signature}
    Should Be True    ${is_valid}
    Log    SLH-DSA sign/verify roundtrip successful

Test FN-DSA Key Generation (FALCON)
    [Documentation]    Verify FN-DSA (FALCON) key generation
    [Tags]    pqc    fn-dsa    falcon    key-generation
    ${keys}=    Generate FNDSA Key Pair    FN-DSA-512
    Should Contain    ${keys}    private_key
    Should Contain    ${keys}    public_key
    Log    FN-DSA-512 keys generated

Test FN-DSA Signing and Verification
    [Documentation]    Verify FN-DSA signing and verification
    [Tags]    pqc    fn-dsa    falcon    signing
    ${keys}=    Generate FNDSA Key Pair    FN-DSA-512
    ${message}=    Evaluate    b'KYC Vault compact lattice signature test'
    ${signature}=    FNDSA Sign    ${keys}[private_key]    ${message}
    Should Be True    ${signature} != ${EMPTY}
    ${is_valid}=    FNDSA Verify    ${keys}[public_key]    ${message}    ${signature}
    Should Be True    ${is_valid}
    Log    FN-DSA-512 sign/verify roundtrip successful

Test Hybrid PQC + ECDSA Signature
    [Documentation]    Verify hybrid classical+PQC signature scheme
    [Tags]    pqc    hybrid    signature
    ${ec_keys}=    Generate ECDSA Key Pair    P-256
    ${pqc_keys}=    Generate MLDSA Key Pair    ML-DSA-65
    ${message}=    Evaluate    b'KYC Vault hybrid signature test'
    ${ec_sig}=    Sign Message    ${ec_keys}[private_key]    ${message}    P-256
    ${pqc_sig}=    MLDSA Sign    ${pqc_keys}[private_key]    ${message}
    ${ec_valid}=    Verify Signature    ${ec_keys}[public_key]    ${message}    ${ec_sig}    P-256
    ${pqc_valid}=    MLDSA Verify    ${pqc_keys}[public_key]    ${message}    ${pqc_sig}
    Should Be True    ${ec_valid} AND ${pqc_valid}
    Log    Hybrid ECDSA P-256 + ML-DSA-65 signature verified

Test Hybrid KEM (HPKE + ML-KEM)
    [Documentation]    Verify hybrid encryption using HPKE and ML-KEM
    [Tags]    pqc    hybrid    kem    encryption
    ${kyber_keys}=    Generate MLKEM Key Pair    ML-KEM-768
    ${ec_keys}=    Generate ECDSA Key Pair    P-256
    ${plaintext}=    Evaluate    b'KYC Vault hybrid encrypted credential'
    ${kem_encaps}=    MLKEM Encapsulate    ${kyber_keys}[public_key]
    ${hpke_encrypted}=    HPKE Seal Base    ${ec_keys}[public_key]    b'hybrid-info'    ${plaintext}    b'hybrid-aad'
    Should Contain    ${kem_encaps}    shared_secret
    Should Contain    ${hpke_encrypted}    ciphertext
    Log    Hybrid KEM (ML-KEM + HPKE) encryption successful

Test PQC Key Serialization
    [Documentation]    Verify PQC key serialization to PEM/DER format
    [Tags]    pqc    serialization    key-format
    ${keys}=    Generate MLDSA Key Pair    ML-DSA-65
    ${pem_public}=    Serialize Public Key    ${keys}[public_key]    PEM
    ${pem_private}=    Serialize Private Key    ${keys}[private_key]    PEM
    Should Contain    ${pem_public}    BEGIN PUBLIC KEY
    Should Contain    ${pem_private}    BEGIN PRIVATE KEY
    ${deserialized_pub}=    Deserialize Public Key    ${pem_public}    PEM
    Should Be Equal    ${deserialized_pub}    ${keys}[public_key]
    Log    ML-DSA-65 key PEM serialization roundtrip successful

Test PQC Performance Benchmark
    [Documentation]    Measure PQC operation latency
    [Tags]    pqc    benchmark    performance
    ${timing}=    Benchmark PQC Operations    iterations=10
    Should Be True    ${timing}[ml_kem_keygen_ms] > 0
    Should Be True    ${timing}[ml_dsa_sign_ms] > 0
    Should Be True    ${timing}[ml_dsa_verify_ms] > 0
    Log    ML-KEM keygen: ${timing}[ml_kem_keygen_ms]ms
    Log    ML-DSA sign: ${timing}[ml_dsa_sign_ms]ms
    Log    ML-DSA verify: ${timing}[ml_dsa_verify_ms]ms
