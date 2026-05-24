pub struct SecureCompare;

impl SecureCompare {
    pub fn eq(a: &[u8], b: &[u8]) -> bool {
        if a.len() != b.len() {
            return false;
        }
        let mut result: u8 = 0;
        for (x, y) in a.iter().zip(b.iter()) {
            result |= x ^ y;
        }
        result == 0
    }

    pub fn eq_f64(a: f64, b: f64) -> bool {
        let a_bits = a.to_bits();
        let b_bits = b.to_bits();
        let mut result: u64 = 0;
        result |= a_bits ^ b_bits;
        result == 0
    }

    pub fn select(choice: bool, a: &[u8], b: &[u8]) -> Vec<u8> {
        let mask = if choice { 0x00u8 } else { 0xffu8 };
        let len = a.len().max(b.len());
        let mut result = Vec::with_capacity(len);
        for i in 0..len {
            let ai = a.get(i).copied().unwrap_or(0);
            let bi = b.get(i).copied().unwrap_or(0);
            result.push(ai ^ (mask & (ai ^ bi)));
        }
        result
    }

    pub fn cmp(a: &[u8], b: &[u8]) -> std::cmp::Ordering {
        let min_len = a.len().min(b.len());
        let mut result: i32 = 0;
        for i in 0..min_len {
            let diff = (a[i] as i32) - (b[i] as i32);
            result |= diff;
        }
        if result < 0 {
            return std::cmp::Ordering::Less;
        }
        if result > 0 {
            return std::cmp::Ordering::Greater;
        }
        a.len().cmp(&b.len())
    }
}

pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    SecureCompare::eq(a, b)
}

pub fn ct_select(choice: bool, a: &[u8], b: &[u8]) -> Vec<u8> {
    SecureCompare::select(choice, a, b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_eq_equal() {
        assert!(SecureCompare::eq(b"hello", b"hello"));
    }

    #[test]
    fn test_eq_not_equal() {
        assert!(!SecureCompare::eq(b"hello", b"world"));
    }

    #[test]
    fn test_eq_different_lengths() {
        assert!(!SecureCompare::eq(b"abc", b"abcd"));
    }

    #[test]
    fn test_eq_empty() {
        assert!(SecureCompare::eq(b"", b""));
    }

    #[test]
    fn test_select_true() {
        let result = SecureCompare::select(true, b"abc", b"xyz");
        assert_eq!(result, b"abc");
    }

    #[test]
    fn test_select_false() {
        let result = SecureCompare::select(false, b"abc", b"xyz");
        assert_eq!(result, b"xyz");
    }

    #[test]
    fn test_select_different_lengths() {
        let result = SecureCompare::select(true, b"abc", b"xy");
        assert_eq!(result, b"abc");
        let result = SecureCompare::select(false, b"ab", b"xyz");
        assert_eq!(result, b"xyz");
    }

    #[test]
    fn test_cmp_equal() {
        assert_eq!(SecureCompare::cmp(b"abc", b"abc"), std::cmp::Ordering::Equal);
    }

    #[test]
    fn test_ct_eq_fn() {
        assert!(ct_eq(b"test", b"test"));
        assert!(!ct_eq(b"test", b"other"));
    }

    #[test]
    fn test_ct_select_fn() {
        assert_eq!(ct_select(true, b"yes", b"no"), b"yes");
        assert_eq!(ct_select(false, b"yes", b"no"), b"no");
    }
}
