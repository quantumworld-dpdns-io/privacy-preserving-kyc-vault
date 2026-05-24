use rand::rngs::{OsRng, StdRng};
use rand::{RngCore, SeedableRng};
use sha2::{Digest, Sha256};
use std::sync::Mutex;

static ENTROPY_POOL: Mutex<Vec<u8>> = Mutex::new(Vec::new());
static MIX_COUNTER: Mutex<u64> = Mutex::new(0);

pub struct QuantumSafeRng {
    rng: StdRng,
    seed: [u8; 32],
}

impl QuantumSafeRng {
    pub fn new() -> Self {
        let mut seed = [0u8; 32];
        OsRng.fill_bytes(&mut seed);
        Self::from_seed(seed)
    }

    pub fn from_seed(seed: [u8; 32]) -> Self {
        QuantumSafeRng {
            rng: StdRng::from_seed(seed),
            seed,
        }
    }

    pub fn reseed(&mut self) {
        let mut new_seed = [0u8; 32];
        OsRng.fill_bytes(&mut new_seed);
        self.seed = new_seed;
        self.rng = StdRng::from_seed(self.seed);
    }

    pub fn fill_bytes(&mut self, dest: &mut [u8]) {
        self.rng.fill_bytes(dest);
    }

    pub fn next_u64(&mut self) -> u64 {
        self.rng.next_u64()
    }

    pub fn mix_entropy(&mut self, external_entropy: &[u8]) {
        let mut hasher = Sha256::new();
        hasher.update(&self.seed);
        hasher.update(external_entropy);
        {
            let mut counter = MIX_COUNTER.lock().unwrap();
            *counter += 1;
            hasher.update(&counter.to_le_bytes());
        }
        let mixed = hasher.finalize();
        self.seed.copy_from_slice(&mixed);
        self.rng = StdRng::from_seed(self.seed);
    }

    pub fn add_to_pool(entropy: &[u8]) {
        let mut pool = ENTROPY_POOL.lock().unwrap();
        pool.extend_from_slice(entropy);
        if pool.len() > 4096 {
            let mut hasher = Sha256::new();
            hasher.update(&pool[..]);
            let digest = hasher.finalize();
            pool.clear();
            pool.extend_from_slice(&digest);
        }
    }

    pub fn drain_pool() -> [u8; 32] {
        let mut pool = ENTROPY_POOL.lock().unwrap();
        let mut hasher = Sha256::new();
        hasher.update(&pool[..]);
        hasher.update(&OsRng.next_u64().to_le_bytes());
        let digest = hasher.finalize();
        pool.clear();
        let mut seed = [0u8; 32];
        seed.copy_from_slice(&digest);
        seed
    }
}

impl Default for QuantumSafeRng {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rng_generates_bytes() {
        let mut rng = QuantumSafeRng::new();
        let mut buf = [0u8; 64];
        rng.fill_bytes(&mut buf);
        assert!(!buf.iter().all(|&b| b == 0));
    }

    #[test]
    fn test_rng_reseed() {
        let mut rng = QuantumSafeRng::new();
        let v1 = rng.next_u64();
        rng.reseed();
        let v2 = rng.next_u64();
        assert_ne!(v1, v2);
    }

    #[test]
    fn test_entropy_mix() {
        let mut rng = QuantumSafeRng::new();
        let v1 = rng.next_u64();
        rng.mix_entropy(b"external entropy source data");
        let v2 = rng.next_u64();
        assert_ne!(v1, v2);
    }

    #[test]
    fn test_entropy_pool() {
        QuantumSafeRng::add_to_pool(b"some entropy data");
        QuantumSafeRng::add_to_pool(b"more entropy data");
        let seed = QuantumSafeRng::drain_pool();
        assert!(!seed.iter().all(|&b| b == 0));
    }

    #[test]
    fn test_from_seed_deterministic() {
        let seed = [42u8; 32];
        let mut rng1 = QuantumSafeRng::from_seed(seed.clone());
        let mut rng2 = QuantumSafeRng::from_seed(seed);
        let mut buf1 = [0u8; 16];
        let mut buf2 = [0u8; 16];
        rng1.fill_bytes(&mut buf1);
        rng2.fill_bytes(&mut buf2);
        assert_eq!(buf1, buf2);
    }
}
