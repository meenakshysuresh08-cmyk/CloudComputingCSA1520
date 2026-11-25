import os
import time
import sqlite3
import random
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psutil

# Configuration via environment variables
REGION_NAME = os.getenv("REGION_NAME", "region-primary")
DEFAULT_ROLE = os.getenv("REGION_ROLE", "primary") # primary | standby
BASE_LATENCY_MS = float(os.getenv("BASE_LATENCY_MS", "15.0"))
CAPACITY_MAX_QPS = float(os.getenv("CAPACITY_MAX_QPS", "500.0"))
COST_PER_HOUR = float(os.getenv("COST_PER_HOUR", "0.85"))

app = FastAPI(title=f"CloudDR Region App - {REGION_NAME}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Stateful state
current_role = DEFAULT_ROLE
start_time = time.time()
request_counter = 0
error_counter = 0

# Chaos injection state
chaos_state = {
    "crashed": False,
    "cpu_spike": False,
    "latency_spike_ms": 0.0,
    "error_rate": 0.0,  # 0.0 to 1.0
    "capacity_degraded_pct": 0.0, # 0.0 to 100.0
}

DB_PATH = f"/tmp/{REGION_NAME}_data.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tx_id TEXT UNIQUE,
            customer_id TEXT,
            amount REAL,
            category TEXT,
            region TEXT,
            timestamp REAL,
            created_at TEXT
        )
    """)
    conn.commit()
    conn.close()

init_db()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Pre-populate sample records if empty
def seed_sample_records():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM transactions")
    count = cur.fetchone()[0]
    if count == 0 and current_role == "primary":
        sample_cats = ["CloudCompute", "StorageS3", "DatabaseRDS", "APIGateway", "CDNTraffic"]
        for i in range(12):
            t = time.time() - (12 - i) * 60
            cur.execute("""
                INSERT INTO transactions (tx_id, customer_id, amount, category, region, timestamp, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                f"TX-{uuid.uuid4().hex[:8].upper()}",
                f"CUST-{(1000 + i * 37) % 9999}",
                round(random.uniform(49.0, 890.0), 2),
                sample_cats[i % len(sample_cats)],
                REGION_NAME,
                t,
                datetime.fromtimestamp(t).isoformat()
            ))
        conn.commit()
    conn.close()

seed_sample_records()

class TransactionCreate(BaseModel):
    customer_id: str
    amount: float
    category: str

class ChaosConfig(BaseModel):
    crashed: Optional[bool] = None
    cpu_spike: Optional[bool] = None
    latency_spike_ms: Optional[float] = None
    error_rate: Optional[float] = None
    capacity_degraded_pct: Optional[float] = None

class SyncPayload(BaseModel):
    records: List[Dict[str, Any]]

@app.middleware("http")
async def chaos_and_metrics_middleware(request: Request, call_next):
    global request_counter, error_counter
    request_counter += 1

    # Check hard crash
    if chaos_state["crashed"] and request.url.path not in ["/chaos", "/reset"]:
        error_counter += 1
        return Response(content='{"error": "Simulated Region Crash / Service Unavailable"}', status_code=503, media_type="application/json")

    # Check simulated latency
    total_latency_ms = BASE_LATENCY_MS + chaos_state["latency_spike_ms"]
    if total_latency_ms > 0:
        time.sleep(total_latency_ms / 1000.0)

    # Check random error injection
    if chaos_state["error_rate"] > 0 and request.url.path not in ["/chaos", "/reset"]:
        if random.random() < chaos_state["error_rate"]:
            error_counter += 1
            return Response(content='{"error": "Simulated Chaos Transient Internal Server Error"}', status_code=500, media_type="application/json")

    response = await call_next(request)
    return response

@app.get("/")
def get_root():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM transactions")
    tx_count = cur.fetchone()[0]
    conn.close()

    return {
        "region": REGION_NAME,
        "role": current_role,
        "status": "crashed" if chaos_state["crashed"] else ("active" if current_role in ["primary", "active"] else "standby"),
        "transaction_count": tx_count,
        "base_latency_ms": BASE_LATENCY_MS,
        "current_latency_ms": BASE_LATENCY_MS + chaos_state["latency_spike_ms"],
        "max_capacity_qps": CAPACITY_MAX_QPS,
        "cost_per_hour": COST_PER_HOUR,
        "uptime_seconds": round(time.time() - start_time, 2)
    }

@app.get("/health")
def health_check():
    if chaos_state["crashed"]:
        raise HTTPException(status_code=503, detail="Simulated Region Hardware/Node Failure")
    return {
        "status": "healthy",
        "region": REGION_NAME,
        "role": current_role,
        "timestamp": time.time()
    }

@app.get("/metrics")
def get_metrics():
    # Simulated or actual system metrics
    sys_cpu = psutil.cpu_percent(interval=None)
    cpu_val = 88.0 + random.uniform(2.0, 9.5) if chaos_state["cpu_spike"] else max(8.0, min(sys_cpu, 35.0) + random.uniform(2.0, 8.0))
    mem_val = 72.0 + random.uniform(5.0, 15.0) if chaos_state["cpu_spike"] else 38.0 + random.uniform(1.0, 5.0)
    
    current_latency = BASE_LATENCY_MS + chaos_state["latency_spike_ms"] + random.uniform(-1.5, 2.5)
    effective_error_rate = chaos_state["error_rate"] if not chaos_state["crashed"] else 1.0
    
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT MAX(id), MAX(timestamp) FROM transactions")
    row = cur.fetchone()
    last_id = row[0] or 0
    last_ts = row[1] or time.time()
    cur.execute("SELECT COUNT(*) FROM transactions")
    tx_count = cur.fetchone()[0]
    conn.close()

    effective_capacity = max(0.0, CAPACITY_MAX_QPS * (1.0 - (chaos_state["capacity_degraded_pct"] / 100.0)))

    return {
        "region": REGION_NAME,
        "role": current_role,
        "cpu_pct": round(cpu_val, 2),
        "mem_pct": round(mem_val, 2),
        "latency_ms": round(max(1.0, current_latency), 2),
        "error_rate": round(effective_error_rate, 3),
        "total_requests": request_counter,
        "total_errors": error_counter,
        "capacity_qps": round(effective_capacity, 1),
        "capacity_max_qps": CAPACITY_MAX_QPS,
        "cost_per_hour": COST_PER_HOUR,
        "last_record_id": last_id,
        "last_record_timestamp": last_ts,
        "record_count": tx_count,
        "chaos_active": chaos_state,
        "timestamp": time.time()
    }

@app.get("/records")
def list_records(limit: int = 50):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM transactions ORDER BY id DESC LIMIT ?", (limit,))
    rows = cur.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/records")
def create_record(tx: TransactionCreate):
    conn = get_db()
    cur = conn.cursor()
    now_ts = time.time()
    new_tx_id = f"TX-{uuid.uuid4().hex[:8].upper()}"
    cur.execute("""
        INSERT INTO transactions (tx_id, customer_id, amount, category, region, timestamp, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        new_tx_id,
        tx.customer_id,
        tx.amount,
        tx.category,
        REGION_NAME,
        now_ts,
        datetime.fromtimestamp(now_ts).isoformat()
    ))
    conn.commit()
    last_id = cur.lastrowid
    conn.close()
    return {
        "message": "Record written successfully",
        "id": last_id,
        "tx_id": new_tx_id,
        "region": REGION_NAME,
        "timestamp": now_ts
    }

@app.get("/state-export")
def state_export(since_id: int = 0):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM transactions WHERE id > ? ORDER BY id ASC", (since_id,))
    rows = cur.fetchall()
    cur.execute("SELECT MAX(id), MAX(timestamp), COUNT(*) FROM transactions")
    summary = cur.fetchone()
    conn.close()
    return {
        "region": REGION_NAME,
        "last_id": summary[0] or 0,
        "last_timestamp": summary[1] or 0,
        "total_count": summary[2] or 0,
        "records": [dict(r) for r in rows]
    }

@app.post("/sync-state")
def sync_state(payload: SyncPayload):
    if not payload.records:
        return {"synced": 0}
    conn = get_db()
    cur = conn.cursor()
    synced_count = 0
    for r in payload.records:
        try:
            cur.execute("""
                INSERT OR REPLACE INTO transactions (id, tx_id, customer_id, amount, category, region, timestamp, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                r.get("id"),
                r["tx_id"],
                r.get("customer_id", "ANON"),
                r.get("amount", 0.0),
                r.get("category", "General"),
                r.get("region", REGION_NAME),
                r.get("timestamp", time.time()),
                r.get("created_at", datetime.now().isoformat())
            ))
            synced_count += 1
        except Exception:
            pass
    conn.commit()
    conn.close()
    return {"message": "Replication batch applied", "synced": synced_count, "region": REGION_NAME}

@app.post("/promote")
def promote_to_active():
    global current_role
    current_role = "active"
    return {"status": "promoted", "role": current_role, "region": REGION_NAME}

@app.post("/demote")
def demote_to_standby():
    global current_role
    current_role = "standby"
    return {"status": "demoted", "role": current_role, "region": REGION_NAME}

@app.post("/chaos")
def set_chaos(cfg: ChaosConfig):
    if cfg.crashed is not None:
        chaos_state["crashed"] = cfg.crashed
    if cfg.cpu_spike is not None:
        chaos_state["cpu_spike"] = cfg.cpu_spike
    if cfg.latency_spike_ms is not None:
        chaos_state["latency_spike_ms"] = max(0.0, cfg.latency_spike_ms)
    if cfg.error_rate is not None:
        chaos_state["error_rate"] = max(0.0, min(1.0, cfg.error_rate))
    if cfg.capacity_degraded_pct is not None:
        chaos_state["capacity_degraded_pct"] = max(0.0, min(100.0, cfg.capacity_degraded_pct))
    return {"status": "chaos_updated", "chaos_state": chaos_state, "region": REGION_NAME}

@app.post("/reset")
def reset_all():
    global chaos_state
    chaos_state = {
        "crashed": False,
        "cpu_spike": False,
        "latency_spike_ms": 0.0,
        "error_rate": 0.0,
        "capacity_degraded_pct": 0.0,
    }
    return {"status": "reset_success", "chaos_state": chaos_state, "region": REGION_NAME}
