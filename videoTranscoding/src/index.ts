
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { S3Event } from "aws-lambda";
import {SecurityGroups, subnets} from './utils'
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';
import dotenv from 'dotenv';
dotenv.config()

const { Region, AccessKey, SecretAccessKey, ProductionBucketName , HONO_ENDPOINT } = process.env;
const QueueUrl = process.env.QueueUrl 
const TaskDefinition = process.env.TaskDefinition 
const ClusterArn = process.env.ClusterArn

if (!Region || !AccessKey || !SecretAccessKey) {
    throw new Error(
        'Missing required AWS environment variables: Region, AccessKey, and SecretAccessKey must be set.'
    );
}
const sqsClient = new SQSClient({
    region: Region,
    credentials: { accessKeyId: AccessKey, secretAccessKey: SecretAccessKey }
});

const ecsClient = new ECSClient({
    region: Region!,
    credentials: { accessKeyId: AccessKey!, secretAccessKey: SecretAccessKey! },
});

async function init() {
    console.log("=".repeat(70));
    console.log("🎬 Video Transcoding SQS Poller");
    console.log("=".repeat(70));
    console.log("Queue URL:", QueueUrl);
    console.log("Cluster:", ClusterArn);
    console.log("Task Definition:", TaskDefinition);
    console.log("Hono Endpoint:", HONO_ENDPOINT);
    console.log("Production Bucket:", ProductionBucketName);
    console.log("=".repeat(70));
    
    const receiveCommand = new ReceiveMessageCommand({
        QueueUrl: QueueUrl!,
        MaxNumberOfMessages: 1, // Process one video at a time to avoid resource exhaustion
        WaitTimeSeconds: 20, // Long polling
    });

    let messageCount = 0;

    while (true) {
        try {
            const { Messages } = await sqsClient.send(receiveCommand);
            
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
                    const event = JSON.parse(Body) as S3Event;
                    
                    // Handle S3 Test Event
                    if (event && "Service" in event && "Event" in event) {
                        if (event.Event === "s3:TestEvent") {
                            console.log("ℹ️  Ignoring s3:TestEvent");
                            await sqsClient.send(new DeleteMessageCommand({
                                QueueUrl: QueueUrl!,
                                ReceiptHandle: ReceiptHandle!,
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

                            const runTask = new RunTaskCommand({
                                taskDefinition: TaskDefinition!,
                                cluster: ClusterArn!,
                                launchType: "FARGATE",
                                networkConfiguration: {
                                    awsvpcConfiguration: {
                                        securityGroups: SecurityGroups!,
                                                assignPublicIp: "ENABLED",
                                                subnets: subnets!
                                    }
                                },
                                
                                overrides: {
                                    containerOverrides: [
                                        {
                                            name: "video-transcoding-container",
                                            environment: [
                                                { name: "Bucket", value: bucket.name },
                                                { name: "KEY", value: key },
                                                { name: "ProductionBucketName", value: ProductionBucketName! },
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
                            
                            const taskResult = await ecsClient.send(runTask);
                            const taskArn = taskResult.tasks?.[0]?.taskArn || "unknown";
                            
                            console.log(`✅ ECS Task Launched Successfully`);
                            console.log(`   Task ARN: ${taskArn}`);
                            console.log(`   Video: s3://${bucket.name}/${key}`);
                            console.log(`   Status: Check ECS console for progress`);
                        } else {
                            console.log(`ℹ️  Ignoring event type: ${eventName}`);
                        }
                    }

                    // Delete message after successful processing
                    await sqsClient.send(new DeleteMessageCommand({
                        QueueUrl: QueueUrl!,
                        ReceiptHandle: ReceiptHandle!,
                    }));
                    console.log(`✅ Message ${MessageId} deleted from queue\n`);

                } catch (innerError: any) {
                    console.error(" Error processing message:", innerError.message);
                    console.error("   Message will be retried after VisibilityTimeout");
                    // Message not deleted - will be retried
                }
            }
        } catch (outerError: any) {
            console.error(" Error receiving messages from SQS:", outerError.message);
            // Wait before retrying to prevent rapid failure loops
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down poller gracefully...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Shutting down poller gracefully...');
    process.exit(0);
});

init().catch((error) => {
    console.error("💥 Critical error during initialization:", error);
    process.exit(1);
});