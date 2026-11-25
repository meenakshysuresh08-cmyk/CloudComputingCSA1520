#!/usr/bin/env python3
"""
Traffic Generator for Cloud Disaster Recovery Prototype
Simulates continuous user transactions flowing through Nginx reverse proxy (http://localhost:8080)
Uses standard library urllib (no external dependencies).
"""
import time
import random
import json
import urllib.request
import urllib.error
import sys

ROUTER_URL = "http://localhost:8080"

CATEGORIES = ["CloudCompute", "StorageS3", "DatabaseRDS", "APIGateway", "CDNTraffic", "AIService", "SecurityKMS"]
CUSTOMERS = [f"CUST-{x}" for x in range(101, 140)]

def run_traffic():
    print(f"[*] Starting realistic traffic simulation to {ROUTER_URL}...")
    success_count = 0
    fail_count = 0
    
    while True:
        try:
            if random.random() < 0.8:
                payload = {
                    "customer_id": random.choice(CUSTOMERS),
                    "amount": round(random.uniform(15.0, 750.0), 2),
                    "category": random.choice(CATEGORIES)
                }
                data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    f"{ROUTER_URL}/records",
                    data=data,
                    headers={"Content-Type": "application/json", "User-Agent": "TrafficGen"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=2.5) as resp:
                    res_body = json.loads(resp.read().decode("utf-8"))
                    success_count += 1
                    print(f"[{time.strftime('%H:%M:%S')}] [POST /records] 200 OK | Region: {res_body.get('region')} | TX: {res_body.get('tx_id')} | Total: {success_count}")
            else:
                req = urllib.request.Request(f"{ROUTER_URL}/records?limit=5", headers={"User-Agent": "TrafficGen"})
                with urllib.request.urlopen(req, timeout=2.5) as resp:
                    res_body = json.loads(resp.read().decode("utf-8"))
                    success_count += 1
                    print(f"[{time.strftime('%H:%M:%S')}] [GET /records]  200 OK | Retrieved {len(res_body)} records")

        except Exception as e:
            fail_count += 1
            print(f"[{time.strftime('%H:%M:%S')}] [CONNECTION NOTICE] {e}")
            
        time.sleep(random.uniform(0.8, 2.0))

if __name__ == "__main__":
    try:
        run_traffic()
    except KeyboardInterrupt:
        print("\nTraffic simulation stopped by user.")
