(module
  (import "kyc" "hash" (func $host_hash (param i32 i32 i32) (result i32)))
  (import "kyc" "random_bytes" (func $host_random (param i32 i32) (result i32)))
  (import "kyc" "emit_event" (func $host_emit_event (param i32 i32 i32 i32) (result i32)))
  (import "kyc" "log_message" (func $host_log (param i32 i32) (result i32)))

  (memory (export "memory") 2)
  (data (i32.const 0) "age-proof-v1")

  (data (i32.const 64) "committed-age-proof")
  (data (i32.const 84) "age-range-proof")
  (data (i32.const 100) "age-proof-verified")
  (data (i32.const 120) "age-proof-failed")

  (func (export "get_module_info") (result i32) (i32.const 0))

  (func $write32 (param $addr i32) (param $val i32)
    (i32.store (local.get $addr) (local.get $val)))

  (func $read32 (param $addr i32) (result i32)
    (i32.load (local.get $addr)))

  (func (export "prove_age_range") (param $age_ptr i32) (param $age_len i32) (param $min i32) (param $max i32) (result i32)
    (local $age_val i32)
    (local $age_str i32)
    (local $age_parsed i32)
    (local $in_range i32)
    (local $proof_ptr i32)
    (local $random_buf i32)
    (local $hash_buf i32)

    (local.set $proof_ptr (i32.const 16384))
    (local.set $hash_buf (i32.const 20480))

    (call $host_hash (local.get $age_ptr) (local.get $age_len) (local.get $hash_buf))
    drop

    (local.set $random_buf (i32.const 24576))
    (call $host_random (local.get $random_buf) (i32.const 32))
    drop

    (local.set $age_parsed (i32.const 0))
    (local.set $age_str (local.get $age_ptr))
    (block $parse_done
      (loop $parse_loop
        (br_if $parse_done (i32.eq (local.get $age_str) (i32.add (local.get $age_ptr) (local.get $age_len))))
        (local.set $age_parsed
          (i32.add
            (i32.mul (local.get $age_parsed) (i32.const 10))
            (i32.sub (i32.load8_u (local.get $age_str)) (i32.const 48))))
        (local.set $age_str (i32.add (local.get $age_str) (i32.const 1)))
        (br $parse_loop)))

    (local.set $in_range
      (i32.and
        (i32.ge_s (local.get $age_parsed) (local.get $min))
        (i32.le_s (local.get $age_parsed) (local.get $max))))

    (if (i32.eqz (local.get $in_range))
      (then
        (call $host_emit_event (i32.const 120) (i32.const 15) (local.get $proof_ptr) (i32.const 0))
        (return (i32.const 0))))

    (call $write32 (local.get $proof_ptr) (local.get $age_parsed))
    (call $write32 (i32.add (local.get $proof_ptr) (i32.const 4)) (local.get $min))
    (call $write32 (i32.add (local.get $proof_ptr) (i32.const 8)) (local.get $max))

    (call $host_emit_event (i32.const 100) (i32.const 16) (local.get $proof_ptr) (i32.const 12))

    (i32.const 1))

  (func (export "verify_age_range") (param $proof_ptr i32) (param $proof_len i32) (param $min i32) (param $max i32) (result i32)
    (local $committed_age i32)
    (local $committed_min i32)
    (local $committed_max i32)

    (if (i32.lt_u (local.get $proof_len) (i32.const 12))
      (then (return (i32.const 0))))

    (local.set $committed_age (call $read32 (local.get $proof_ptr)))
    (local.set $committed_min (call $read32 (i32.add (local.get $proof_ptr) (i32.const 4))))
    (local.set $committed_max (call $read32 (i32.add (local.get $proof_ptr) (i32.const 8))))

    (if (i32.ne (local.get $committed_min) (local.get $min))
      (then (return (i32.const 0))))
    (if (i32.ne (local.get $committed_max) (local.get $max))
      (then (return (i32.const 0))))

    (if (i32.and
          (i32.ge_s (local.get $committed_age) (local.get $min))
          (i32.le_s (local.get $committed_age) (local.get $max)))
      (then
        (call $host_emit_event (i32.const 100) (i32.const 16) (local.get $proof_ptr) (local.get $proof_len))
        (return (i32.const 1)))
      (else
        (return (i32.const 0)))))

  (func (export "commit_age") (param $age_ptr i32) (param $age_len i32) (result i32)
    (local $commitment_ptr i32)
    (local $random_buf i32)

    (local.set $commitment_ptr (i32.const 28672))
    (local.set $random_buf (i32.const 32768))

    (call $host_random (local.get $random_buf) (i32.const 16))
    drop

    (call $host_hash (local.get $age_ptr) (local.get $age_len) (local.get $commitment_ptr))
    drop

    (local.get $commitment_ptr))

  (start $init)
  (func $init
    (call $host_log (i32.const 0) (i32.const 12))))
