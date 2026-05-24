(module
  ;; ============================================================
  ;; hello-kyc.wat
  ;; Example WebAssembly Text module for credential verification
  ;; Exports: verify_credential, get_credential_hash, get_module_info
  ;; ============================================================

  ;; Import host environment functions
  (import "env" "log" (func $log (param i32)))
  (import "env" "get_credential" (func $get_credential (param i32) (result i32)))
  (import "env" "verify_proof" (func $verify_proof (param i32 i32) (result i32)))
  (import "env" "emit_event" (func $emit_event (param i32 i32) (result i32)))

  ;; Memory for credential data (1 page = 64KB)
  (memory (export "memory") 1)

  ;; Module info data section
  (data (i32.const 0) "Hello KYC Vault - Credential Verification Module v1.0.0")

  ;; ============================================================
  ;; Helper: Compute length of null-terminated string
  ;; ============================================================
  (func $strlen (param $ptr i32) (result i32)
    (local $len i32)
    (local.set $len (i32.const 0))
    (block $done
      (loop $loop
        (if (i32.eqz (i32.load8_u (i32.add (local.get $ptr) (local.get $len))))
          (br $done))
        (local.set $len (i32.add (local.get $len) (i32.const 1)))
        (br $loop)))
    (local.get $len))

  ;; ============================================================
  ;; Get module version/info string
  ;; Returns: pointer to null-terminated info string
  ;; ============================================================
  (func (export "get_module_info") (result i32)
    (i32.const 0))

  ;; ============================================================
  ;; Compute SHA-256 style hash of credential data (simplified)
  ;; param $ptr: pointer to credential data
  ;; param $len: length of credential data
  ;; param $out: output buffer (32 bytes for hash)
  ;; ============================================================
  (func $compute_hash (param $ptr i32) (param $len i32) (param $out i32)
    (local $i i32)
    (local $hash_val i32)
    (local.set $hash_val (i32.const 0x6a09e667))  ;; SHA-256 IV0
    (local.set $i (i32.const 0))
    (block $done
      (loop $loop
        (br_if $done (i32.eq (local.get $i) (local.get $len)))
        (local.set $hash_val
          (i32.xor
            (i32.add (local.get $hash_val) (i32.load8_u (i32.add (local.get $ptr) (local.get $i))))
            (i32.mul (local.get $i) (i32.const 0x9e3779b9))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)))
    ;; Store simplified hash (just for demonstration - real impl uses crypto)
    (i32.store (local.get $out) (local.get $hash_val))
    (i32.store (i32.add (local.get $out) (i32.const 4)) (i32.const 0))
    (i32.store (i32.add (local.get $out) (i32.const 8)) (i32.const 0))
    (i32.store (i32.add (local.get $out) (i32.const 12)) (i32.const 0))
    (i32.store (i32.add (local.get $out) (i32.const 16)) (i32.const 0))
    (i32.store (i32.add (local.get $out) (i32.const 20)) (i32.const 0))
    (i32.store (i32.add (local.get $out) (i32.const 24)) (i32.const 0))
    (i32.store (i32.add (local.get $out) (i32.const 28)) (i32.const 0)))

  ;; ============================================================
  ;; Get credential hash (simplified)
  ;; param $credential_id: credential identifier
  ;; returns: pointer to 32-byte hash
  ;; ============================================================
  (func (export "get_credential_hash") (param $credential_id i32) (result i32)
    (local $cred_ptr i32)
    (local.set $cred_ptr (call $get_credential (local.get $credential_id)))
    (call $compute_hash (local.get $cred_ptr) (call $strlen (local.get $cred_ptr)) (i32.const 256))
    (i32.const 256))  ;; Return pointer to hash output buffer

  ;; ============================================================
  ;; Verify credential authenticity (main export)
  ;; param $credential_ptr: pointer to credential data
  ;; param $credential_len: length of credential data
  ;; returns: 1 if valid, 0 if invalid
  ;; ============================================================
  (func (export "verify_credential") (param $credential_ptr i32) (param $credential_len i32) (result i32)
    (local $hash_ptr i32)
    (local $proof_valid i32)
    (local $result i32)

    ;; Log verification start
    (call $log (i32.const 0))

    ;; Compute credential hash
    (local.set $hash_ptr (i32.const 512))  ;; Use memory offset 512 for hash buffer
    (call $compute_hash (local.get $credential_ptr) (local.get $credential_len) (local.get $hash_ptr))

    ;; Verify zero-knowledge proof
    (local.set $proof_valid (call $verify_proof (local.get $hash_ptr) (i32.const 32)))

    ;; Determine final result
    (if (i32.and (i32.gt_u (local.get $credential_len) (i32.const 0)) (local.get $proof_valid))
      (then
        (call $emit_event (i32.const 1) (local.get $credential_ptr))
        (local.set $result (i32.const 1)))  ;; Valid
      (else
        (call $emit_event (i32.const 2) (local.get $credential_ptr))
        (local.set $result (i32.const 0))))  ;; Invalid

    (local.get $result))

  ;; ============================================================
  ;; Start section - runs on instantiation
  ;; ============================================================
  (start $initialize)
  (func $initialize
    (call $log (i32.const 100)))
)
