// src/fl/qoeModel.ts
// TF.js QoENet — identical architecture to inference/models/qoe_net.py
// Architecture: 5 → 64 → 32 → 16 → 1 (sigmoid output)

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';

export class QoEModel {
  private model: tf.LayersModel | null = null;

  async build(): Promise<void> {
    this.model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [5], units: 64, activation: 'relu' }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ units: 16, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' }),
      ],
    });
    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
    });
  }

  async loadWeights(weightArrays: number[][]): Promise<void> {
    if (!this.model) await this.build();
    const tensors = weightArrays.map((w) => tf.tensor(w));
    this.model!.setWeights(tensors);
    tf.dispose(tensors);
  }

  getWeights(): number[][] {
    return this.model!.getWeights().map(
      (w) => Array.from(w.dataSync()) as number[]
    );
  }

  async trainLocal(
    features: number[][],
    labels: number[],
    epochs = 3,
    batchSize = 16,
    lr = 0.001,
    onProgress?: (epoch: number, loss: number) => void
  ): Promise<number> {
    if (!this.model) await this.build();
    (this.model!.optimizer as any).learningRate = lr;
    const xs = tf.tensor2d(features);
    const ys = tf.tensor2d(labels, [labels.length, 1]);
    let lastLoss = 0;
    await this.model!.fit(xs, ys, {
      epochs,
      batchSize,
      shuffle: true,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          lastLoss = logs?.loss ?? 0;
          onProgress?.(epoch + 1, lastLoss);
        },
      },
    });
    tf.dispose([xs, ys]);
    return lastLoss;
  }

  /**
   * Run inference on a single feature vector.
   * Returns QoE score ∈ [0, 1].
   */
  predict(features: number[]): number {
    if (!this.model) return 0.5;
    const input = tf.tensor2d([features]);
    const output = this.model.predict(input) as tf.Tensor;
    const score = output.dataSync()[0];
    tf.dispose([input, output]);
    return score;
  }
}
