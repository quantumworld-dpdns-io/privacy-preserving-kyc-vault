(module
  (import "kyc" "hash" (func $host_hash (param i32 i32 i32) (result i32)))
  (import "kyc" "emit_event" (func $host_emit_event (param i32 i32 i32 i32) (result i32)))
  (import "kyc" "log_message" (func $host_log (param i32 i32) (result i32)))
  (import "kyc" "store_blob" (func $host_store (param i32 i32 i32 i32) (result i32)))
  (import "kyc" "get_blob" (func $host_get (param i32 i32 i32 i32) (result i32)))

  (memory (export "memory") 2)
  (data (i32.const 0) "did-resolve-v1")

  (data (i32.const 64) "did:")
  (data (i32.const 68) "key")
  (data (i32.const 72) "web")
  (data (i32.const 76) "ethr")
  (data (i32.const 81) "unsupported did method: ")

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

  (func $memcmp (param $a i32) (param $b i32) (param $len i32) (result i32)
    (local $i i32)
    (local $diff i32)
    (local.set $i (i32.const 0))
    (local.set $diff (i32.const 0))
    (block $done
      (loop $loop
        (br_if $done (i32.eq (local.get $i) (local.get $len)))
        (local.set $diff
          (i32.sub
            (i32.load8_u (i32.add (local.get $a) (local.get $i)))
            (i32.load8_u (i32.add (local.get $b) (local.get $i)))))
        (if (i32.ne (local.get $diff) (i32.const 0))
          (br $done))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)))
    (local.get $diff))

  (func $streq (param $a i32) (param $b i32) (param $len i32) (result i32)
    (i32.eqz (call $memcmp (local.get $a) (local.get $b) (local.get $len))))

  (func (export "get_module_info") (result i32) (i32.const 0))

  (func (export "resolve_did") (param $did_ptr i32) (param $did_len i32) (result i32)
    (local $i i32)
    (local $colon_count i32)
    (local $method_start i32)
    (local $method_len i32)
    (local $result i32)

    (local.set $result (i32.const 0))

    (if (i32.lt_u (local.get $did_len) (i32.const 5))
      (then
        (call $host_log (i32.const 81) (i32.const 24))
        (return (i32.const -1))))

    (local.set $i (i32.const 4))
    (local.set $colon_count (i32.const 0))
    (local.set $method_start (i32.const 0))
    (local.set $method_len (i32.const 0))

    (block $done
      (loop $loop
        (br_if $done (i32.eq (local.get $i) (local.get $did_len)))
        (if (i32.eq (i32.load8_u (i32.add (local.get $did_ptr) (local.get $i))) (i32.const 58))
          (then
            (local.set $colon_count (i32.add (local.get $colon_count) (i32.const 1)))
            (if (i32.eq (local.get $colon_count) (i32.const 1))
              (then
                (local.set $method_start (i32.add (local.get $did_ptr) (i32.const 4)))
                (local.set $method_len (i32.sub (local.get $i) (i32.const 4)))))
            (if (i32.eq (local.get $colon_count) (i32.const 2))
              (then
                (local.set $method_start (i32.add (local.get $did_ptr) (i32.const 4)))
                (local.set $method_len (i32.sub (local.get $i) (i32.const 4)))
                (br $done))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)))

    (local.set $result
      (if (result i32)
        (call $streq (local.get $method_start) (i32.const 68) (i32.const 3))
        (then (i32.const 1))
        (else
          (if (result i32)
            (call $streq (local.get $method_start) (i32.const 72) (i32.const 3))
            (then (i32.const 2))
            (else
              (if (result i32)
                (call $streq (local.get $method_start) (i32.const 76) (i32.const 4))
                (then (i32.const 3))
                (else (i32.const 0))))))))

    (if (i32.eqz (local.get $result))
      (then
        (call $host_log (i32.const 81) (i32.const 24))))

    (local.get $result))

  (func (export "get_method_name") (param $method_id i32) (result i32)
    (if (result i32)
      (i32.eq (local.get $method_id) (i32.const 1))
      (then (i32.const 68))
      (else
        (if (result i32)
          (i32.eq (local.get $method_id) (i32.const 2))
          (then (i32.const 72))
          (else
            (if (result i32)
              (i32.eq (local.get $method_id) (i32.const 3))
              (then (i32.const 76))
              (else (i32.const 0))))))))

  (func (export "extract_method_specific_id") (param $did_ptr i32) (param $did_len i32) (result i32)
    (local $i i32)
    (local $colons i32)
    (local $msi_start i32)
    (local.set $colons (i32.const 0))
    (local.set $i (i32.const 0))
    (block $done
      (loop $loop
        (br_if $done (i32.eq (local.get $i) (local.get $did_len)))
        (if (i32.eq (i32.load8_u (i32.add (local.get $did_ptr) (local.get $i))) (i32.const 58))
          (then
            (local.set $colons (i32.add (local.get $colons) (i32.const 1)))
            (if (i32.eq (local.get $colons) (i32.const 2))
              (then
                (local.set $msi_start (i32.add (local.get $did_ptr) (local.get $i) (i32.const 1)))
                (br $done)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)))
    (local.get $msi_start))

  (start $init)
  (func $init
    (call $host_log (i32.const 0) (i32.const 14))))
