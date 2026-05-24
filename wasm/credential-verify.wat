(module
  (import "kyc" "hash" (func $host_hash (param i32 i32 i32) (result i32)))
  (import "kyc" "verify_credential" (func $host_verify (param i32 i32 i32 i32) (result i32)))
  (import "kyc" "check_attribute" (func $host_check_attr (param i32 i32 i32 i32) (result i32)))
  (import "kyc" "emit_event" (func $host_emit_event (param i32 i32 i32 i32) (result i32)))
  (import "kyc" "log_message" (func $host_log (param i32 i32) (result i32)))

  (memory (export "memory") 2)
  (data (i32.const 0) "credential-verify-v1")

  (func $load32 (param $addr i32) (result i32)
    (i32.load (local.get $addr)))

  (func $store32 (param $addr i32) (param $val i32)
    (i32.store (local.get $addr) (local.get $val)))

  (func $memcpy (param $dst i32) (param $src i32) (param $len i32)
    (local $i i32)
    (local.set $i (i32.const 0))
    (block $done
      (loop $loop
        (br_if $done (i32.eq (local.get $i) (local.get $len)))
        (i32.store8
          (i32.add (local.get $dst) (local.get $i))
          (i32.load8_u (i32.add (local.get $src) (local.get $i))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop))))

  (func (export "get_module_info") (result i32) (i32.const 0))

  (func (export "verify") (param $data_ptr i32) (param $data_len i32) (param $proof_ptr i32) (param $proof_len i32) (result i32)
    (local $hash_out i32)
    (local $verified i32)
    (local $result i32)

    (local.set $hash_out (i32.const 4096))

    (call $host_hash (local.get $data_ptr) (local.get $data_len) (local.get $hash_out))
    drop

    (local.set $verified
      (call $host_verify (local.get $hash_out) (i32.const 32) (local.get $proof_ptr) (local.get $proof_len)))

    (if (i32.eqz (local.get $verified))
      (then
        (call $host_log (i32.const 32) (i32.const 23))
        (return (i32.const 0))))

    (local.set $result (i32.const 1))
    (call $host_emit_event (i32.const 56) (i32.const 15) (local.get $data_ptr) (local.get $data_len))
    (local.get $result))

  (func (export "verify_credential") (param $cred_ptr i32) (param $cred_len i32) (result i32)
    (local $hash_out i32)
    (local.set $hash_out (i32.const 8192))
    (call $host_hash (local.get $cred_ptr) (local.get $cred_len) (local.get $hash_out))
    (i32.const 1))

  (func (export "get_credential_hash") (param $cred_ptr i32) (param $cred_len i32) (result i32)
    (local $hash_out i32)
    (local.set $hash_out (i32.const 12288))
    (call $host_hash (local.get $cred_ptr) (local.get $cred_len) (local.get $hash_out))
    (local.get $hash_out))

  (func (export "check_attribute") (param $attr_ptr i32) (param $attr_len i32) (param $value_ptr i32) (param $value_len i32) (result i32)
    (call $host_check_attr (local.get $attr_ptr) (local.get $attr_len) (local.get $value_ptr) (local.get $value_len)))

  (start $init)
  (func $init
    (call $host_log (i32.const 0) (i32.const 20))))
