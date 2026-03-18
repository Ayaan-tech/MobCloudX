// src/fl/flRunner.ts
// FL round orchestration — coordinates the full FL lifecycle on-device.
// Raw telemetry NEVER leaves the device. Only weight tensors are transmitted.

import { QoEModel } from './qoeModel';
import { getGlobalWeights, submitWeights } from './weightSync';
import { fetchLocalQoEData, getSessionId } from './mongoReader';

export type FLStage =
  | 'idle'
  | 'connecting'
  | 'fetching_data'
  | 'loading_weights'
  | 'training'
  | 'submitting'
  | 'done'
  | 'error';

export interface FLStatus {
  stage: FLStage;
  round: number;
  loss: number;
  epoch: number;
  message: string;
}

export async function runFLRound(
  model: QoEModel,
  onStatus: (s: FLStatus) => void
): Promise<void> {
  const sessionId = await getSessionId(); // AsyncStorage — NOT device_id

  const upd = (
    stage: FLStage,
    msg: string,
    round = 0,
    loss = 0,
    epoch = 0
  ) => onStatus({ stage, round, loss, epoch, message: msg });

  try {
    // Step 1: Connect + get global model weights from bridge
    upd('connecting', 'Connecting to FL server...');
    const global = await getGlobalWeights();
    upd(
      'connecting',
      `Connected. Round ${global.round_num}`,
      global.round_num
    );

    // Step 2: Fetch training data from Atlas by session_id
    upd(
      'fetching_data',
      `Fetching data (session=...${sessionId.slice(-8)})`,
      global.round_num
    );
    const { features, labels } = await fetchLocalQoEData(sessionId);
    upd(
      'fetching_data',
      `Loaded ${features.length} samples`,
      global.round_num
    );

    // Step 3: Load global weights into local TF.js model
    upd('loading_weights', 'Loading global model...', global.round_num);
    await model.loadWeights(global.weights);

    // Step 4: Train locally — gradients stay on device, never transmitted
    const loss = await model.trainLocal(
      features,
      labels,
      global.config.epochs,
      global.config.batch_size,
      global.config.lr,
      (epoch, l) =>
        upd(
          'training',
          `Epoch ${epoch}/${global.config.epochs} | loss=${l.toFixed(4)}`,
          global.round_num,
          l,
          epoch
        )
    );

    // Step 5: Submit updated weights (weight delta) to bridge
    // SECURITY: Only weight tensors are transmitted. Raw telemetry stays on device.
    upd(
      'submitting',
      `Sending weights (${features.length} samples)...`,
      global.round_num,
      loss
    );

    // PRODUCTION: uncomment to add DP noise before submitWeights
    // function addGaussianNoise(weights: number[][], sigma = 0.01): number[][] {
    //   return weights.map(layer => layer.map(w => w + (Math.random()*2-1)*sigma));
    // }
    // const noisyWeights = addGaussianNoise(model.getWeights(), 0.01);

    const response = await submitWeights(
      sessionId,
      global.round_num,
      model.getWeights(),
      features.length,
      loss
    );

    const msg = response.aggregating
      ? 'Aggregating across all clients...'
      : `Waiting for ${2 - response.devices_ready} more client(s)`;
    upd(
      'done',
      `Round ${global.round_num} complete. ${msg}`,
      global.round_num + 1,
      loss
    );
  } catch (err: any) {
    upd('error', `FL error: ${err.message ?? 'Unknown'}`);
    throw err;
  }
}
