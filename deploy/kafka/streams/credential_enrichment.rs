// Kafka Streams: Enrich credential events with platform metadata.
// Reads raw credential events from `credential.events`, joins with
// platform metadata from a compacted topic, and writes enriched
// events to `credential.enriched` for downstream consumers.

use rdkafka::config::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::message::Message;
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::util::get_rdkafka_version;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CredentialEvent {
    event_id: String,
    credential_id: String,
    credential_type: String,
    issuer_did: String,
    applicant_did: String,
    jurisdiction: String,
    event_type: String,
    risk_score: Option<f64>,
    metadata: Option<HashMap<String, String>>,
    tenant_id: Option<String>,
    timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PlatformMetadata {
    platform_name: String,
    tier: String,
    region: String,
    compliance_level: String,
    supported_credential_types: Vec<String>,
    risk_threshold: f64,
    active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EnrichedCredentialEvent {
    event_id: String,
    credential_id: String,
    credential_type: String,
    issuer_did: String,
    applicant_did: String,
    jurisdiction: String,
    event_type: String,
    risk_score: Option<f64>,
    platform_name: String,
    platform_tier: String,
    platform_region: String,
    compliance_level: String,
    risk_threshold: f64,
    above_risk_threshold: bool,
    tenant_id: Option<String>,
    timestamp: String,
    enrichment_version: String,
}

const BOOTSTRAP_SERVERS: &str = "localhost:9092";
const SOURCE_TOPIC: &str = "credential.events";
const PLATFORM_META_TOPIC: &str = "platform.metadata";
const SINK_TOPIC: &str = "credential.enriched";
const CONSUMER_GROUP: &str = "credential-enrichment-group";

struct EnrichmentProcessor {
    producer: FutureProducer,
    platform_cache: Arc<RwLock<HashMap<String, PlatformMetadata>>>,
}

impl EnrichmentProcessor {
    fn new(producer: FutureProducer) -> Self {
        Self {
            producer,
            platform_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Rebuild the in-memory platform metadata cache from the compacted topic.
    async fn load_platform_metadata(
        &self,
        consumer: &StreamConsumer,
    ) {
        consumer
            .subscribe(&[PLATFORM_META_TOPIC])
            .expect("Failed to subscribe to platform metadata topic");

        info!("Loading platform metadata from compacted topic...");

        // Seek to beginning to consume the full compacted log once
        consumer
            .seek_to_beginning(PLATFORM_META_TOPIC, 0)
            .expect("Failed to seek to beginning");

        while let Ok(msg) = consumer.recv().await {
            if let Some(payload) = msg.payload() {
                if let Ok(metadata) =
                    serde_json::from_slice::<PlatformMetadata>(payload)
                {
                    let key = msg
                        .key()
                        .map(|k| String::from_utf8_lossy(k).to_string())
                        .unwrap_or_default();
                    self.platform_cache
                        .write()
                        .await
                        .insert(key, metadata);
                }
            }
        }
    }

    /// Enrich a single credential event with platform metadata.
    async fn enrich_event(
        &self,
        raw: CredentialEvent,
    ) -> Option<EnrichedCredentialEvent> {
        let tenant_id = raw.tenant_id.as_deref().unwrap_or("default");
        let cache = self.platform_cache.read().await;
        let platform = cache.get(tenant_id)?;

        let risk_score = raw.risk_score.unwrap_or(0.0);
        let above_threshold = risk_score > platform.risk_threshold;

        Some(EnrichedCredentialEvent {
            event_id: raw.event_id,
            credential_id: raw.credential_id,
            credential_type: raw.credential_type,
            issuer_did: raw.issuer_did,
            applicant_did: raw.applicant_did,
            jurisdiction: raw.jurisdiction,
            event_type: raw.event_type,
            risk_score: raw.risk_score,
            platform_name: platform.platform_name.clone(),
            platform_tier: platform.tier.clone(),
            platform_region: platform.region.clone(),
            compliance_level: platform.compliance_level.clone(),
            risk_threshold: platform.risk_threshold,
            above_risk_threshold: above_threshold,
            tenant_id: raw.tenant_id,
            timestamp: raw.timestamp,
            enrichment_version: "1.0.0".to_string(),
        })
    }

    /// Process a credential event: enrich and produce to sink topic.
    async fn process_event(
        &self,
        raw: CredentialEvent,
    ) {
        match self.enrich_event(raw).await {
            Some(enriched) => {
                let payload =
                    serde_json::to_vec(&enriched).expect("Serialization failed");
                let record = FutureRecord::to(SINK_TOPIC)
                    .key(&enriched.event_id)
                    .payload(&payload)
                    .timestamp(chrono::Utc::now().timestamp_millis());

                match self.producer.send(record, Duration::from_secs(5)).await {
                    Ok(_) => {
                        info!(
                            "Enriched event {} -> {}",
                            enriched.event_id, SINK_TOPIC
                        );
                    }
                    Err((e, _)) => {
                        error!("Failed to produce enriched event: {e}");
                    }
                }
            }
            None => {
                warn!(
                    "Skipping event {} (no platform metadata for tenant {:?})",
                    raw.event_id, raw.tenant_id
                );
            }
        }
    }

    /// Main processing loop: consume-source → enrich → produce.
    async fn run(
        self,
        consumer: StreamConsumer,
    ) {
        // Initial metadata load
        self.load_platform_metadata(&consumer).await;

        // Resubscribe to the source topic for continuous processing
        consumer
            .subscribe(&[SOURCE_TOPIC])
            .expect("Failed to subscribe to source topic");

        info!("Starting continuous enrichment of credential events...");

        // Refresh platform metadata every 5 minutes
        let cache = self.platform_cache.clone();
        let refresh_consumer = consumer.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(300)).await;
                info!("Refreshing platform metadata cache...");
                cache.write().await.clear();
                refresh_consumer
                    .subscribe(&[PLATFORM_META_TOPIC])
                    .expect("Failed to resubscribe");
                refresh_consumer
                    .seek_to_beginning(PLATFORM_META_TOPIC, 0)
                    .expect("Failed to seek");
            }
        });

        // Main consume-enrich loop
        while let Ok(msg) = consumer.recv().await {
            match msg.payload() {
                Some(payload) => {
                    match serde_json::from_slice::<CredentialEvent>(payload) {
                        Ok(event) => {
                            self.process_event(event).await;
                        }
                        Err(e) => {
                            error!("Failed to deserialize credential event: {e}");
                        }
                    }
                }
                None => {
                    warn!("Received message with null payload");
                }
            }
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let (version_n, version_s) = get_rdkafka_version();
    info!("rd_kafka version: 0x{version_n:x} ({version_s})");

    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", BOOTSTRAP_SERVERS)
        .set("message.timeout.ms", "5000")
        .set("compression.type", "zstd")
        .set("acks", "all")
        .create()
        .expect("Failed to create producer");

    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", BOOTSTRAP_SERVERS)
        .set("group.id", CONSUMER_GROUP)
        .set("enable.auto.commit", "true")
        .set("auto.commit.interval.ms", "5000")
        .set("auto.offset.reset", "earliest")
        .set("isolation.level", "read_committed")
        .create()
        .expect("Failed to create consumer");

    let processor = EnrichmentProcessor::new(producer);
    processor.run(consumer).await;
}
