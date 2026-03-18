# Requirements Document

## Introduction

MobCloudX is an AI-powered cloud solution for native mobile applications at scale, providing automated video transcoding with real-time quality monitoring and observability. The system processes video files uploaded to S3, transcodes them into multiple resolutions using AWS ECS Fargate tasks, collects telemetry data through Kafka, calculates Quality of Experience (QoE) scores, and provides comprehensive monitoring through Prometheus and Grafana.

## Glossary

- **Producer Service**: HTTP API service that receives telemetry events, transcode events, and QoE scores and publishes them to Kafka topics
- **Consumer Service**: Kafka consumer service that processes messages from topics, stores data in MongoDB, and calculates QoE scores
- **Video Transcoding Service**: AWS ECS-based service that polls SQS for S3 upload events and spawns Fargate tasks to transcode videos
- **Telemetry Event**: Real-time metrics about video transcoding progress including CPU usage, memory consumption, and processing status
- **Transcode Event**: Status updates about video transcoding jobs (STARTED, RUNNING, COMPLETED, FAILED)
- **QoE Score**: Quality of Experience metric (0-100) calculated from telemetry data using weighted factors
- **Session**: A unique video transcoding job identified by sessionId
- **Kafka Cluster**: Message broker system handling three topics: telemetry.raw, transcode.events, and qoe.scores
- **MongoDB Database**: NoSQL database storing telemetry events, transcode events, and QoE scores in separate collections
- **Grafana Alloy**: Telemetry pipeline that consumes Kafka messages and converts them to Prometheus metrics
- **S3 Bucket**: AWS storage for input videos and transcoded output files
- **SQS Queue**: AWS Simple Queue Service that receives S3 event notifications
- **ECS Fargate Task**: Serverless container execution for video transcoding workloads

## Requirements

### Requirement 1

**User Story:** As a mobile application developer, I want to upload videos to S3 and have them automatically transcoded into multiple resolutions, so that my app can deliver adaptive streaming content to users

#### Acceptance Criteria

1. WHEN a video file is uploaded to the S3 input bucket, THE Video Transcoding Service SHALL receive an S3 event notification through SQS
2. WHEN the Video Transcoding Service receives an S3 event notification, THE Video Transcoding Service SHALL spawn an ECS Fargate task with the video key and bucket information
3. WHEN an ECS Fargate task starts, THE Video Transcoding Service SHALL transcode the input video into multiple resolution outputs (360p, 480p, 720p, 1080p)
4. WHEN transcoding completes successfully, THE Video Transcoding Service SHALL upload all output files to the production S3 bucket
5. WHERE the S3 event is a test event, THE Video Transcoding Service SHALL ignore the event and delete the SQS message

### Requirement 2

**User Story:** As a platform operator, I want real-time telemetry data collected during video transcoding, so that I can monitor system performance and resource utilization

#### Acceptance Criteria

1. WHILE a video is being transcoded, THE ECS Fargate Task SHALL emit telemetry events every 5 seconds containing CPU usage, memory consumption, and progress percentage
2. WHEN a telemetry event is generated, THE ECS Fargate Task SHALL send the event to the Producer Service HTTP endpoint
3. WHEN the Producer Service receives a telemetry event, THE Producer Service SHALL validate the event schema and publish it to the telemetry.raw Kafka topic
4. WHEN a telemetry event is published to Kafka, THE Consumer Service SHALL consume the event and store it in the MongoDB telemetry collection
5. WHEN the Consumer Service stores telemetry data, THE Consumer Service SHALL associate the telemetry with the session using the sessionId field

### Requirement 3

**User Story:** As a platform operator, I want to track the lifecycle of video transcoding jobs, so that I can identify failures and measure processing times

#### Acceptance Criteria

1. WHEN a transcoding job starts, THE ECS Fargate Task SHALL publish a transcode event with status STARTED to the Producer Service
2. WHEN a transcoding job completes successfully, THE ECS Fargate Task SHALL publish a transcode event with status COMPLETED including duration_ms and output file paths
3. IF a transcoding job fails, THEN THE ECS Fargate Task SHALL publish a transcode event with status FAILED including error details
4. WHEN the Producer Service receives a transcode event, THE Producer Service SHALL validate the event schema and publish it to the transcode.events Kafka topic
5. WHEN the Consumer Service receives a COMPLETED transcode event, THE Consumer Service SHALL store the event in MongoDB and trigger QoE calculation after 5 seconds

### Requirement 4

**User Story:** As a platform operator, I want automatic Quality of Experience (QoE) scores calculated for each transcoding session, so that I can measure and optimize video processing quality

#### Acceptance Criteria

1. WHEN a transcoding session completes, THE Consumer Service SHALL calculate a QoE score based on collected telemetry and transcode event data
2. WHEN calculating QoE, THE Consumer Service SHALL apply weighted scoring factors: transcoding speed (25%), CPU efficiency (25%), output quality (25%), stability (15%), and memory efficiency (15%)
3. WHEN a QoE score is calculated, THE Consumer Service SHALL store the score in the MongoDB qoe collection with sessionId, score value, timestamp, and detailed breakdown
4. WHEN a QoE score is stored, THE Consumer Service SHALL publish the score to the qoe.scores Kafka topic
5. WHERE telemetry data or transcode information is missing, THE Consumer Service SHALL log a warning and skip QoE calculation for that session

### Requirement 5

**User Story:** As a platform operator, I want comprehensive observability through Prometheus and Grafana, so that I can visualize metrics and create alerts for system health

#### Acceptance Criteria

1. WHEN telemetry events are published to Kafka, THE Grafana Alloy service SHALL consume messages from the telemetry.raw topic
2. WHEN Alloy receives telemetry events, THE Grafana Alloy service SHALL convert JSON payloads to Prometheus metrics with appropriate labels (sessionId, metric_type, resolution)
3. WHEN QoE scores are published to Kafka, THE Grafana Alloy service SHALL consume messages from the qoe.scores topic and create transcoder_qoe_score metrics
4. WHEN Prometheus metrics are generated, THE Grafana Alloy service SHALL push metrics to Prometheus using the remote write API
5. THE Grafana service SHALL provide dashboards displaying transcoder resource usage, QoE scores, and session-level metrics with 15-second scrape intervals

### Requirement 6

**User Story:** As a platform operator, I want data persistence in MongoDB, so that I can perform historical analysis and auditing of transcoding operations

#### Acceptance Criteria

1. THE Consumer Service SHALL maintain three MongoDB collections: telemetry, transcode_events, and qoe_scores
2. WHEN storing documents in MongoDB, THE Consumer Service SHALL include timestamps for all records
3. WHEN the Consumer Service starts, THE Consumer Service SHALL establish a connection to MongoDB before subscribing to Kafka topics
4. THE MongoDB Database SHALL store telemetry events with fields: eventType, sessionId, ts, metrics, and meta
5. THE MongoDB Database SHALL store transcode events with fields: videoKey, status, duration_ms, ts, outputs, and meta

### Requirement 7

**User Story:** As a system administrator, I want proper error handling and graceful shutdown, so that the system remains stable and data is not lost during failures

#### Acceptance Criteria

1. IF the Producer Service fails to publish to Kafka, THEN THE Producer Service SHALL return an HTTP 500 error with error details
2. IF the Consumer Service fails to process a Kafka message, THEN THE Consumer Service SHALL log the error and continue processing subsequent messages
3. WHEN the Video Transcoding Service receives SIGINT or SIGTERM signals, THE Video Transcoding Service SHALL complete current message processing and shut down gracefully
4. IF an ECS Fargate task encounters an error during transcoding, THEN THE ECS Fargate Task SHALL publish a FAILED transcode event before exiting
5. WHERE SQS message processing fails, THE Video Transcoding Service SHALL not delete the message from the queue to allow retry after VisibilityTimeout

### Requirement 8

**User Story:** As a developer, I want schema validation for all API endpoints, so that invalid data is rejected before processing

#### Acceptance Criteria

1. WHEN the Producer Service receives a request to /telemetry-service, THE Producer Service SHALL validate the request body against TelemetrySchema using Zod
2. WHEN the Producer Service receives a request to /transcode-event, THE Producer Service SHALL validate the request body against TrancodeEventSchema using Zod
3. WHEN the Producer Service receives a request to /qoe-score, THE Producer Service SHALL validate the request body against QoeSchema using Zod
4. IF validation fails, THEN THE Producer Service SHALL return an HTTP 400 error with validation error details
5. WHERE transcode event status is COMPLETED or FAILED, THE Producer Service SHALL verify that duration_ms is a number and outputs is a non-empty array
