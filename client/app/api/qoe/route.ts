// api/qoe-distribution/route.ts
import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { mongoToChartData, processQoEDistribution } from '@/lib/utils';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://amjadquasmi_db_user:lOkiYzI0dzIS1tgw@cluster0.6yieivd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'test';

export async function GET() {
  let client: MongoClient | null = null;
  
  try {
    client = await MongoClient.connect(MONGODB_URI);
    const db = client.db(DB_NAME);
    const qoeCollection = db.collection('qoe_scores');

    // Fetch all QoE scores with minimal projection
    const qoeData = await qoeCollection
      .find({})
      .project({ qoe: 1, details: 1, _id: 0 })
      .toArray();

    // Use the utility function to process data
    const chartData = mongoToChartData(qoeData);
    const distribution = processQoEDistribution(qoeData);
    
    // Calculate total valid records
    const totalValid = Object.values(distribution).reduce((sum, count) => sum + count, 0);

    return NextResponse.json({
      success: true,
      data: chartData,
      totalRecords: qoeData.length,
      validRecords: totalValid,
      invalidRecords: qoeData.length - totalValid,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error fetching QoE distribution:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch QoE distribution data',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}