from __future__ import annotations

import os
from concurrent.futures import TimeoutError as FuturesTimeoutError
from typing import Any

from confluent_kafka.admin import AdminClient, NewTopic
from confluent_kafka.cimpl import KafkaException

WEBRTC_TOPIC_CONFIGS: dict[str, dict[str, Any]] = {
    "webrtc-telemetry": {
        "num_partitions": 6,
        "replication_factor": 1,
        "config": {
            "retention.ms": "604800000",
            "compression.type": "lz4",
        },
    },
    "webrtc-qoe-scores": {
        "num_partitions": 3,
        "replication_factor": 1,
        "config": {
            "retention.ms": "259200000",
        },
    },
    "webrtc-adaptations": {
        "num_partitions": 3,
        "replication_factor": 1,
        "config": {},
    },
}


def _admin_client() -> AdminClient:
    bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", os.getenv("KAFKA_BROKERS", "localhost:29092"))
    return AdminClient({"bootstrap.servers": bootstrap_servers})


def ensure_webrtc_topics() -> dict[str, str]:
    admin = _admin_client()
    metadata = admin.list_topics(timeout=10)
    existing_topics = set(metadata.topics.keys())

    topics_to_create = [
        NewTopic(
            topic=topic_name,
            num_partitions=topic_config["num_partitions"],
            replication_factor=topic_config["replication_factor"],
            config=topic_config["config"],
        )
        for topic_name, topic_config in WEBRTC_TOPIC_CONFIGS.items()
        if topic_name not in existing_topics
    ]

    if not topics_to_create:
      return {topic_name: "exists" for topic_name in WEBRTC_TOPIC_CONFIGS}

    futures = admin.create_topics(topics_to_create, operation_timeout=10, request_timeout=10)
    results: dict[str, str] = {topic_name: "exists" for topic_name in WEBRTC_TOPIC_CONFIGS}

    for topic_name, future in futures.items():
        try:
            future.result(timeout=10)
            results[topic_name] = "created"
        except FuturesTimeoutError:
            results[topic_name] = "timeout"
            raise TimeoutError(f"Timed out while creating Kafka topic '{topic_name}'.") from None
        except KafkaException as exc:
            error = exc.args[0] if exc.args else exc
            error_name = getattr(error, "name", lambda: "")()
            if error_name == "TOPIC_ALREADY_EXISTS":
                results[topic_name] = "exists"
                continue
            raise

    return results


def get_webrtc_topic_health() -> dict[str, bool]:
    admin = _admin_client()
    metadata = admin.list_topics(timeout=10)
    available_topics = set(metadata.topics.keys())
    return {topic_name: topic_name in available_topics for topic_name in WEBRTC_TOPIC_CONFIGS}
