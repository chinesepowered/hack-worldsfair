//! `serve`: a small local HTTP API over the wallet, used by sotto's TypeScript SDK.
//!
//! A payee runs this with a viewing-key-only wallet and polls `/received?memo=<payment id>`; a payer
//! runs it with a spending wallet and calls `/send`. Every handler serialises on one lock because the
//! SQLite wallet is single-writer.

use std::sync::Arc;

use anyhow::anyhow;
use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
};
use clap::Args;
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;
use zcash_address::ZcashAddress;
use zcash_client_backend::data_api::{Account as _, WalletRead, wallet::ConfirmationsPolicy};
use zcash_client_sqlite::WalletDb;
use zcash_keys::keys::UnifiedAddressRequest;
use zcash_primitives::transaction::TxVersion;
use zcash_protocol::{
    TxId,
    memo::{Memo, MemoBytes},
    value::Zatoshis,
};
use zip321::{Payment, TransactionRequest};

use super::{
    send::{self, PaymentContext},
    sync,
};
use crate::{ShutdownListener, commands::select_account, config::get_wallet_network, data::get_db_paths, remote::ConnectionArgs};

#[derive(Debug, Args)]
pub(crate) struct Command {
    /// Address to listen on.
    #[arg(long, default_value = "127.0.0.1:8777")]
    listen: String,

    /// age identity file to decrypt the mnemonic phrase with. Only needed for `/send`.
    #[arg(short, long)]
    identity: Option<String>,

    #[command(flatten)]
    connection: ConnectionArgs,

    #[arg(long, default_value_t = 4)]
    target_note_count: usize,

    #[arg(long, default_value_t = 10000000)]
    min_split_output_value: u64,
}

struct AppState {
    wallet_dir: Option<String>,
    identity: Option<String>,
    connection: ConnectionArgs,
    target_note_count: usize,
    min_split_output_value: u64,
}

/// Requests the HTTP layer hands to the wallet worker thread.
enum Req {
    Health(oneshot::Sender<anyhow::Result<Value>>),
    Address(oneshot::Sender<anyhow::Result<Value>>),
    Balance(oneshot::Sender<anyhow::Result<Value>>),
    Sync(oneshot::Sender<anyhow::Result<Value>>),
    Send(SendBody, oneshot::Sender<anyhow::Result<Value>>),
    Received(ReceivedQuery, oneshot::Sender<anyhow::Result<Value>>),
}

struct Shared {
    tx: mpsc::Sender<Req>,
}
type SharedState = Arc<Shared>;

async fn ask(s: &SharedState, make: impl FnOnce(oneshot::Sender<anyhow::Result<Value>>) -> Req) -> ApiResult {
    let (tx, rx) = oneshot::channel();
    s.tx.send(make(tx)).await.map_err(|_| internal("wallet worker is gone"))?;
    let v = rx.await.map_err(|_| internal("wallet worker dropped the request"))?;
    v.map(Json).map_err(|e| {
        let msg = e.to_string();
        if msg.starts_with("bad request:") || msg.starts_with("forbidden:") {
            let code = if msg.starts_with("forbidden:") { StatusCode::FORBIDDEN } else { StatusCode::BAD_REQUEST };
            (code, Json(json!({ "error": msg })))
        } else {
            internal(msg)
        }
    })
}
type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

fn internal(e: impl std::fmt::Display) -> (StatusCode, Json<Value>) {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
}

impl Command {
    pub(crate) async fn run(self, wallet_dir: Option<String>) -> anyhow::Result<()> {
        let app_state = AppState {
            wallet_dir,
            identity: self.identity,
            connection: self.connection,
            target_note_count: self.target_note_count,
            min_split_output_value: self.min_split_output_value,
        };
        let (tx, rx) = mpsc::channel::<Req>(64);
        std::thread::Builder::new().name("wallet-worker".into()).spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("worker runtime");
            rt.block_on(worker(app_state, rx));
        })?;
        let state: SharedState = Arc::new(Shared { tx });
        let app = Router::new()
            .route("/health", get(health))
            .route("/address", get(address))
            .route("/balance", get(balance))
            .route("/sync", post(sync_now))
            .route("/send", post(send_payment))
            .route("/received", get(received))
            .with_state(state);
        let listener = tokio::net::TcpListener::bind(&self.listen).await?;
        println!("zcash-settler listening on http://{}", self.listen);
        axum::serve(listener, app).await?;
        Ok(())
    }
}

async fn health(State(s): State<SharedState>) -> ApiResult { ask(&s, Req::Health).await }
async fn address(State(s): State<SharedState>) -> ApiResult { ask(&s, Req::Address).await }
async fn balance(State(s): State<SharedState>) -> ApiResult { ask(&s, Req::Balance).await }
async fn sync_now(State(s): State<SharedState>) -> ApiResult { ask(&s, Req::Sync).await }
async fn send_payment(State(s): State<SharedState>, Json(body): Json<SendBody>) -> ApiResult { ask(&s, |r| Req::Send(body, r)).await }
async fn received(State(s): State<SharedState>, Query(q): Query<ReceivedQuery>) -> ApiResult { ask(&s, |r| Req::Received(q, r)).await }

/// The single wallet worker: owns every SQLite touch and every lightwalletd round trip, in order.
async fn worker(st: AppState, mut rx: mpsc::Receiver<Req>) {
    while let Some(req) = rx.recv().await {
        match req {
            Req::Health(r) => { let _ = r.send(do_health(&st)); }
            Req::Address(r) => { let _ = r.send(do_address(&st)); }
            Req::Balance(r) => { let _ = r.send(do_balance(&st)); }
            Req::Sync(r) => { let _ = r.send(run_sync(&st).await.map(|_| json!({ "ok": true }))); }
            Req::Send(body, r) => { let _ = r.send(do_send(&st, body).await); }
            Req::Received(q, r) => { let _ = r.send(do_received(&st, q).await); }
        }
    }
}

fn do_health(s: &AppState) -> anyhow::Result<Value> {
    let params = get_wallet_network(s.wallet_dir.as_ref())?;
    Ok(json!({ "ok": true, "network": format!("{:?}", params) }))
}

fn do_address(s: &AppState) -> anyhow::Result<Value> {
    let params = get_wallet_network(s.wallet_dir.as_ref())?;
    let (_, db_path) = get_db_paths(s.wallet_dir.as_ref());
    let db_data = WalletDb::for_path(db_path, params, (), ())?;
    let account = select_account(&db_data, None)?;
    let (ua, _) = account
        .uivk()
        .default_address(UnifiedAddressRequest::AllAvailableKeys)
        ?;
    Ok(json!({ "account": account.id().expose_uuid().to_string(), "address": ua.encode(&params) }))
}

async fn run_sync(s: &AppState) -> anyhow::Result<()> {
    sync::Command::new(s.connection.clone())
        .run(ShutdownListener::new(), s.wallet_dir.clone())
        .await
}


fn do_balance(s: &AppState) -> anyhow::Result<Value> {
    let params = get_wallet_network(s.wallet_dir.as_ref())?;
    let (_, db_path) = get_db_paths(s.wallet_dir.as_ref());
    let db_data = WalletDb::for_path(db_path, params, (), ())?;
    let account = select_account(&db_data, None)?;
    let summary = db_data
        .get_wallet_summary(ConfirmationsPolicy::default())
        ?
        .ok_or_else(|| anyhow!("wallet has not synced yet"))?;
    let b = summary
        .account_balances()
        .get(&account.id())
        .ok_or_else(|| anyhow!("no balance for account"))?;
    Ok(json!({
        "chain_tip_height": u32::from(summary.chain_tip_height()),
        "fully_scanned_height": u32::from(summary.fully_scanned_height()),
        "total": b.total().into_u64(),
        "sapling_spendable": b.sapling_balance().spendable_value().into_u64(),
        "orchard_spendable": b.orchard_balance().spendable_value().into_u64(),
        "transparent_spendable": b.unshielded_balance().spendable_value().into_u64(),
    }))
}

#[derive(Deserialize)]
struct SendBody {
    address: String,
    zatoshis: u64,
    memo: Option<String>,
}

struct ServeSend<'a>(&'a AppState);
impl PaymentContext for ServeSend<'_> {
    fn spending_account(&self) -> Option<Uuid> {
        None
    }
    fn age_identities(&self) -> anyhow::Result<Vec<Box<dyn age::Identity + Send + Sync>>> {
        let path = self.0.identity.clone().ok_or_else(|| anyhow!("serve was started without --identity; /send is disabled"))?;
        Ok(age::IdentityFile::from_file(path)?.into_identities()?)
    }
    fn connection_args(&self) -> &ConnectionArgs {
        &self.0.connection
    }
    fn target_note_count(&self) -> usize {
        self.0.target_note_count
    }
    fn min_split_output_value(&self) -> u64 {
        self.0.min_split_output_value
    }
    fn require_confirmation(&self) -> bool {
        false
    }
    fn tx_version(&self) -> Option<TxVersion> {
        None
    }
}

async fn do_send(s: &AppState, body: SendBody) -> anyhow::Result<Value> {
    if s.identity.is_none() {
        return Err(anyhow!("forbidden: this settler holds a viewing key only"));
    }
    let recipient = ZcashAddress::try_from_encoded(&body.address).map_err(|_| anyhow!("bad request: invalid recipient address"))?;
    let value = Zatoshis::from_u64(body.zatoshis).map_err(|_| anyhow!("bad request: invalid amount"))?;
    let memo = body
        .memo
        .as_deref()
        .map(|m| m.parse::<Memo>().map(MemoBytes::from))
        .transpose()
        .map_err(|_| anyhow!("bad request: invalid memo"))?;
    let payment = Payment::new(recipient, Some(value), memo, None, None, vec![]).map_err(|e| anyhow!("bad request: {e}"))?;
    let request = TransactionRequest::new(vec![payment]).map_err(|e| anyhow!("bad request: {e}"))?;
    // make sure we spend against the latest chain state
    run_sync(s).await?;
    let txid = send::pay(s.wallet_dir.clone(), ServeSend(s), request)
        .await
        ?
        .ok_or_else(|| anyhow!("transaction was not created"))?;
    Ok(json!({ "txid": txid.to_string() }))
}

#[derive(Deserialize)]
struct ReceivedQuery {
    /// Exact text memo to match (the payment id).
    memo: Option<String>,
    /// Minimum value in zatoshis.
    min_zatoshis: Option<u64>,
    /// Sync before querying (default true).
    sync: Option<bool>,
}

async fn do_received(s: &AppState, q: ReceivedQuery) -> anyhow::Result<Value> {
    if q.sync.unwrap_or(true) {
        run_sync(s).await?;
    }
    let (_, db_path) = get_db_paths(s.wallet_dir.as_ref());
    let conn = Connection::open(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT t.txid, t.mined_height, t.block_time, o.value, o.output_pool, o.memo
             FROM v_tx_outputs o
             JOIN v_transactions t ON o.txid = t.txid
             WHERE o.to_account_uuid IS NOT NULL AND (o.is_change IS NULL OR o.is_change = 0)
             ORDER BY t.mined_height DESC",
        )
        ?;
    let rows = stmt
        .query_map([], |row| {
            let txid: Vec<u8> = row.get(0)?;
            let mined_height: Option<u32> = row.get(1)?;
            let block_time: Option<i64> = row.get(2)?;
            let value: i64 = row.get(3)?;
            let pool: i64 = row.get(4)?;
            let memo: Option<Vec<u8>> = row.get(5)?;
            Ok((txid, mined_height, block_time, value, pool, memo))
        })
        ?;
    let mut out = Vec::new();
    for r in rows {
        let (txid, mined_height, block_time, value, pool, memo) = r?;
        let memo_text = memo
            .as_deref()
            .and_then(|b| MemoBytes::from_bytes(b).ok())
            .and_then(|m| Memo::try_from(m).ok())
            .and_then(|m| match m {
                Memo::Text(t) => Some(t.to_string()),
                _ => None,
            });
        if let Some(want) = &q.memo {
            if memo_text.as_deref() != Some(want.as_str()) {
                continue;
            }
        }
        if let Some(min) = q.min_zatoshis {
            if (value.max(0) as u64) < min {
                continue;
            }
        }
        let txid: [u8; 32] = txid.as_slice().try_into().map_err(|_| anyhow!("bad txid width"))?;
        out.push(json!({
            "txid": TxId::from_bytes(txid).to_string(),
            "mined_height": mined_height,
            "block_time": block_time,
            "zatoshis": value,
            "pool": match pool { 0 => "transparent", 2 => "sapling", 3 => "orchard", _ => "unknown" },
            "memo": memo_text,
        }));
    }
    Ok(json!({ "received": out }))
}
