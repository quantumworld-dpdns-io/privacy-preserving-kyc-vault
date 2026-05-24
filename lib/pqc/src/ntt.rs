use std::ops::{Add, Mul, Sub};

const NTT_N: usize = 256;
const Q: i32 = 8380417;
const ROOT: i32 = 1753;

fn mod_add(a: i32, b: i32) -> i32 {
    let r = a + b;
    if r >= Q { r - Q } else { r }
}

fn mod_sub(a: i32, b: i32) -> i32 {
    let r = a - b;
    if r < 0 { r + Q } else { r }
}

fn mod_mul(a: i32, b: i32) -> i32 {
    ((a as i64 * b as i64) % Q as i64) as i32
}

fn mod_pow2k(a: i32, k: u32) -> i32 {
    let mut r = 1;
    for _ in 0..k {
        r = mod_mul(r, a);
    }
    r
}

#[derive(Debug, Clone)]
pub struct Polynomial {
    pub coeffs: [i32; NTT_N],
}

impl Polynomial {
    pub fn new() -> Self {
        Polynomial { coeffs: [0i32; NTT_N] }
    }

    pub fn from_coeffs(coeffs: [i32; NTT_N]) -> Self {
        Polynomial { coeffs }
    }

    pub fn ntt(&self) -> Self {
        let mut r = self.coeffs;
        let mut len = NTT_N;
        let mut k = 0;
        while len > 1 {
            len >>= 1;
            k += 1;
            let step = 1 << k;
            let wlen = mod_pow2k(ROOT, (NTT_N as u32) / (step as u32));
            for i in (0..NTT_N).step_by(step) {
                let mut w = 1;
                for j in 0..len {
                    let u = r[i + j];
                    let v = mod_mul(r[i + j + len], w);
                    r[i + j] = mod_add(u, v);
                    r[i + j + len] = mod_sub(u, v);
                    w = mod_mul(w, wlen);
                }
            }
        }
        Polynomial { coeffs: r }
    }

    pub fn inverse_ntt(&self) -> Self {
        let mut r = self.coeffs;
        let n_inv = mod_pow2k(NTT_N as i32, Q as u32 - 2);
        let mut k = 0;
        let mut len = 1;
        while len < NTT_N {
            let step = 1 << (k + 1);
            let wlen = mod_pow2k(ROOT, (NTT_N as u32) / (step as u32));
            let wlen_inv = mod_pow2k(wlen, Q as u32 - 2);
            for i in (0..NTT_N).step_by(step) {
                let mut w = 1;
                for j in 0..len {
                    let u = r[i + j];
                    let v = r[i + j + len];
                    r[i + j] = mod_add(u, v);
                    r[i + j + len] = mod_sub(u, v);
                    r[i + j + len] = mod_mul(r[i + j + len], w);
                    w = mod_mul(w, wlen_inv);
                }
            }
            len <<= 1;
            k += 1;
        }
        PolyRef::from_coeffs(r).pointwise_mul(&PolyRef::from_coeffs([n_inv; NTT_N]));
        for c in r.iter_mut() {
            *c = mod_mul(*c, n_inv);
        }
        Polynomial { coeffs: r }
    }

    pub fn pointwise_mul(&self, other: &Polynomial) -> Self {
        let mut r = [0i32; NTT_N];
        for i in 0..NTT_N {
            r[i] = mod_mul(self.coeffs[i], other.coeffs[i]);
        }
        Polynomial { coeffs: r }
    }
}

impl Add for &Polynomial {
    type Output = Polynomial;
    fn add(self, other: &Polynomial) -> Polynomial {
        let mut r = [0i32; NTT_N];
        for i in 0..NTT_N {
            r[i] = mod_add(self.coeffs[i], other.coeffs[i]);
        }
        Polynomial { coeffs: r }
    }
}

impl Sub for &Polynomial {
    type Output = Polynomial;
    fn sub(self, other: &Polynomial) -> Polynomial {
        let mut r = [0i32; NTT_N];
        for i in 0..NTT_N {
            r[i] = mod_sub(self.coeffs[i], other.coeffs[i]);
        }
        Polynomial { coeffs: r }
    }
}

impl Mul for &Polynomial {
    type Output = Polynomial;
    fn mul(self, other: &Polynomial) -> Polynomial {
        self.ntt().pointwise_mul(&other.ntt()).inverse_ntt()
    }
}

struct PolyRef;

impl PolyRef {
    fn from_coeffs(_coeffs: &[i32; NTT_N]) -> Self {
        PolyRef
    }
    fn pointwise_mul(&self, _other: &Self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_polynomial_new() {
        let p = Polynomial::new();
        assert_eq!(p.coeffs.iter().sum::<i32>(), 0);
    }

    #[test]
    fn test_ntt_roundtrip() {
        let mut coeffs = [0i32; NTT_N];
        coeffs[0] = 1;
        coeffs[1] = 2;
        coeffs[2] = 3;
        let p = Polynomial::from_coeffs(coeffs);
        let ntt = p.ntt();
        let back = ntt.inverse_ntt();
        for i in 0..NTT_N {
            assert_eq!(back.coeffs[i], p.coeffs[i], "mismatch at index {}", i);
        }
    }

    #[test]
    fn test_pointwise_mul() {
        let mut a = [0i32; NTT_N];
        let mut b = [0i32; NTT_N];
        a[0] = 5;
        b[0] = 3;
        let pa = Polynomial::from_coeffs(a);
        let pb = Polynomial::from_coeffs(b);
        let ntt_a = pa.ntt();
        let ntt_b = pb.ntt();
        let product = ntt_a.pointwise_mul(&ntt_b);
        let _back = product.inverse_ntt();
    }

    #[test]
    fn test_polynomial_add() {
        let mut a = [0i32; NTT_N];
        let mut b = [0i32; NTT_N];
        a[0] = 7;
        b[0] = 3;
        let pa = Polynomial::from_coeffs(a);
        let pb = Polynomial::from_coeffs(b);
        let sum = &pa + &pb;
        assert_eq!(sum.coeffs[0], 10);
    }
}
