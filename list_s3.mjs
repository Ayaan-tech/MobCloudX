import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config({ path: 'c:/Users/Ayaan/Desktop/Modules/mobCloudX/.env' });

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function run() {
  try {
    const buckets = [process.env.S3_BUCKET, process.env.S3_PRODUCTION_BUCKET];
    
    for (const b of buckets) {
      if (!b) continue;
      console.log(`\nBucket: ${b}`);
      try {
        const cmd = new ListObjectsV2Command({ Bucket: b });
        const res = await s3.send(cmd);
        if (res.Contents) {
          res.Contents.forEach(obj => console.log(`  - ${obj.Key} (${obj.Size} bytes)`));
        } else {
          console.log('  (empty)');
        }
      } catch (err) {
        console.error(`  Error listing ${b}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Fatal error:', err);
  }
}
run();
