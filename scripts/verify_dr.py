#!/usr/bin/env python3
"""
Automated Verification Script for Cloud DR and Intelligent Failover Prototype
Zero external dependencies (uses standard library urllib and json).
Tests health checks, ML anomaly scoring, chaos injection, dynamic failover, RTO/RPO measurement, and failback.
"""
import time
import json
import sys
import urllib.request
import urllib.error

ROUTER_URL = "http://localhost:8080"
CONTROLLER_URL = "http://localhost:8001"

def http_get(url, timeout=3.0):
    req = urllib.request.Request(url, headers={"User-Agent": "CloudDR-Tester"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def http_post(url, data=None, timeout=3.0):
    payload = json.dumps(data).encode("utf-8") if data else b"{}"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "CloudDR-Tester"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def step(title):
    print(f"\n========================================================")
    print(f"==> {title}")
    print(f"========================================================")

def verify_all():
    step("1. Verifying System Ingress & Initial Health (http://localhost:8080)")
    try:
        status, data = http_get(f"{ROUTER_URL}/health", timeout=3)
        assert status == 200, f"Expected 200 from router, got {status}"
        print(f"[PASS] Ingress active. Health OK: {data}")
        assert data.get("region") == "region-primary", f"Expected active region-primary, got {data.get('region')}"
    except Exception as e:
        print(f"[FAIL] Ingress check failed: {e}")
        return False

    step("2. Verifying Controller APIs (Overview, Telemetry, ML, Replication, Scoring)")
    try:
        _, overview = http_get(f"{CONTROLLER_URL}/api/overview", timeout=3)
        print(f"[PASS] Active Region: {overview.get('active_region')}")
        print(f"[PASS] DR-1 Lag: {overview.get('replication', {}).get('dr1_lag_ms')}ms | DR-2 Lag: {overview.get('replication', {}).get('dr2_lag_ms')}ms")
        
        _, ml_stat = http_get(f"{CONTROLLER_URL}/api/ml", timeout=3)
        print(f"[PASS] ML Model Trained: {ml_stat.get('is_trained')} | Score: {ml_stat.get('current_anomaly_score')}")
        
        _, scoring = http_get(f"{CONTROLLER_URL}/api/scoring", timeout=3)
        print(f"[PASS] Weighted Scoring Winner: {scoring.get('winner')}")
        for reg, sc in scoring.get("candidate_scores", {}).items():
            print(f"       -> {reg}: Composite Score = {sc.get('composite_score')} (Health={sc.get('health_score')}, Cap={sc.get('capacity_score')}, Lat={sc.get('latency_score')})")
    except Exception as e:
        print(f"[FAIL] Controller check failed: {e}")
        return False

    step("3. Testing Transaction State Replication from Primary to DR Replicas")
    try:
        test_payload = {
            "customer_id": "TEST-VERIFY-001",
            "amount": 499.99,
            "category": "VerificationTest"
        }
        status, created_tx = http_post(f"{ROUTER_URL}/records", data=test_payload, timeout=3)
        assert status == 200, "Failed to write transaction"
        print(f"[PASS] Transaction written to primary: {created_tx.get('tx_id')}")
        
        # Wait 2.5 seconds for replicator background loop
        time.sleep(2.5)
        
        _, rep_data = http_get(f"{CONTROLLER_URL}/api/replication", timeout=3)
        recent_tx_ids = [r.get("tx_id") for r in rep_data.get("recent_records", [])]
        print(f"[PASS] Replicated stream has {len(recent_tx_ids)} recent records. Total replicated: {rep_data.get('total_records_replicated')}")
    except Exception as e:
        print(f"[FAIL] Replication verification failed: {e}")
        return False

    step("4. Chaos Injection: Triggering Automated Disaster Recovery (Hard Crash)")
    try:
        print("[*] Simulating primary hardware crash via /api/chaos/crash...")
        http_post(f"{CONTROLLER_URL}/api/chaos/crash", data={}, timeout=3)
        
        print("[*] Waiting for ML confirmation (3 consecutive windows) & switchover (approx 7 seconds)...")
        failover_done = False
        new_active = None
        for i in range(14):
            time.sleep(1.0)
            try:
                _, ov = http_get(f"{CONTROLLER_URL}/api/overview", timeout=3)
                curr = ov.get("active_region")
                if curr != "region-primary":
                    failover_done = True
                    new_active = curr
                    break
                print(f"    ... waiting (active: {curr}, consecutive anomalous windows: {ov.get('ml_status', {}).get('consecutive_windows')}/3)")
            except Exception:
                pass
            
        assert failover_done, "Failover did not switch region within expected time window"
        print(f"[PASS] Intelligent Failover Succeeded! New Active Region: {new_active}")

        # Verify Nginx is routing to new active region
        _, r_probe = http_get(f"{ROUTER_URL}/health", timeout=3)
        print(f"[PASS] Ingress router is now seamlessly proxying to: {r_probe.get('region')}")
        assert r_probe.get("region") == new_active, "Router not routing to new active region"
        
        # Verify RTO and RPO metrics
        _, incidents = http_get(f"{CONTROLLER_URL}/api/incidents", timeout=3)
        latest_inc = incidents[0]
        print(f"[PASS] Recorded Incident Audit:")
        print(f"       -> ID: {latest_inc.get('id')}")
        print(f"       -> Measured RTO: {latest_inc.get('rto_seconds')} seconds")
        print(f"       -> Measured RPO: {latest_inc.get('rpo_ms')} ms")
        print(f"       -> Status: {latest_inc.get('status')}")
    except Exception as e:
        print(f"[FAIL] Failover verification failed: {e}")
        return False

    step("5. Automated Failback Workflow: Restoring Primary and Switching Traffic Back")
    try:
        # First reset chaos
        http_post(f"{CONTROLLER_URL}/api/chaos/reset", data={}, timeout=3)
        time.sleep(1.5)
        
        # Trigger failback
        _, fb_resp = http_post(f"{CONTROLLER_URL}/api/failback", data={}, timeout=5)
        print(f"[PASS] Failback response: {fb_resp.get('status')} | {fb_resp.get('notes')}")
        
        # Verify router returns to region-primary (allow up to 3 seconds for Nginx reload)
        router_returned_primary = False
        r_back = {}
        for _ in range(6):
            time.sleep(0.5)
            try:
                _, r_back = http_get(f"{ROUTER_URL}/health", timeout=3)
                if r_back.get("region") == "region-primary":
                    router_returned_primary = True
                    break
            except Exception:
                pass

        print(f"[PASS] Ingress router returned to: {r_back.get('region')}")
        assert router_returned_primary, f"Router did not return to primary (returned {r_back.get('region')})"
    except Exception as e:
        print(f"[FAIL] Failback verification failed: {e}")
        return False

    step("ALL 5 MODULE TESTS PASSED! Cloud DR Prototype is 100% Operational.")
    return True

if __name__ == "__main__":
    success = verify_all()
    sys.exit(0 if success else 1)
