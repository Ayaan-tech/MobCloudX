import { useSDKStore } from '../../core/store';
import { getProducerApiBaseUrl } from '../../core/api-config';

interface KafkaPayload {
  topic: string;
  messages: Array<{
    key: string;
    value: string;
  }>;
}

export class KafkaPublisher {
  async publish(topic: string, payload: KafkaPayload): Promise<void> {
    const apiBaseUrl = getProducerApiBaseUrl(useSDKStore.getState().config);
    if (!apiBaseUrl) {
      throw new Error('KafkaPublisher requires SDK producerApiBaseUrl configuration.');
    }

    const response = await fetch(`${apiBaseUrl}/telemetry-service`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Kafka publish failed with status ${response.status}.`);
    }
  }
}
