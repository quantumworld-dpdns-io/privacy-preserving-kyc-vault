use rand::Rng;

pub struct ShamirSecretSharing;

impl ShamirSecretSharing {
    pub fn split(secret: &[u8; 32], total: u8, threshold: u8) -> Result<Vec<Vec<u8>>, String> {
        if threshold > total {
            return Err("Threshold must be <= total shares".into());
        }
        if threshold < 2 {
            return Err("Threshold must be >= 2".into());
        }

        let mut rng = rand::thread_rng();
        let coefficients: Vec<[u8; 32]> = (0..(threshold as usize - 1))
            .map(|_| rng.r#gen())
            .collect();

        let mut shares = Vec::new();

        for i in 1..=total {
            let x = i;
            let mut value = [0u8; 32];

            for j in 0..32 {
                let mut y = secret[j] as i64;
                let mut x_pow = 1i64;

                for coeff in &coefficients {
                    x_pow = (x_pow * x as i64) % 251;
                    y = (y + (coeff[j] as i64) * x_pow) % 251;
                }

                value[j] = if y < 0 { (y + 251) as u8 } else { y as u8 };
            }

            let mut share = vec![x];
            share.extend_from_slice(&value);
            shares.push(share);
        }

        Ok(shares)
    }

    pub fn combine(shares: &[Vec<u8>], threshold: u8) -> Result<[u8; 32], String> {
        if shares.len() < threshold as usize {
            return Err("Not enough shares".into());
        }

        let mut secret = [0u8; 32];

        for j in 0..32 {
            let mut result = 0i64;

            for i in 0..threshold as usize {
                let xi = shares[i][0] as i64;
                let yi = shares[i][1 + j] as i64;

                let mut num = 1i64;
                let mut den = 1i64;

                for k in 0..threshold as usize {
                    if i != k {
                        let xk = shares[k][0] as i64;
                        num = (num * (-xk)) % 251;
                        den = (den * (xi - xk)) % 251;
                    }
                }

                let mut den_inv = 1i64;
                for d in 1..251 {
                    if (den * d) % 251 == 1 {
                        den_inv = d;
                        break;
                    }
                }

                result = (result + yi * num * den_inv) % 251;
            }

            secret[j] = if result < 0 { (result + 251) as u8 } else { result as u8 };
        }

        Ok(secret)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shamir_split_and_combine() {
        let secret = [42u8; 32];
        let shares = ShamirSecretSharing::split(&secret, 5, 3).unwrap();
        assert_eq!(shares.len(), 5);

        let recovered = ShamirSecretSharing::combine(&shares[0..3], 3).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn test_not_enough_shares() {
        let secret = [1u8; 32];
        let shares = ShamirSecretSharing::split(&secret, 5, 3).unwrap();
        assert!(ShamirSecretSharing::combine(&shares[0..2], 3).is_err());
    }
}
