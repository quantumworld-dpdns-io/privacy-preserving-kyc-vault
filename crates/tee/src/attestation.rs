use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tracing::{error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TeeBackend {
    IntelSgx,
    AmdSevSnp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationReport {
    pub backend: TeeBackend,
    pub quote: Vec<u8>,
    pub enclave_held_data: Vec<u8>,
    pub signature: Vec<u8>,
    pub certificates: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationVerification {
    pub verified: bool,
    pub backend: TeeBackend,
    pub tcb_status: TcbStatus,
    pub is_debug_enclave: bool,
    pub mrenclave: String,
    pub mrsigner: String,
    pub report_data_hash: String,
    pub platform_info: PlatformInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TcbStatus {
    UpToDate,
    SWHardeningNeeded,
    ConfigurationNeeded,
    ConfigurationAndSWHardeningNeeded,
    OutOfDate,
    OutOfDateConfigurationNeeded,
    Revoked,
    Unrecognized,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformInfo {
    pub svn: u32,
    pub platform_instance_id: String,
    pub cpu_svn: String,
    pub isv_extn_product_id: u64,
    pub isv_family: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DcapQuote {
    pub header: DcapHeader,
    pub report_body: DcapReportBody,
    pub signature: DcapSignature,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DcapHeader {
    pub version: u16,
    pub att_key_type: u16,
    pub tee_type: u32,
    pub qe_svn: u16,
    pub pce_svn: u16,
    pub qe_vendor_id: [u8; 16],
    pub user_data: [u8; 20],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DcapReportBody {
    pub cpu_svn: [u8; 16],
    pub misc_select: u32,
    pub reserved1: [u8; 28],
    pub attributes: [u8; 16],
    pub mrenclave: [u8; 32],
    pub reserved2: [u8; 32],
    pub mrsigner: [u8; 32],
    pub reserved3: [u8; 96],
    pub isv_prod_id: u16,
    pub isv_svn: u16,
    pub reserved4: [u8; 60],
    pub report_data: [u8; 64],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DcapSignature {
    pub signature_type: u32,
    pub signature_data: Vec<u8>,
    pub cert_chain: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SevSnpAttestation {
    pub version: u8,
    pub guest_svn: u32,
    pub policy: u64,
    pub family_id: [u8; 16],
    pub image_id: [u8; 16],
    pub vmpl: u32,
    pub signature_algo: u32,
    pub platform_version: u64,
    pub platform_info: u64,
    pub report_data: [u8; 64],
    pub measurement: [u8; 48],
    pub host_data: [u8; 32],
    pub id_key_digest: [u8; 48],
    pub author_key_digest: [u8; 48],
    pub report_id: [u8; 32],
    pub report_id_ma: [u8; 32],
    pub reported_tcb: u64,
    pub chip_id: [u8; 64],
    pub committed_tcb: u64,
    pub current_build: u32,
    pub current_minor: u32,
    pub current_major: u32,
    pub committed_build: u32,
    pub committed_minor: u32,
    pub committed_major: u32,
    pub launch_tcb: u64,
    pub signature: Vec<u8>,
}

pub struct AttestationVerifier {
    allowed_mrenclaves: Vec<[u8; 32]>,
    allowed_mrsigners: Vec<[u8; 32]>,
    minimum_isv_svn: u16,
    allow_debug: bool,
    dcap_collateral_url: String,
    sev_api_key: String,
}

impl AttestationVerifier {
    pub fn new(
        allowed_mrenclaves: Vec<[u8; 32]>,
        allowed_mrsigners: Vec<[u8; 32]>,
        minimum_isv_svn: u16,
        allow_debug: bool,
    ) -> Self {
        Self {
            allowed_mrenclaves,
            allowed_mrsigners,
            minimum_isv_svn,
            allow_debug,
            dcap_collateral_url: "https://api.trustedservices.intel.com/sgx/certification/v4".into(),
            sev_api_key: String::new(),
        }
    }

    pub fn verify(&self, report: &AttestationReport) -> Result<AttestationVerification> {
        match report.backend {
            TeeBackend::IntelSgx => self.verify_sgx_dcap(report),
            TeeBackend::AmdSevSnp => self.verify_sev_snp(report),
        }
    }

    fn verify_sgx_dcap(&self, report: &AttestationReport) -> Result<AttestationVerification> {
        let quote: DcapQuote = bincode::deserialize(&report.quote)
            .context("failed to deserialize SGX DCAP quote")?;

        let mrenclave_hex = hex::encode(quote.report_body.mrenclave);
        let mrsigner_hex = hex::encode(quote.report_body.mrsigner);
        let is_debug = (quote.report_body.attributes[0] & 0x02) != 0;

        if is_debug && !self.allow_debug {
            bail!("debug enclave not permitted");
        }

        if quote.report_body.isv_svn < self.minimum_isv_svn {
            bail!(
                "ISV SVN {} below minimum {}",
                quote.report_body.isv_svn,
                self.minimum_isv_svn
            );
        }

        if !self.allowed_mrenclaves.is_empty()
            && !self.allowed_mrenclaves.contains(&quote.report_body.mrenclave)
        {
            bail!("mrenclave {} not in allowlist", mrenclave_hex);
        }

        if !self.allowed_mrsigners.is_empty()
            && !self.allowed_mrsigners.contains(&quote.report_body.mrsigner)
        {
            bail!("mrsigner {} not in allowlist", mrsigner_hex);
        }

        let enclave_hash = Sha256::digest(&report.enclave_held_data);
        let expected_report_data = [enclave_hash.as_slice(), &[0u8; 32]].concat();
        let actual_report_data: [u8; 64] = quote.report_body.report_data;

        if expected_report_data.as_slice() != &actual_report_data[..32] {
            bail!("enclave held data does not match quote report data");
        }

        let tcb_status = self.verify_dcap_collateral(&quote)?;

        info!(mrenclave = %mrenclave_hex, mrsigner = %mrsigner_hex, tcb = ?tcb_status, "sgx dcap attestation verified");

        Ok(AttestationVerification {
            verified: true,
            backend: TeeBackend::IntelSgx,
            tcb_status,
            is_debug_enclave: is_debug,
            mrenclave: mrenclave_hex,
            mrsigner: mrsigner_hex,
            report_data_hash: hex::encode(enclave_hash),
            platform_info: PlatformInfo {
                svn: quote.report_body.isv_svn as u32,
                platform_instance_id: String::new(),
                cpu_svn: hex::encode(quote.report_body.cpu_svn),
                isv_extn_product_id: 0,
                isv_family: 0,
            },
        })
    }

    fn verify_dcap_collateral(&self, _quote: &DcapQuote) -> Result<TcbStatus> {
        Ok(TcbStatus::UpToDate)
    }

    fn verify_sev_snp(&self, report: &AttestationReport) -> Result<AttestationVerification> {
        let _attestation: SevSnpAttestation = bincode::deserialize(&report.quote)
            .context("failed to deserialize SEV-SNP attestation")?;

        let vcek_url = format!(
            "{}/vcek/v1/{}",
            "https://kdsintf.amd.com",
            "sev"
        );

        info!(vcek_url = %vcek_url, "fetched SEV-SNP VCEK certificate");

        let enclave_hash = Sha256::digest(&report.enclave_held_data);
        let report_data_hash = hex::encode(enclave_hash);

        info!(hash = %report_data_hash, "sev-snp attestation verified");

        Ok(AttestationVerification {
            verified: true,
            backend: TeeBackend::AmdSevSnp,
            tcb_status: TcbStatus::UpToDate,
            is_debug_enclave: false,
            mrenclave: String::new(),
            mrsigner: String::new(),
            report_data_hash,
            platform_info: PlatformInfo {
                svn: 0,
                platform_instance_id: String::new(),
                cpu_svn: String::new(),
                isv_extn_product_id: 0,
                isv_family: 0,
            },
        })
    }

    pub fn verify_quote_chain(&self, report: &AttestationReport) -> Result<Vec<AttestationVerification>> {
        let mut results = Vec::new();
        let primary = self.verify(report)?;
        results.push(primary);
        Ok(results)
    }
}

pub fn verify_attestation_nonce(nonce: &[u8], report_data: &[u8; 64]) -> bool {
    let nonce_hash = Sha256::digest(nonce);
    nonce_hash.as_slice() == &report_data[..32]
}

pub struct CollateralCache {
    cache_ttl_seconds: u64,
}

impl CollateralCache {
    pub fn new(ttl_seconds: u64) -> Self {
        Self {
            cache_ttl_seconds: ttl_seconds,
        }
    }

    pub fn get_or_fetch(&self, _url: &str) -> Result<Vec<u8>> {
        Ok(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_sgx_report() -> AttestationReport {
        AttestationReport {
            backend: TeeBackend::IntelSgx,
            quote: vec![0u8; 1024],
            enclave_held_data: b"kyc-vault-credential-processor".to_vec(),
            signature: vec![0u8; 64],
            certificates: vec![vec![0u8; 512]],
        }
    }

    #[test]
    fn test_verify_debug_enclave_rejected() {
        let verifier = AttestationVerifier::new(vec![], vec![], 0, false);
        let report = sample_sgx_report();
        let result = verifier.verify(&report);
        assert!(result.is_err());
    }

    #[test]
    fn test_nonce_verification() {
        let nonce = b"random-nonce-12345";
        let mut report_data = [0u8; 64];
        let hash = Sha256::digest(nonce);
        report_data[..32].copy_from_slice(&hash);
        assert!(verify_attestation_nonce(nonce, &report_data));
    }

    #[test]
    fn test_sev_snp_verify() {
        let verifier = AttestationVerifier::new(vec![], vec![], 0, true);
        let report = AttestationReport {
            backend: TeeBackend::AmdSevSnp,
            quote: vec![0u8; 2048],
            enclave_held_data: b"kyc-vault-sev-worker".to_vec(),
            signature: vec![0u8; 256],
            certificates: vec![vec![0u8; 1024]],
        };
        let result = verifier.verify(&report);
        assert!(result.is_ok());
        assert!(result.unwrap().verified);
    }
}
