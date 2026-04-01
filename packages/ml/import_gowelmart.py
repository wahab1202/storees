"""
GoWelmart Data Importer — Fetches real ecommerce data from Medusa-based API
and imports into Storees database.

Endpoints:
  - /external/customers (14,716 records)
  - /external/orders (10,841 records)
  - /external/carts (14,904 records — abandoned + completed)

Events generated:
  - order_completed (from orders)
  - add_to_cart (from all carts)
  - cart_abandoned (from carts where completed=false)
  - checkout_completed (from carts where completed=true)

Usage:
  python import_gowelmart.py --project-id <UUID>
  python import_gowelmart.py --project-id <UUID> --clean   # remove previously imported data first
"""

from __future__ import annotations

import argparse
import os
import sys
import uuid
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import requests
from dotenv import load_dotenv
from sqlalchemy import (
    Boolean, Column, DateTime, Integer, MetaData, Numeric, String, Table, Text,
    create_engine, delete, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID, insert as pg_insert
from sqlalchemy.orm import Session

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_URL = "https://api.ecommerce.gowelmart.com/external"
API_TOKEN = os.getenv(
    "GOWELMART_API_TOKEN",
    "2df307dd7ad581741c087bab55788e977fa3d9203bc7504230764dd432cb580b",
)
BATCH_SIZE = 500
PAGE_SIZE = 500  # API fetch page size (larger = fewer requests)
SOURCE_TAG = "gowelmart_import"

# ---------------------------------------------------------------------------
# Schema mirrors
# ---------------------------------------------------------------------------

metadata = MetaData()

customers_table = Table(
    "customers", metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("project_id", UUID(as_uuid=True), nullable=False),
    Column("external_id", String(255)),
    Column("email", String(255)),
    Column("phone", String(50)),
    Column("name", String(255)),
    Column("first_seen", DateTime(timezone=True), nullable=False),
    Column("last_seen", DateTime(timezone=True), nullable=False),
    Column("total_orders", Integer, nullable=False, default=0),
    Column("total_spent", Numeric(12, 2), nullable=False, default=0),
    Column("avg_order_value", Numeric(12, 2), nullable=False, default=0),
    Column("clv", Numeric(12, 2), nullable=False, default=0),
    Column("email_subscribed", Boolean, nullable=False, default=False),
    Column("sms_subscribed", Boolean, nullable=False, default=False),
    Column("push_subscribed", Boolean, nullable=False, default=False),
    Column("whatsapp_subscribed", Boolean, nullable=False, default=False),
    Column("custom_attributes", JSONB, default={}),
    Column("metrics", JSONB, default={}),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
)

events_table = Table(
    "events", metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column("project_id", UUID(as_uuid=True), nullable=False),
    Column("customer_id", UUID(as_uuid=True)),
    Column("event_name", String(100), nullable=False),
    Column("properties", JSONB, default={}),
    Column("platform", String(30), nullable=False),
    Column("source", String(30), nullable=False, default="api"),
    Column("session_id", String(255)),
    Column("idempotency_key", String(255)),
    Column("timestamp", DateTime(timezone=True), nullable=False),
    Column("received_at", DateTime(timezone=True), nullable=False),
)

NOW = datetime.now(timezone.utc)

# ---------------------------------------------------------------------------
# API Fetcher
# ---------------------------------------------------------------------------

def fetch_all(endpoint: str, params: dict | None = None) -> list[dict]:
    """Fetch all records from a paginated API endpoint with retry."""
    headers = {"Authorization": f"Bearer {API_TOKEN}"}
    session = requests.Session()
    all_data: list[dict] = []
    offset = 0
    total = None
    max_retries = 3

    if params is None:
        params = {}

    while True:
        req_params = {**params, "limit": PAGE_SIZE, "offset": offset}
        url = f"{BASE_URL}{endpoint}"

        for attempt in range(1, max_retries + 1):
            try:
                print(f"  Fetching {endpoint} offset={offset}...", end=" ", flush=True)
                resp = session.get(url, headers=headers, params=req_params, timeout=120)
                resp.raise_for_status()
                body = resp.json()
                break
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
                if attempt == max_retries:
                    raise
                wait = attempt * 3
                print(f"retry {attempt}/{max_retries} in {wait}s...", end=" ", flush=True)
                time.sleep(wait)

        if not body.get("status"):
            print(f"API error: {body.get('message')}")
            break

        data = body.get("data", [])
        pagination = body.get("pagination", {})
        total = pagination.get("total", 0)

        all_data.extend(data)
        print(f"got {len(data)} (total so far: {len(all_data)}/{total})")

        if len(all_data) >= total or len(data) == 0:
            break

        offset += PAGE_SIZE
        time.sleep(1.0)  # Longer delay to avoid server connection resets

    return all_data


def parse_ts(ts_str: str | None) -> datetime:
    """Parse ISO timestamp, fallback to now."""
    if not ts_str:
        return NOW
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return NOW

# ---------------------------------------------------------------------------
# Import logic
# ---------------------------------------------------------------------------

def import_data(project_id: str, clean: bool = False):
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    engine = create_engine(database_url, echo=False)
    pid = uuid.UUID(project_id)

    # ---- Clean previous import ----
    if clean:
        with Session(engine) as session:
            print("[clean] Removing previously imported GoWelmart data...")
            # Find imported customer IDs
            result = session.execute(
                customers_table.select().where(
                    customers_table.c.project_id == pid,
                    customers_table.c.custom_attributes["_source"].astext == SOURCE_TAG,
                )
            )
            imported_ids = [row.id for row in result]
            if imported_ids:
                # Delete from related tables first
                for tbl_name in ["segment_snapshots", "customer_segments", "prediction_scores"]:
                    try:
                        session.execute(text(
                            f"DELETE FROM {tbl_name} WHERE customer_id = ANY(:ids)"
                        ), {"ids": imported_ids})
                    except Exception:
                        pass
                # Delete events
                for i in range(0, len(imported_ids), BATCH_SIZE):
                    batch = imported_ids[i:i + BATCH_SIZE]
                    session.execute(
                        delete(events_table).where(
                            events_table.c.project_id == pid,
                            events_table.c.customer_id.in_(batch),
                        )
                    )
                # Delete customers
                session.execute(
                    delete(customers_table).where(
                        customers_table.c.project_id == pid,
                        customers_table.c.custom_attributes["_source"].astext == SOURCE_TAG,
                    )
                )
                session.commit()
                print(f"[clean] Removed {len(imported_ids)} customers and their events")
            else:
                print("[clean] No previously imported data found")

    # ---- Fetch from API ----
    print("\n=== Fetching Customers ===")
    raw_customers = fetch_all("/customers")

    print("\n=== Fetching Orders ===")
    raw_orders = fetch_all("/orders")

    print("\n=== Fetching Abandoned Carts ===")
    raw_abandoned = fetch_all("/carts", {"completed": "false"})

    print("\n=== Fetching Completed Carts ===")
    raw_completed = fetch_all("/carts", {"completed": "true"})

    print(f"\nFetched: {len(raw_customers)} customers, {len(raw_orders)} orders, "
          f"{len(raw_abandoned)} abandoned carts, {len(raw_completed)} completed carts")

    # ---- Build customer map ----
    # Map external customer_id → our UUID
    ext_to_uuid: dict[str, uuid.UUID] = {}
    customer_rows: list[dict] = []
    customer_order_stats: dict[str, dict] = {}  # ext_id → {count, spent}

    # Pre-compute order stats per customer
    for order in raw_orders:
        ext_cid = order.get("customer_id", "")
        if not ext_cid:
            continue
        stats = customer_order_stats.setdefault(ext_cid, {"count": 0, "spent": 0})
        stats["count"] += 1
        stats["spent"] += float(order.get("order_total", 0) or 0)

    print(f"\n=== Processing {len(raw_customers)} customers ===")
    for i, cust in enumerate(raw_customers):
        ext_id = cust.get("customer_id", "")
        if not ext_id:
            continue

        # Skip duplicate external_ids (API may return same customer twice)
        if ext_id in ext_to_uuid:
            continue

        cid = uuid.uuid4()
        ext_to_uuid[ext_id] = cid

        email = cust.get("email", "")
        phone = cust.get("phone", "")
        name = cust.get("full_name") or cust.get("first_name", "")
        last_name = cust.get("last_name", "")
        if last_name and last_name != name:
            name = f"{name} {last_name}".strip()

        signup = parse_ts(cust.get("signup_date"))
        updated = parse_ts(cust.get("updated_at"))

        order_stats = customer_order_stats.get(ext_id, {"count": 0, "spent": 0})
        total_orders = order_stats["count"]
        total_spent = order_stats["spent"]
        avg_order_value = total_spent / total_orders if total_orders > 0 else 0
        clv = total_spent * 1.5  # Simple CLV heuristic

        meta = cust.get("metadata", {}) or {}

        customer_rows.append({
            "id": cid,
            "project_id": pid,
            "external_id": ext_id,
            "email": email or None,
            "phone": phone or None,
            "name": name or None,
            "first_seen": signup,
            "last_seen": max(signup, updated),
            "total_orders": total_orders,
            "total_spent": Decimal(str(round(total_spent, 2))),
            "avg_order_value": Decimal(str(round(avg_order_value, 2))),
            "clv": Decimal(str(round(clv, 2))),
            "email_subscribed": bool(email),
            "sms_subscribed": bool(phone),
            "push_subscribed": False,
            "whatsapp_subscribed": bool(phone),
            "custom_attributes": {
                "_source": SOURCE_TAG,
                "company": meta.get("shop_name", ""),
                "dealer_id": meta.get("dealer_id", ""),
                "country": meta.get("country", ""),
                "postal_code": meta.get("postal_code", ""),
            },
            "metrics": {
                "total_orders": total_orders,
                "total_spent": round(total_spent, 2),
                "source": "gowelmart",
            },
            "created_at": signup,
            "updated_at": NOW,
        })

        if (i + 1) % 1000 == 0:
            print(f"  Processed {i + 1}/{len(raw_customers)} customers")

    # ---- Build events ----
    event_rows: list[dict] = []

    # Events from orders
    print(f"\n=== Generating events from {len(raw_orders)} orders ===")
    for order in raw_orders:
        ext_cid = order.get("customer_id", "")
        cid = ext_to_uuid.get(ext_cid)
        if not cid:
            continue

        ts = parse_ts(order.get("created_at"))
        line_items = order.get("line_items", [])
        shipping = order.get("shipping_address", {}) or {}

        event_id = uuid.uuid4()
        event_rows.append({
            "id": event_id,
            "project_id": pid,
            "customer_id": cid,
            "event_name": "order_completed",
            "properties": {
                "order_id": order.get("order_id"),
                "display_id": order.get("display_id"),
                "order_total": float(order.get("order_total", 0) or 0),
                "item_total": float(order.get("item_total", 0) or 0),
                "shipping_total": float(order.get("shipping_total", 0) or 0),
                "discount_total": float(order.get("discount_total", 0) or 0),
                "tax_total": float(order.get("tax_total", 0) or 0),
                "currency": order.get("currency_code", "inr"),
                "status": order.get("status"),
                "fulfillment_status": order.get("fulfillment_status"),
                "line_items": [
                    {
                        "product_id": li.get("product_id"),
                        "product_name": li.get("product_name"),
                        "variant_sku": li.get("variant_sku"),
                        "unit_price": float(li.get("unit_price", 0) or 0),
                        "total": float(li.get("total", 0) or 0),
                    }
                    for li in line_items
                ],
                "city": shipping.get("city"),
                "province": shipping.get("province"),
                "postal_code": shipping.get("postal_code"),
                "dealer": order.get("metadata", {}).get("dealer", {}),
            },
            "platform": "web",
            "source": "gowelmart_api",
            "session_id": None,
            "idempotency_key": f"order_{order.get('order_id')}",
            "timestamp": ts,
            "received_at": NOW,
        })

    # Events from carts
    print(f"=== Generating events from {len(raw_abandoned)} abandoned carts ===")
    for cart in raw_abandoned:
        ext_cid = cart.get("customer_id", "")
        cid = ext_to_uuid.get(ext_cid)
        if not cid:
            continue

        ts = parse_ts(cart.get("created_at"))
        line_items = cart.get("line_items", [])

        cart_props = {
            "cart_id": cart.get("cart_id"),
            "total": float(cart.get("total", 0) or 0),
            "item_total": float(cart.get("item_total", 0) or 0),
            "currency": cart.get("currency_code", "inr"),
            "line_items": [
                {
                    "product_id": li.get("product_id"),
                    "product_name": li.get("product_name"),
                    "variant_sku": li.get("variant_sku"),
                    "quantity": li.get("quantity", 1),
                    "unit_price": float(li.get("unit_price", 0) or 0),
                    "total": float(li.get("total", 0) or 0),
                }
                for li in line_items
            ],
        }

        # add_to_cart event
        event_rows.append({
            "id": uuid.uuid4(),
            "project_id": pid,
            "customer_id": cid,
            "event_name": "add_to_cart",
            "properties": cart_props,
            "platform": "web",
            "source": "gowelmart_api",
            "session_id": None,
            "idempotency_key": f"cart_add_{cart.get('cart_id')}",
            "timestamp": ts,
            "received_at": NOW,
        })

        # cart_abandoned event (use updated_at as the abandonment time)
        abandon_ts = parse_ts(cart.get("updated_at")) or ts
        event_rows.append({
            "id": uuid.uuid4(),
            "project_id": pid,
            "customer_id": cid,
            "event_name": "cart_abandoned",
            "properties": cart_props,
            "platform": "web",
            "source": "gowelmart_api",
            "session_id": None,
            "idempotency_key": f"cart_abandon_{cart.get('cart_id')}",
            "timestamp": abandon_ts,
            "received_at": NOW,
        })

    print(f"=== Generating events from {len(raw_completed)} completed carts ===")
    for cart in raw_completed:
        ext_cid = cart.get("customer_id", "")
        cid = ext_to_uuid.get(ext_cid)
        if not cid:
            continue

        ts = parse_ts(cart.get("created_at"))
        line_items = cart.get("line_items", [])

        cart_props = {
            "cart_id": cart.get("cart_id"),
            "total": float(cart.get("total", 0) or 0),
            "item_total": float(cart.get("item_total", 0) or 0),
            "currency": cart.get("currency_code", "inr"),
            "line_items": [
                {
                    "product_id": li.get("product_id"),
                    "product_name": li.get("product_name"),
                    "variant_sku": li.get("variant_sku"),
                    "quantity": li.get("quantity", 1),
                    "unit_price": float(li.get("unit_price", 0) or 0),
                    "total": float(li.get("total", 0) or 0),
                }
                for li in line_items
            ],
        }

        # add_to_cart event
        event_rows.append({
            "id": uuid.uuid4(),
            "project_id": pid,
            "customer_id": cid,
            "event_name": "add_to_cart",
            "properties": cart_props,
            "platform": "web",
            "source": "gowelmart_api",
            "session_id": None,
            "idempotency_key": f"cart_add_{cart.get('cart_id')}",
            "timestamp": ts,
            "received_at": NOW,
        })

        # checkout_completed event
        completed_ts = parse_ts(cart.get("completed_at")) or ts
        event_rows.append({
            "id": uuid.uuid4(),
            "project_id": pid,
            "customer_id": cid,
            "event_name": "checkout_completed",
            "properties": cart_props,
            "platform": "web",
            "source": "gowelmart_api",
            "session_id": None,
            "idempotency_key": f"cart_checkout_{cart.get('cart_id')}",
            "timestamp": completed_ts,
            "received_at": NOW,
        })

    print(f"\n=== Totals: {len(customer_rows)} customers, {len(event_rows)} events ===")

    # ---- Insert into DB ----
    with Session(engine) as session:
        print(f"\nUpserting {len(customer_rows)} customers...")
        for i in range(0, len(customer_rows), BATCH_SIZE):
            batch = customer_rows[i:i + BATCH_SIZE]
            stmt = pg_insert(customers_table).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["project_id", "external_id"],
                set_={
                    "email": stmt.excluded.email,
                    "phone": stmt.excluded.phone,
                    "name": stmt.excluded.name,
                    "total_orders": stmt.excluded.total_orders,
                    "total_spent": stmt.excluded.total_spent,
                    "custom_attributes": stmt.excluded.custom_attributes,
                    "metrics": stmt.excluded.metrics,
                    "updated_at": stmt.excluded.updated_at,
                },
            )
            session.execute(stmt)
            session.flush()
            done = min(i + BATCH_SIZE, len(customer_rows))
            if done % 2000 == 0 or done == len(customer_rows):
                print(f"  Customers: {done}/{len(customer_rows)}")

        print(f"Inserting {len(event_rows)} events...")
        for i in range(0, len(event_rows), BATCH_SIZE):
            batch = event_rows[i:i + BATCH_SIZE]
            session.execute(events_table.insert(), batch)
            session.flush()
            done = min(i + BATCH_SIZE, len(event_rows))
            if done % 5000 == 0 or done == len(event_rows):
                print(f"  Events: {done}/{len(event_rows)}")

        session.commit()

    # ---- Summary ----
    order_events = sum(1 for e in event_rows if e["event_name"] == "order_completed")
    cart_add_events = sum(1 for e in event_rows if e["event_name"] == "add_to_cart")
    abandoned_events = sum(1 for e in event_rows if e["event_name"] == "cart_abandoned")
    checkout_events = sum(1 for e in event_rows if e["event_name"] == "checkout_completed")
    customers_with_orders = sum(1 for c in customer_rows if c["total_orders"] > 0)

    print(f"\n{'='*60}")
    print(f"  IMPORT COMPLETE")
    print(f"{'='*60}")
    print(f"  Project ID:          {project_id}")
    print(f"  Customers:           {len(customer_rows):,}")
    print(f"    With orders:       {customers_with_orders:,}")
    print(f"  Events:              {len(event_rows):,}")
    print(f"    order_completed:   {order_events:,}")
    print(f"    add_to_cart:       {cart_add_events:,}")
    print(f"    cart_abandoned:    {abandoned_events:,}")
    print(f"    checkout_completed: {checkout_events:,}")
    print(f"{'='*60}")
    print(f"\nTo clean up: python import_gowelmart.py --project-id {project_id} --clean")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import GoWelmart ecommerce data into Storees")
    parser.add_argument("--project-id", required=True, help="UUID of the Storees project")
    parser.add_argument("--clean", action="store_true", help="Remove previously imported data before importing")
    args = parser.parse_args()

    try:
        uuid.UUID(args.project_id)
    except ValueError:
        print(f"ERROR: Invalid UUID: {args.project_id}")
        sys.exit(1)

    import_data(args.project_id, args.clean)
