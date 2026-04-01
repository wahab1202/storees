"""
Synthetic data seeder for the Storees ML pipeline.

Generates 1000 customers with realistic event histories across 5 behavior profiles:
  - Churners (200): active early, stop engaging after ~60 days
  - Loyalists (200): consistent engagement throughout 120 days
  - Converters (200): browse → add_to_cart → order_completed pattern
  - Dormant (200): 1-2 events total
  - New (200): recent sign-ups, events only in last 30 days

Usage:
    python seed_synthetic_data.py --project-id <uuid>
    python seed_synthetic_data.py --project-id <uuid> --clean
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from dotenv import load_dotenv
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
    create_engine,
    delete,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Session

load_dotenv()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BATCH_SIZE = 500
TOTAL_CUSTOMERS = 5000
PROFILE_SIZE = 1000

NOW = datetime.now(timezone.utc)
DAY = timedelta(days=1)
HOUR = timedelta(hours=1)

EVENT_TYPES = [
    "session_started",
    "page_viewed",
    "product_viewed",
    "add_to_cart",
    "checkout_completed",
    "order_completed",
    "email_opened",
    "app_uninstalled",
]

FIRST_NAMES = [
    "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Sai", "Arnav",
    "Dhruv", "Kabir", "Ananya", "Saanvi", "Aanya", "Aadhya", "Isha", "Pari",
    "Diya", "Myra", "Sara", "Nisha", "Rahul", "Priya", "Amit", "Sneha",
    "Rohan", "Pooja", "Vikram", "Divya", "Kiran", "Neha", "Ravi", "Meera",
    "Suresh", "Kavita", "Manoj", "Swati", "Raj", "Anjali", "Deepak", "Lata",
]

LAST_NAMES = [
    "Sharma", "Patel", "Singh", "Kumar", "Gupta", "Reddy", "Iyer", "Nair",
    "Mehta", "Joshi", "Verma", "Rao", "Das", "Chopra", "Malhotra", "Bhat",
    "Pillai", "Menon", "Kulkarni", "Deshmukh", "Agarwal", "Banerjee",
    "Chatterjee", "Mukherjee", "Ghosh", "Sen", "Bose", "Dutta", "Roy", "Saha",
]

PAGES = [
    "/", "/collections", "/collections/summer-sale", "/collections/new-arrivals",
    "/products/cotton-tshirt", "/products/silk-saree", "/products/denim-jeans",
    "/products/kurta-set", "/products/running-shoes", "/products/leather-bag",
    "/cart", "/checkout", "/account", "/wishlist", "/blog", "/about",
]

PRODUCT_IDS = [f"prod_{i:04d}" for i in range(1, 51)]
PRODUCT_NAMES = [
    "Cotton T-Shirt", "Silk Saree", "Denim Jeans", "Kurta Set", "Running Shoes",
    "Leather Bag", "Linen Shirt", "Palazzo Pants", "Sneakers", "Backpack",
    "Polo T-Shirt", "Chiffon Dupatta", "Cargo Pants", "Nehru Jacket", "Sandals",
    "Clutch Purse", "Formal Shirt", "Anarkali Suit", "Joggers", "Tote Bag",
]

PLATFORMS = ["web", "ios", "android"]
SOURCES = ["sdk", "shopify_webhook", "api"]

SYNTHETIC_TAG = "synthetic_seed"

# ---------------------------------------------------------------------------
# Schema mirrors (matching Drizzle definitions exactly)
# ---------------------------------------------------------------------------

metadata = MetaData()

customers_table = Table(
    "customers",
    metadata,
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
    "events",
    metadata,
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def random_name():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def random_email(name: str, idx: int) -> str:
    clean = name.lower().replace(" ", ".")
    return f"{clean}.{idx}@synthetic.storees.dev"


def random_phone() -> str:
    return f"+91{random.randint(7000000000, 9999999999)}"


def random_timestamp(start: datetime, end: datetime) -> datetime:
    """Random timestamp between start and end."""
    delta = end - start
    secs = random.randint(0, max(int(delta.total_seconds()), 1))
    return start + timedelta(seconds=secs)


def make_product_props() -> dict:
    idx = random.randint(0, len(PRODUCT_NAMES) - 1)
    return {
        "product_id": PRODUCT_IDS[idx % len(PRODUCT_IDS)],
        "product_name": PRODUCT_NAMES[idx],
        "price": random.choice([499, 799, 999, 1499, 1999, 2499, 2999, 4999]),
    }


def make_event(
    project_id: uuid.UUID,
    customer_id: uuid.UUID,
    event_name: str,
    ts: datetime,
    props: dict | None = None,
    session_id: str | None = None,
) -> dict:
    event_id = uuid.uuid4()
    if props is None:
        props = {}
    # Add page for page_viewed
    if event_name == "page_viewed" and "url" not in props:
        props["url"] = random.choice(PAGES)
    return {
        "id": event_id,
        "project_id": project_id,
        "customer_id": customer_id,
        "event_name": event_name,
        "properties": props,
        "platform": random.choice(PLATFORMS),
        "source": random.choice(SOURCES),
        "session_id": session_id or str(uuid.uuid4()),
        "idempotency_key": str(event_id),
        "timestamp": ts,
        "received_at": ts + timedelta(seconds=random.randint(0, 5)),
    }


# ---------------------------------------------------------------------------
# Profile generators
# ---------------------------------------------------------------------------


def generate_churner_events(project_id: uuid.UUID, customer_id: uuid.UUID) -> list[dict]:
    """Active in first 60 days, almost nothing after."""
    events = []
    start = NOW - timedelta(days=120)
    active_end = start + timedelta(days=60)
    # 3-8 events per week for 8-9 weeks
    weekly_count = random.randint(3, 8)
    current = start
    while current < active_end:
        session_id = str(uuid.uuid4())
        ts = random_timestamp(current, min(current + timedelta(days=2), active_end))
        events.append(make_event(project_id, customer_id, "session_started", ts, session_id=session_id))
        for _ in range(random.randint(1, 3)):
            ts += timedelta(minutes=random.randint(1, 15))
            events.append(make_event(project_id, customer_id, "page_viewed", ts, session_id=session_id))
        if random.random() < 0.5:
            ts += timedelta(minutes=random.randint(1, 10))
            events.append(make_event(project_id, customer_id, "product_viewed", ts, make_product_props(), session_id=session_id))
        if random.random() < 0.15:
            ts += timedelta(minutes=random.randint(1, 5))
            events.append(make_event(project_id, customer_id, "add_to_cart", ts, make_product_props(), session_id=session_id))
        if random.random() < 0.3:
            ts += timedelta(minutes=random.randint(5, 30))
            events.append(make_event(project_id, customer_id, "email_opened", ts, session_id=session_id))
        current += timedelta(days=7) / weekly_count * random.uniform(0.5, 1.5)

    # Maybe 0-2 events after churn
    for _ in range(random.randint(0, 2)):
        ts = random_timestamp(active_end + timedelta(days=10), NOW)
        events.append(make_event(project_id, customer_id, random.choice(["session_started", "email_opened"]), ts))

    # Possibly app_uninstalled
    if random.random() < 0.4:
        ts = random_timestamp(active_end, active_end + timedelta(days=14))
        events.append(make_event(project_id, customer_id, "app_uninstalled", ts))

    return events


def generate_loyalist_events(project_id: uuid.UUID, customer_id: uuid.UUID) -> list[dict]:
    """Steady 2-5 events per week for 120 days with periodic purchases."""
    events = []
    start = NOW - timedelta(days=120)
    current = start
    order_count = 0
    while current < NOW:
        session_id = str(uuid.uuid4())
        ts = random_timestamp(current, min(current + timedelta(days=3), NOW))
        events.append(make_event(project_id, customer_id, "session_started", ts, session_id=session_id))
        # Browsing
        for _ in range(random.randint(1, 4)):
            ts += timedelta(minutes=random.randint(1, 12))
            events.append(make_event(project_id, customer_id, "page_viewed", ts, session_id=session_id))
        # Product views
        if random.random() < 0.6:
            ts += timedelta(minutes=random.randint(1, 8))
            product = make_product_props()
            events.append(make_event(project_id, customer_id, "product_viewed", ts, product, session_id=session_id))
            # Purchase funnel ~every 2-3 weeks
            if random.random() < 0.12:
                ts += timedelta(minutes=random.randint(2, 10))
                events.append(make_event(project_id, customer_id, "add_to_cart", ts, product, session_id=session_id))
                ts += timedelta(minutes=random.randint(3, 15))
                events.append(make_event(project_id, customer_id, "checkout_completed", ts, product, session_id=session_id))
                ts += timedelta(minutes=random.randint(1, 5))
                order_total = product["price"] * random.randint(1, 3)
                events.append(make_event(project_id, customer_id, "order_completed", ts, {
                    **product, "order_total": order_total,
                }, session_id=session_id))
                order_count += 1
        # Email engagement
        if random.random() < 0.4:
            email_ts = ts + timedelta(hours=random.randint(1, 48))
            if email_ts < NOW:
                events.append(make_event(project_id, customer_id, "email_opened", email_ts))

        gap_days = 7 / random.uniform(2, 5)
        current += timedelta(days=gap_days * random.uniform(0.7, 1.3))

    return events


def generate_converter_events(project_id: uuid.UUID, customer_id: uuid.UUID) -> list[dict]:
    """Browse phase → intent phase → purchase. Clear conversion funnel."""
    events = []
    start = NOW - timedelta(days=random.randint(60, 110))

    # Phase 1: browsing (2-4 weeks)
    browse_end = start + timedelta(days=random.randint(14, 28))
    current = start
    while current < browse_end:
        session_id = str(uuid.uuid4())
        ts = random_timestamp(current, min(current + timedelta(days=2), browse_end))
        events.append(make_event(project_id, customer_id, "session_started", ts, session_id=session_id))
        for _ in range(random.randint(2, 5)):
            ts += timedelta(minutes=random.randint(1, 10))
            events.append(make_event(project_id, customer_id, "page_viewed", ts, session_id=session_id))
        if random.random() < 0.4:
            ts += timedelta(minutes=random.randint(1, 8))
            events.append(make_event(project_id, customer_id, "product_viewed", ts, make_product_props(), session_id=session_id))
        current += timedelta(days=random.uniform(2, 5))

    # Phase 2: intent (add_to_cart, more product views)
    intent_end = browse_end + timedelta(days=random.randint(7, 14))
    current = browse_end
    target_product = make_product_props()
    while current < intent_end:
        session_id = str(uuid.uuid4())
        ts = random_timestamp(current, min(current + timedelta(days=2), intent_end))
        events.append(make_event(project_id, customer_id, "session_started", ts, session_id=session_id))
        ts += timedelta(minutes=random.randint(1, 8))
        events.append(make_event(project_id, customer_id, "product_viewed", ts, target_product, session_id=session_id))
        if random.random() < 0.5:
            ts += timedelta(minutes=random.randint(2, 10))
            events.append(make_event(project_id, customer_id, "add_to_cart", ts, target_product, session_id=session_id))
        current += timedelta(days=random.uniform(1, 4))

    # Phase 3: conversion
    conversion_ts = intent_end + timedelta(days=random.randint(0, 3))
    if conversion_ts < NOW:
        session_id = str(uuid.uuid4())
        events.append(make_event(project_id, customer_id, "session_started", conversion_ts, session_id=session_id))
        conversion_ts += timedelta(minutes=random.randint(2, 10))
        events.append(make_event(project_id, customer_id, "add_to_cart", conversion_ts, target_product, session_id=session_id))
        conversion_ts += timedelta(minutes=random.randint(5, 20))
        events.append(make_event(project_id, customer_id, "checkout_completed", conversion_ts, target_product, session_id=session_id))
        conversion_ts += timedelta(minutes=random.randint(1, 5))
        order_total = target_product["price"] * random.randint(1, 2)
        events.append(make_event(project_id, customer_id, "order_completed", conversion_ts, {
            **target_product, "order_total": order_total,
        }, session_id=session_id))

        # Some post-purchase activity
        for _ in range(random.randint(0, 3)):
            post_ts = conversion_ts + timedelta(days=random.randint(1, 14))
            if post_ts < NOW:
                events.append(make_event(project_id, customer_id, random.choice(["session_started", "page_viewed", "email_opened"]), post_ts))

    return events


def generate_dormant_events(project_id: uuid.UUID, customer_id: uuid.UUID) -> list[dict]:
    """1-2 events total. Very low activity."""
    events = []
    ts = random_timestamp(NOW - timedelta(days=120), NOW - timedelta(days=30))
    events.append(make_event(project_id, customer_id, "session_started", ts))
    if random.random() < 0.6:
        ts += timedelta(minutes=random.randint(1, 30))
        events.append(make_event(project_id, customer_id, random.choice(["page_viewed", "email_opened"]), ts))
    return events


def generate_new_events(project_id: uuid.UUID, customer_id: uuid.UUID) -> list[dict]:
    """Events only in last 30 days. Active new user."""
    events = []
    start = NOW - timedelta(days=random.randint(5, 30))
    current = start
    while current < NOW:
        session_id = str(uuid.uuid4())
        ts = random_timestamp(current, min(current + timedelta(days=1), NOW))
        events.append(make_event(project_id, customer_id, "session_started", ts, session_id=session_id))
        for _ in range(random.randint(1, 4)):
            ts += timedelta(minutes=random.randint(1, 10))
            events.append(make_event(project_id, customer_id, "page_viewed", ts, session_id=session_id))
        if random.random() < 0.5:
            ts += timedelta(minutes=random.randint(1, 8))
            events.append(make_event(project_id, customer_id, "product_viewed", ts, make_product_props(), session_id=session_id))
        if random.random() < 0.2:
            ts += timedelta(minutes=random.randint(2, 8))
            events.append(make_event(project_id, customer_id, "add_to_cart", ts, make_product_props(), session_id=session_id))
        if random.random() < 0.4:
            email_ts = ts + timedelta(hours=random.randint(1, 12))
            if email_ts < NOW:
                events.append(make_event(project_id, customer_id, "email_opened", email_ts))
        current += timedelta(days=random.uniform(1, 4))
    return events


PROFILE_GENERATORS = {
    "churner": generate_churner_events,
    "loyalist": generate_loyalist_events,
    "converter": generate_converter_events,
    "dormant": generate_dormant_events,
    "new": generate_new_events,
}


# ---------------------------------------------------------------------------
# Customer summary computation
# ---------------------------------------------------------------------------


def compute_customer_summary(events: list[dict], profile: str) -> dict:
    """Derive total_orders, total_spent, avg_order_value, clv from events."""
    order_events = [e for e in events if e["event_name"] == "order_completed"]
    total_orders = len(order_events)
    total_spent = sum(e["properties"].get("order_total", 0) for e in order_events)
    avg_order_value = (total_spent / total_orders) if total_orders > 0 else 0

    # Simple CLV heuristic: total_spent * multiplier based on profile
    clv_multipliers = {
        "churner": 1.0,
        "loyalist": 3.5,
        "converter": 1.8,
        "dormant": 0.5,
        "new": 2.0,
    }
    clv = total_spent * clv_multipliers.get(profile, 1.0)

    timestamps = [e["timestamp"] for e in events]
    first_seen = min(timestamps)
    last_seen = max(timestamps)

    return {
        "total_orders": total_orders,
        "total_spent": Decimal(str(round(total_spent, 2))),
        "avg_order_value": Decimal(str(round(avg_order_value, 2))),
        "clv": Decimal(str(round(clv, 2))),
        "first_seen": first_seen,
        "last_seen": last_seen,
    }


# ---------------------------------------------------------------------------
# Main seeder
# ---------------------------------------------------------------------------


def seed(project_id: str, clean: bool = False):
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set. Create a .env file or export it.")
        sys.exit(1)

    engine = create_engine(database_url, echo=False)
    pid = uuid.UUID(project_id)

    with Session(engine) as session:
        # --clean: remove previously seeded synthetic data
        if clean:
            print("[clean] Deleting existing synthetic customers and their events...")
            # Find synthetic customer IDs
            result = session.execute(
                customers_table.select().where(
                    customers_table.c.project_id == pid,
                    customers_table.c.custom_attributes["_seed_tag"].astext == SYNTHETIC_TAG,
                )
            )
            synthetic_ids = [row.id for row in result]
            if synthetic_ids:
                # Delete events first (FK)
                for i in range(0, len(synthetic_ids), BATCH_SIZE):
                    batch_ids = synthetic_ids[i : i + BATCH_SIZE]
                    session.execute(
                        delete(events_table).where(
                            events_table.c.project_id == pid,
                            events_table.c.customer_id.in_(batch_ids),
                        )
                    )
                # Delete customers
                session.execute(
                    delete(customers_table).where(
                        customers_table.c.project_id == pid,
                        customers_table.c.custom_attributes["_seed_tag"].astext == SYNTHETIC_TAG,
                    )
                )
                session.commit()
                print(f"[clean] Removed {len(synthetic_ids)} customers and their events.")
            else:
                print("[clean] No synthetic data found.")

        # Generate customers and events
        profiles = (
            ["churner"] * PROFILE_SIZE
            + ["loyalist"] * PROFILE_SIZE
            + ["converter"] * PROFILE_SIZE
            + ["dormant"] * PROFILE_SIZE
            + ["new"] * PROFILE_SIZE
        )
        random.shuffle(profiles)

        all_customer_rows: list[dict] = []
        all_event_rows: list[dict] = []
        total_events = 0

        print(f"Generating {TOTAL_CUSTOMERS} customers across 5 profiles...")

        for idx, profile in enumerate(profiles):
            cid = uuid.uuid4()
            name = random_name()
            email = random_email(name, idx)
            phone = random_phone()

            # Generate events for this customer
            generator = PROFILE_GENERATORS[profile]
            customer_events = generator(pid, cid)
            customer_events.sort(key=lambda e: e["timestamp"])

            if not customer_events:
                # Ensure at least one event
                ts = random_timestamp(NOW - timedelta(days=120), NOW)
                customer_events = [make_event(pid, cid, "session_started", ts)]

            summary = compute_customer_summary(customer_events, profile)

            customer_row = {
                "id": cid,
                "project_id": pid,
                "external_id": f"synth_{idx:04d}",
                "email": email,
                "phone": phone,
                "name": name,
                "first_seen": summary["first_seen"],
                "last_seen": summary["last_seen"],
                "total_orders": summary["total_orders"],
                "total_spent": summary["total_spent"],
                "avg_order_value": summary["avg_order_value"],
                "clv": summary["clv"],
                "email_subscribed": random.random() < 0.7,
                "sms_subscribed": random.random() < 0.3,
                "push_subscribed": random.random() < 0.4,
                "whatsapp_subscribed": random.random() < 0.2,
                "custom_attributes": {
                    "_seed_tag": SYNTHETIC_TAG,
                    "_profile": profile,
                },
                "metrics": {
                    "profile": profile,
                    "event_count": len(customer_events),
                },
                "created_at": summary["first_seen"],
                "updated_at": NOW,
            }
            all_customer_rows.append(customer_row)
            all_event_rows.extend(customer_events)
            total_events += len(customer_events)

            if (idx + 1) % 100 == 0:
                print(f"  Generated {idx + 1}/{TOTAL_CUSTOMERS} customers ({total_events} events so far)")

        # Batch insert customers
        print(f"\nInserting {len(all_customer_rows)} customers...")
        for i in range(0, len(all_customer_rows), BATCH_SIZE):
            batch = all_customer_rows[i : i + BATCH_SIZE]
            session.execute(customers_table.insert(), batch)
            session.flush()
            print(f"  Customers: {min(i + BATCH_SIZE, len(all_customer_rows))}/{len(all_customer_rows)}")

        # Batch insert events
        print(f"Inserting {len(all_event_rows)} events...")
        for i in range(0, len(all_event_rows), BATCH_SIZE):
            batch = all_event_rows[i : i + BATCH_SIZE]
            session.execute(events_table.insert(), batch)
            session.flush()
            if (i // BATCH_SIZE) % 10 == 0 or i + BATCH_SIZE >= len(all_event_rows):
                print(f"  Events: {min(i + BATCH_SIZE, len(all_event_rows))}/{len(all_event_rows)}")

        session.commit()

    # Summary
    profile_counts = {}
    for row in all_customer_rows:
        p = row["custom_attributes"]["_profile"]
        profile_counts[p] = profile_counts.get(p, 0) + 1

    print("\n--- Seed Complete ---")
    print(f"Project ID:  {project_id}")
    print(f"Customers:   {len(all_customer_rows)}")
    print(f"Events:      {len(all_event_rows)}")
    print("Profiles:")
    for p, c in sorted(profile_counts.items()):
        print(f"  {p:12s} {c}")
    print(f"\nTo clean up later: python seed_synthetic_data.py --project-id {project_id} --clean")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed synthetic customer/event data for ML pipeline testing.")
    parser.add_argument("--project-id", required=True, help="UUID of the project to seed data into.")
    parser.add_argument("--clean", action="store_true", help="Delete existing synthetic data before seeding.")
    args = parser.parse_args()

    # Validate UUID
    try:
        uuid.UUID(args.project_id)
    except ValueError:
        print(f"ERROR: Invalid UUID: {args.project_id}")
        sys.exit(1)

    seed(args.project_id, args.clean)
