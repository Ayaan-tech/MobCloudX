"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_sqs_1 = require("@aws-sdk/client-sqs");
const utils_1 = require("./utils");
const client_ecs_1 = require("@aws-sdk/client-ecs");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const { Region, AccessKey, SecretAccessKey, ProductionBucketName, HONO_ENDPOINT } = process.env;
const QueueUrl = process.env.QueueUrl;
const TaskDefinition = process.env.TaskDefinition;
const ClusterArn = process.env.ClusterArn;
if (!Region || !AccessKey || !SecretAccessKey) {
    throw new Error('Missing required AWS environment variables: Region, AccessKey, and SecretAccessKey must be set.');
}
const sqsClient = new client_sqs_1.SQSClient({ region: Region, credentials: { accessKeyId: AccessKey, secretAccessKey: SecretAccessKey } });
const credentials = {
    accessKeyId: AccessKey,
    secretAccessKey: SecretAccessKey,
};
const client = new client_sqs_1.SQSClient({
    region: Region,
    credentials,
});
const ecsClient = new client_ecs_1.ECSClient({
    region: Region,
    credentials,
});
function init() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log("=".repeat(70));
        console.log("🎬 Video Transcoding SQS Poller");
        console.log("=".repeat(70));
        console.log("Queue URL:", QueueUrl);
        console.log("Cluster:", ClusterArn);
        console.log("Task Definition:", TaskDefinition);
        console.log("Hono Endpoint:", HONO_ENDPOINT);
        console.log("Production Bucket:", ProductionBucketName);
        console.log("=".repeat(70));
        const receiveCommand = new client_sqs_1.ReceiveMessageCommand({
            QueueUrl: QueueUrl,
            MaxNumberOfMessages: 1, // Process one video at a time to avoid resource exhaustion
            WaitTimeSeconds: 20, // Long polling
        });
        let messageCount = 0;
        while (true) {
            try {
                const { Messages } = yield sqsClient.send(receiveCommand);
                if (!Messages || Messages.length === 0) {
                    if (messageCount % 10 === 0) { // Log every 10 polls
                        console.log(`[${new Date().toISOString()}] No messages. Waiting...`);
                    }
                    messageCount++;
                    continue;
                }
                console.log(`\n[${new Date().toISOString()}] 📨 Received ${Messages.length} message(s)`);
                for (const message of Messages) {
                    const { Body, ReceiptHandle, MessageId } = message;
                    if (!Body || !ReceiptHandle) {
                        console.warn(`⚠️  Skipping message with missing Body or ReceiptHandle: ${MessageId}`);
                        continue;
                    }
                    try {
                        const event = JSON.parse(Body);
                        // Handle S3 Test Event
                        if (event && "Service" in event && "Event" in event) {
                            if (event.Event === "s3:TestEvent") {
                                console.log("ℹ️  Ignoring s3:TestEvent");
                                yield sqsClient.send(new client_sqs_1.DeleteMessageCommand({
                                    QueueUrl: QueueUrl,
                                    ReceiptHandle: ReceiptHandle,
                                }));
                                continue;
                            }
                        }
                        // Process S3 records
                        for (const record of event.Records) {
                            const { s3, eventName } = record;
                            const { bucket, object: { key } } = s3;
                            if (eventName.startsWith("ObjectCreated:")) {
                                console.log(`\n${"=".repeat(70)}`);
                                console.log(`🎥 Triggering Transcoding Job`);
                                console.log(`${"=".repeat(70)}`);
                                console.log(`Bucket: ${bucket.name}`);
                                console.log(`Key: ${key}`);
                                console.log(`Event: ${eventName}`);
                                console.log(`${"=".repeat(70)}`);
                                const runTask = new client_ecs_1.RunTaskCommand({
                                    taskDefinition: TaskDefinition,
                                    cluster: ClusterArn,
                                    launchType: "FARGATE",
                                    networkConfiguration: {
                                        awsvpcConfiguration: {
                                            securityGroups: utils_1.SecurityGroups,
                                            assignPublicIp: "ENABLED",
                                            subnets: utils_1.subnets
                                        }
                                    },
                                    overrides: {
                                        containerOverrides: [
                                            {
                                                name: "video-transcoding-container",
                                                environment: [
                                                    { name: "Bucket", value: bucket.name },
                                                    { name: "KEY", value: key },
                                                    { name: "ProductionBucketName", value: ProductionBucketName },
                                                    { name: "Region", value: Region },
                                                    { name: "AccessKey", value: AccessKey },
                                                    { name: "SecretAccessKey", value: SecretAccessKey },
                                                    { name: "HONO_ENDPOINT", value: HONO_ENDPOINT },
                                                    { name: "ECS_CLUSTER", value: ClusterArn }
                                                ]
                                            }
                                        ]
                                    }
                                });
                                const taskResult = yield ecsClient.send(runTask);
                                const taskArn = ((_b = (_a = taskResult.tasks) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.taskArn) || "unknown";
                                console.log(`✅ ECS Task Launched Successfully`);
                                console.log(`   Task ARN: ${taskArn}`);
                                console.log(`   Video: s3://${bucket.name}/${key}`);
                                console.log(`   Status: Check ECS console for progress`);
                            }
                            else {
                                console.log(`ℹ️  Ignoring event type: ${eventName}`);
                            }
                        }
                        // Delete message after successful processing
                        yield sqsClient.send(new client_sqs_1.DeleteMessageCommand({
                            QueueUrl: QueueUrl,
                            ReceiptHandle: ReceiptHandle,
                        }));
                        console.log(`✅ Message ${MessageId} deleted from queue\n`);
                    }
                    catch (innerError) {
                        console.error(" Error processing message:", innerError.message);
                        console.error("   Message will be retried after VisibilityTimeout");
                        // Message not deleted - will be retried
                    }
                }
            }
            catch (outerError) {
                console.error(" Error receiving messages from SQS:", outerError.message);
                // Wait before retrying to prevent rapid failure loops
                yield new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    });
}
// Graceful shutdown
process.on('SIGINT', () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('\n\n🛑 Shutting down poller gracefully...');
    process.exit(0);
}));
process.on('SIGTERM', () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('\n\n🛑 Shutting down poller gracefully...');
    process.exit(0);
}));
init().catch((error) => {
    console.error("💥 Critical error during initialization:", error);
    process.exit(1);
});
