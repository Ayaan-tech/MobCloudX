import type { MobCloudXConfig } from '../types';

function trimTrailingSlash(url: string | undefined): string {
  return (url ?? '').replace(/\/+$/, '');
}

export function getProducerApiBaseUrl(config: Pick<MobCloudXConfig, 'apiBaseUrl' | 'producerApiBaseUrl'>): string {
  return trimTrailingSlash(config.producerApiBaseUrl ?? config.apiBaseUrl);
}

export function getInferenceApiBaseUrl(config: Pick<MobCloudXConfig, 'apiBaseUrl' | 'inferenceApiBaseUrl'>): string {
  const baseUrl = trimTrailingSlash(config.inferenceApiBaseUrl ?? config.apiBaseUrl);
  if (!baseUrl) {
    return '';
  }

  return baseUrl.endsWith('/api/v1') ? baseUrl : `${baseUrl}/api/v1`;
}
