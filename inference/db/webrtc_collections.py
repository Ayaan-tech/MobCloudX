from __future__ import annotations

from datetime import timedelta

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING


async def _drop_conflicting_single_field_index(
    database: AsyncIOMotorDatabase,
    collection_name: str,
    field_name: str,
    keep_names: set[str],
) -> None:
    collection = database[collection_name]
    indexes = await collection.list_indexes().to_list(length=50)

    for index in indexes:
        index_name = str(index.get("name", ""))
        key = index.get("key", {})
        if index_name in keep_names or index_name == "_id_":
            continue

        key_items = list(key.items()) if hasattr(key, "items") else []
        if key_items == [(field_name, 1)]:
            await collection.drop_index(index_name)


async def ensure_webrtc_collections(database: AsyncIOMotorDatabase) -> None:
    telemetry_ttl_seconds = int(timedelta(days=30).total_seconds())
    existing_collections = await database.list_collection_names()

    if "webrtc_sessions" not in existing_collections:
        await database.create_collection(
            "webrtc_sessions",
            validator={
                "$jsonSchema": {
                    "bsonType": "object",
                    "required": ["session_id", "call_id", "participants", "started_at", "mode"],
                    "properties": {
                        "session_id": {"bsonType": "string"},
                        "call_id": {"bsonType": "string"},
                        "participants": {
                            "bsonType": "array",
                            "items": {"bsonType": "string"},
                        },
                        "started_at": {"bsonType": "date"},
                        "ended_at": {"bsonType": ["date", "null"]},
                        "mode": {"enum": ["webrtc"]},
                        "status": {"bsonType": ["string", "null"]},
                        "qoe_summary": {"bsonType": ["object", "null"]},
                    },
                }
            },
        )

    if "webrtc_telemetry" not in existing_collections:
        await database.create_collection(
            "webrtc_telemetry",
            timeseries={
                "timeField": "timestamp",
                "metaField": "session_id",
                "granularity": "seconds",
            },
            expireAfterSeconds=telemetry_ttl_seconds,
        )
    else:
        try:
            await database.command(
                {
                    "collMod": "webrtc_telemetry",
                    "expireAfterSeconds": telemetry_ttl_seconds,
                }
            )
        except Exception:
            pass

    if "webrtc_adaptations" not in existing_collections:
        await database.create_collection("webrtc_adaptations")

    sessions = database["webrtc_sessions"]
    await sessions.create_index([("session_id", ASCENDING)], unique=True, name="webrtc_sessions_session_id_uq")
    await sessions.create_index([("call_id", ASCENDING)], unique=True, name="webrtc_sessions_call_id_uq")
    await sessions.create_index(
        [("started_at", ASCENDING)],
        expireAfterSeconds=int(timedelta(days=90).total_seconds()),
        name="webrtc_sessions_started_at_ttl",
    )

    telemetry = database["webrtc_telemetry"]
    await telemetry.create_index(
        [("session_id", ASCENDING), ("participant_id", ASCENDING), ("timestamp", ASCENDING)],
        name="webrtc_telemetry_session_participant_timestamp_idx",
    )
    await telemetry.create_index([("session_id", ASCENDING)], name="webrtc_telemetry_session_idx")

    adaptations = database["webrtc_adaptations"]
    await adaptations.create_index([("session_id", ASCENDING)], name="webrtc_adaptations_session_idx")
    await adaptations.create_index([("participant_id", ASCENDING)], name="webrtc_adaptations_participant_idx")
    await _drop_conflicting_single_field_index(
        database,
        "webrtc_adaptations",
        "timestamp",
        keep_names={"webrtc_adaptations_timestamp_ttl"},
    )
    await adaptations.create_index(
        [("timestamp", ASCENDING)],
        expireAfterSeconds=int(timedelta(days=30).total_seconds()),
        name="webrtc_adaptations_timestamp_ttl",
    )
