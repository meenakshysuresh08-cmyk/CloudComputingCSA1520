# Automated Cloud Disaster Recovery with Intelligent Failover
### Multi-Region Local Cloud DR Prototype with Scikit-Learn ML Anomaly Detection, Weighted Region Scoring & Pinterest-Inspired Visual Console

---

## 1. System Overview

This project is a complete, runnable local prototype of an **Automated Cloud Disaster Recovery (DR) and Intelligent Failover System** operating inside isolated Docker networks with **zero cloud costs**.

It models a multi-region deployment featuring:
- **Nginx Dynamic Ingress Router (`http://localhost:8080`)**: Zero-downtime traffic switching across cloud regions.
- **5 Core Backend Modules**:
  1. *Cloud Environment & Telemetry Monitoring*: Multi-region stateful applications + continuous 2s polling.
  2. *Disaster Detection & Prediction*: `scikit-learn` **Isolation Forest** anomaly detector + rolling window confirmation filter.
  3. *Continuous Backup & Replication*: Streaming delta replication with live lag metrics & point-in-time IaC snapshots.
  4. *Intelligent Failover Engine*: Multi-criteria weighted region scoring across Health, Capacity, Latency, Lag, and Cost.
  5. *Recovery, Failback & Validation*: Autonomous promotion, post-failover synthetic probes, exact RTO/RPO calculation, and automated failback.
- **Aesthetic Pinterest-Inspired Web Application (`http://localhost:3000`)**:
  - Warm alabaster design system (`#FAF9F6`), pure white rounded masonry cards (`#FFFFFF`, `rounded-[20px]`), pastel status pills, and persistent top navigation.
  - 6 dedicated pages: **Overview Board**, **Live Telemetry & Topology**, **ML Anomaly Lab**, **Backup & Replication**, **Failover & Chaos Studio**, and **RTO/RPO Reports & Architecture**.

---

## 2. Docker Architecture & Subnet Topology

| Container | Internal Role | Subnet / Network | Exposed Port | Description |
| :--- | :--- | :--- | :--- | :--- |
| `router` | Dynamic Ingress Proxy | `front-net`, `region-primary-net`, `region-dr-net` | `8080` | Nginx reverse proxy dynamically routing to active region |
| `region-primary` | Stateful Primary Region | `region-primary-net` (172.28.0.0/16), `front-net` | *internal: 8000* | FastAPI + SQLite database + `/metrics` & `/health` |
| `region-dr-1` | Candidate DR-1 (Warm) | `region-dr-net` (172.29.0.0/16), `front-net` | *internal: 8000* | Low latency (22ms), high capacity (450 QPS), $0.70/hr |
| `region-dr-2` | Candidate DR-2 (Economy) | `region-dr-net` (172.29.0.0/16), `front-net` | *internal: 8000* | Moderate latency (70ms), cost-optimized, $0.25/hr |
| `controller` | Intelligent DR Orchestrator | All networks | `8001` | ML engine, replication worker, scoring engine & Docker socket |
| `frontend` | Pinterest Management UI | `front-net` | `3000` | Multi-page aesthetic web dashboard |

---

## 3. The 5 Core Backend Modules

### Module 1: Cloud Environment & Monitoring
- Continuous 2-second telemetry probe collecting CPU%, memory%, round-trip HTTP latency, HTTP status codes, and error rates.
- Rolling 100-sample in-memory telemetry buffer and time-series persistence.

### Module 2: Disaster Detection & ML Prediction
- **Algorithm**: `IsolationForest` (`n_estimators=100`, `contamination=0.04`) trained on normal cloud telemetry:
  $$\vec{x} = [\text{CPU}\%, \text{Mem}\%, \text{Latency (ms)}, \text{ErrorRate}]$$
- **Rolling Window Confirmation Filter**: Requires **3 consecutive anomalous windows** AND a failed active health probe before confirming disaster. Prevents false-positive failovers from momentary traffic surges.

### Module 3: Continuous Backup & Replication
- Continuous delta replication pushing transactions from the active region to candidate replicas.
- Live replication lag measurement:
  $$\text{Lag (ms)} = (T_{\text{active\_commit}} - T_{\text{replica\_sync}}) \times 1000$$
- Automated versioned snapshots of database state, `docker-compose.yml`, and `nginx.conf`.

### Module 4: Intelligent Weighted Region Scoring
When disaster strikes, DR candidates are evaluated via a 5-factor weighted algorithm:
$$\text{Score}(R) = w_{\text{health}} \cdot S_{\text{health}} + w_{\text{cap}} \cdot S_{\text{cap}} + w_{\text{lat}} \cdot S_{\text{lat}} + w_{\text{lag}} \cdot S_{\text{lag}} + w_{\text{cost}} \cdot S_{\text{cost}}$$
- Default weights: **Health (30%)**, **Capacity (25%)**, **Latency (20%)**, **Replication Lag (15%)**, **Cost (10%)**.
- **Safe Admin Escalation Gate**: If all candidates fall below the readiness threshold ($S < 55$), the engine triggers an administrative emergency alert instead of failing over to an unstable node.

### Module 5: Recovery, Failback & RTO/RPO Auditing
- Automatically promotes winning region (`/promote`), rewrites Nginx upstream configuration, and reloads Nginx dynamically.
- Measures exact:
  - **RTO (Recovery Time Objective)**: Detection + Scoring Decision + Nginx Switch + Validation Probe.
  - **RPO (Recovery Point Objective)**: Measured replication lag window at moment of failure (< 50ms).
- **Automated Failback**: Validates primary health, synchronizes delta records back to primary, switches Nginx upstream back, and demotes DR replica to standby.

---

## 4. Multi-Page Pinterest-Style Frontend UI (`http://localhost:3000`)

- **Palette**: Warm alabaster background (`#FAF9F6`), white masonry cards (`#FFFFFF`, `border-radius: 20px`), subtle diffused shadows, and pastel status pills (sage green, warm amber, coral red, dusty periwinkle).
- **Navigation**: Persistent top bar with brand logo (`CloudDR Studio`), live active region pill, search bar, and 6 dedicated page tabs:
  1. **Overview Board (`#/`)**: Pinterest Masonry Pin Grid with category filters (`All`, `Health`, `ML Engine`, `Replication`, `Incidents`).
  2. **Live Telemetry & Topology (`#/telemetry`)**: Animated traffic flow topology diagram (`Client -> Nginx Proxy -> Primary / DR-1 / DR-2`) and per-region metric cards.
  3. **ML Anomaly Lab (`#/ml-detection`)**: Real-time Isolation Forest anomaly timeline chart, consecutive window progress, and model recalibration button.
  4. **Backup & Replication (`#/replication`)**: Live streaming transaction table, DR-1 and DR-2 lag gauges, and IaC snapshot viewer (`docker-compose.yml`, `nginx.conf`).
  5. **Intelligent Failover & Chaos Studio (`#/failover-chaos`)**: Interactive weight sliders, real-time score comparison bars, and 5 one-click chaos injection cards.
  6. **RTO/RPO Reports & Architecture (`#/reports`)**: Historical incident cards with measured RTO/RPO metrics, Traditional Manual DR vs. Automated CloudDR benchmark table, and CSV/JSON export.

---

## 5. Quickstart & Verification

### Start All Services:
```bash
docker-compose up -d --build
```

### Access Points:
- **Management Console (Pinterest UI)**: [http://localhost:3000](http://localhost:3000)
- **Ingress Traffic Entrypoint (Nginx)**: [http://localhost:8080](http://localhost:8080)
- **Controller API & Docs**: [http://localhost:8001/docs](http://localhost:8001/docs)

### Run Automated End-to-End Verification:
```bash
python scripts/verify_dr.py
```

### Run Continuous Realistic User Traffic:
```bash
python scripts/generate_traffic.py
```
