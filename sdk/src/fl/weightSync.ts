// src/fl/weightSync.ts
// HTTP bridge communication layer for FL weight exchange.

import axios from 'axios';
import { BRIDGE_URL } from './config';

export interface GlobalWeights {
  round_num: number;
  weights: number[][];
  config: { lr: number; epochs: number; batch_size: number };
}

export const getGlobalWeights = async (): Promise<GlobalWeights> => {
  const res = await axios.get(`${BRIDGE_URL}/global-weights`, {
    timeout: 10000,
  });
  return res.data;
};

export const submitWeights = async (
  sessionId: string,
  roundNum: number,
  weights: number[][],
  numSamples: number,
  trainLoss: number
) => {
  const res = await axios.post(
    `${BRIDGE_URL}/submit-weights`,
    {
      session_id: sessionId, // session_id NOT device_id
      round_num: roundNum,
      weights,
      num_samples: numSamples,
      train_loss: trainLoss,
    },
    { timeout: 30000 }
  );
  return res.data;
};

export const checkBridge = async () => {
  const res = await axios.get(`${BRIDGE_URL}/health`, { timeout: 5000 });
  return res.data;
};
