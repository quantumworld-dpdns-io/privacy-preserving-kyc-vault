// Arrow Flight SQL Server for high-speed credential queries
// Serves KYC verification data over gRPC using the Arrow Flight protocol.
// Clients can query credential data using Flight SQL or DoGet with IPC streams.

use arrow_flight::sql::server::FlightSqlService;
use arrow_flight::sql::{
    Any, CommandPreparedUpdate, CommandStatementIngest, CommandStatementQuery,
    DoPutUpdateResult, SqlInfo,
};
use arrow_flight::{
    Action, FlightData, FlightDescriptor, FlightEndpoint, FlightInfo,
    HandshakeRequest, HandshakeResponse, IpcMessage, PollInfo, PutResult,
    SchemaResult, Ticket,
};
use arrow_flight::{
    encode::FlightDataEncoderBuilder, sql::SqlInfoDataBuilder,
};
use datafusion::prelude::*;
use futures::StreamExt;
use prost::Message;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::RwLock;
use tonic::transport::Server;
use tonic::{Request, Response, Status, Streaming};

type FlightResult<T> = Result<T, Status>;

#[derive(Clone)]
struct FlightSqlServiceImpl {
    ctx: Arc<RwLock<SessionContext>>,
    // Track prepared statements for credential queries
    prepared: Arc<RwLock<HashMap<String, Arc<datafusion::logical_expr::LogicalPlan>>>>,
}

impl FlightSqlServiceImpl {
    async fn new() -> Self {
        let ctx = SessionContext::new();

        // Register Iceberg tables via REST catalog
        ctx.register_parquet(
            "verification_events",
            "s3://kyc-vault-data/iceberg/verification_events/*.parquet",
            ParquetReadOptions::default(),
        )
        .await
        .expect("Failed to register verification_events");

        ctx.register_parquet(
            "credential_audit",
            "s3://kyc-vault-data/iceberg/credential_audit/*.parquet",
            ParquetReadOptions::default(),
        )
        .await
        .expect("Failed to register credential_audit");

        Self {
            ctx: Arc::new(RwLock::new(ctx)),
            prepared: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn execute_query(
        &self,
        query: &str,
    ) -> FlightResult<Vec<FlightData>> {
        let ctx = self.ctx.read().await;
        let df = ctx
            .sql(query)
            .await
            .map_err(|e| Status::internal(format!("Query error: {e}")))?;

        let batches = df
            .collect()
            .await
            .map_err(|e| Status::internal(format!("Collect error: {e}")))?;

        let schema = df.schema();
        let mut encoder = FlightDataEncoderBuilder::new()
            .with_schema(schema)
            .build();

        let mut flight_data = Vec::new();
        let mut stream = futures::stream::iter(batches.into_iter().map(Ok));
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| {
                Status::internal(format!("Encoding error: {e}"))
            })?;
            let mut encoded = encoder
                .feed(chunk)
                .await
                .map_err(|e| Status::internal(format!("Feed error: {e}")))?;
            flight_data.append(&mut encoded);
        }
        let mut remaining = encoder
            .finish()
            .await
            .map_err(|e| Status::internal(format!("Finish error: {e}")))?;
        flight_data.append(&mut remaining);

        Ok(flight_data)
    }
}

// ── FlightSqlService trait implementation ──

#[tonic::async_trait]
impl FlightSqlService for FlightSqlServiceImpl {
    type FlightService = FlightSqlServiceImpl;

    async fn do_handshake(
        &self,
        _request: Request<Streaming<HandshakeRequest>>,
    ) -> FlightResult<Response<Streaming<HandshakeResponse>>> {
        let (tx, rx) = tokio::sync::mpsc::channel(1);
        let response = HandshakeResponse {
            payload: "auth-token-success".into(),
        };
        tx.send(Ok(response)).await.map_err(|e| Status::internal(e.to_string()))?;
        let output_stream = tokio_stream::wrappers::ReceiverStream::new(rx);
        Ok(Response::new(Box::pin(output_stream) as _))
    }

    async fn do_get_fallback(
        &self,
        _request: Request<Ticket>,
    ) -> FlightResult<Response<Pin<Box<dyn futures::Stream<Item = FlightResult<FlightData>> + Send>>>> {
        unimplemented!("do_get_fallback not implemented")
    }

    async fn get_flight_info_statement(
        &self,
        query: CommandStatementQuery,
        _request: Request<FlightDescriptor>,
    ) -> FlightResult<Response<FlightInfo>> {
        let ctx = self.ctx.read().await;
        let df = ctx
            .sql(&query.query)
            .await
            .map_err(|e| Status::internal(format!("Query planning error: {e}")))?;

        let schema = df.schema();
        letinfo = FlightInfo {
            schema: schema
                .try_into()
                .map_err(|e| Status::internal(format!("Schema error: {e}")))?,
            ..Default::default()
        };
        Ok(Response::new(info))
    }

    async fn get_schema_statement(
        &self,
        query: CommandStatementQuery,
        _request: Request<FlightDescriptor>,
    ) -> FlightResult<Response<SchemaResult>> {
        let ctx = self.ctx.read().await;
        let df = ctx
            .sql(&query.query)
            .await
            .map_err(|e| Status::internal(format!("Schema error: {e}")))?;

        let schema = df.schema().into();
        Ok(Response::new(schema))
    }

    async fn do_get_statement(
        &self,
        query: CommandStatementQuery,
        _request: Request<Ticket>,
    ) -> FlightResult<Response<Pin<Box<dyn futures::Stream<Item = FlightResult<FlightData>> + Send>>>> {
        let flight_data = self.execute_query(&query.query).await?;
        let stream = futures::stream::iter(flight_data.into_iter().map(Ok));
        Ok(Response::new(Box::pin(stream) as _))
    }

    async fn do_put_statement(
        &self,
        _query: CommandStatementIngest,
        _request: Request<Streaming<FlightData>>,
    ) -> FlightResult<Response<DoPutUpdateResult>> {
        unimplemented!("Write operations not supported")
    }

    async fn do_put_prepared_statement_update(
        &self,
        _query: CommandPreparedUpdate,
        _request: Request<Streaming<FlightData>>,
    ) -> FlightResult<Response<DoPutUpdateResult>> {
        unimplemented!("Prepared statement updates not supported")
    }

    async fn get_flight_info_prepared_statement(
        &self,
        _handle: arrow_flight::sql::CommandPreparedStatementQuery,
        _request: Request<FlightDescriptor>,
    ) -> FlightResult<Response<FlightInfo>> {
        unimplemented!("Prepared statements not yet supported")
    }

    async fn do_get_prepared_statement(
        &self,
        _handle: arrow_flight::sql::CommandPreparedStatementQuery,
        _request: Request<Ticket>,
    ) -> FlightResult<Response<Pin<Box<dyn futures::Stream<Item = FlightResult<FlightData>> + Send>>>> {
        unimplemented!("Prepared statements not yet supported")
    }

    async fn register_sql_info(
        &self,
        id: arrow_flight::sql::SqlInfo,
        _request: &Request<FlightDescriptor>,
    ) -> FlightResult {
        let mut info_data = SqlInfoDataBuilder::new();
        info_data.append(SqlInfo::FlightSqlServerName, "KYC Vault Flight SQL Server");
        Ok(())
    }

    async fn do_action(
        &self,
        _action: Action,
        _request: Request<Streaming<arrow_flight::Result>>,
    ) -> FlightResult<Response<Streaming<arrow_flight::Result>>> {
        unimplemented!("Actions not implemented")
    }

    async fn list_flights(
        &self,
        _request: Request<arrow_flight::Criteria>,
    ) -> FlightResult<Response<Pin<Box<dyn futures::Stream<Item = FlightResult<FlightInfo>> + Send>>>> {
        let (tx, rx) = tokio::sync::mpsc::channel(2);

        let tables = vec!["verification_events", "credential_audit"];
        for table in tables {
            let info = FlightInfo {
                flight_descriptor: Some(FlightDescriptor::new_path(vec![table.to_string()])),
                endpoint: vec![FlightEndpoint {
                    ticket: Some(Ticket::new(table)),
                    ..Default::default()
                }],
                ..Default::default()
            };
            tx.send(Ok(info)).await.map_err(|e| Status::internal(e.to_string()))?;
        }

        let output_stream = tokio_stream::wrappers::ReceiverStream::new(rx);
        Ok(Response::new(Box::pin(output_stream) as _))
    }

    async fn get_flight_info_for_command(
        &self,
        _command: Any,
        _request: Request<FlightDescriptor>,
    ) -> FlightResult<Response<FlightInfo>> {
        unimplemented!("Command flight info not implemented")
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr: SocketAddr = "0.0.0.0:50051".parse()?;
    let service = FlightSqlServiceImpl::new().await;

    let svc = arrow_flight::flight_service::FlightServiceServer::new(service);

    println!("Arrow Flight SQL Server listening on {addr}");
    Server::builder()
        .add_service(svc)
        .serve(addr)
        .await?;

    Ok(())
}
