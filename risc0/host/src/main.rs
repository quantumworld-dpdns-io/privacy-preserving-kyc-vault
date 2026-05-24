use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct KYCInput {
    age: u64,
    min_age: u64,
    nationality: String,
    allowed_nationalities: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct KYCOutput {
    age_verified: bool,
    nationality_verified: bool,
    timestamp: u64,
}

fn main() {
    println!("RISC Zero zkVM host for KYC verification");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kyc_input_serialization() {
        let input = KYCInput {
            age: 25,
            min_age: 21,
            nationality: "US".into(),
            allowed_nationalities: vec!["US".into(), "CA".into(), "UK".into()],
        };
        let json = serde_json::to_string(&input).unwrap();
        assert!(json.contains("age"));
    }
}
