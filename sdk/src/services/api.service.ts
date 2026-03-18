// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — API Service Layer
// Communicates with Producer API (Hono :3001)
// ─────────────────────────────────────────────────────────────

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { logger } from '../core/logger';
import type {
  TelemetryPayload,
  TelemetryPostResponse,
  AdaptationDecision,
  AdaptationFeedback,
  ApiResponse,
  QoEScore,
  FederatedUpdate,
  FederatedModel,
} from '../types';

class ApiService {
  private client: AxiosInstance | null = null;
  private baseUrl = '';

  /**
   * Configure the axios instance. Called once during SDK init.
   */
  configure(baseUrl: string): void {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`→ ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Request error:', error.message);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`← ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.warn(`← Error ${error.response?.status}: ${error.config?.url}`);
        return Promise.reject(error);
      }
    );
  }

  private getClient(): AxiosInstance {
    if (!this.client) {
      throw new Error('ApiService not configured. Call configure() first.');
    }
    return this.client;
  }

  // ── Telemetry ────────────────────────────────────────────

  /**
   * POST /telemetry-service
   * Sends telemetry payload to Kafka via Producer API
   */
  async sendTelemetry(payload: TelemetryPayload): Promise<ApiResponse<TelemetryPostResponse>> {
    try {
      const res = await this.getClient().post<TelemetryPostResponse>(
        '/telemetry-service',
        payload
      );
      return { ok: true, data: res.data };
    } catch (error: any) {
      logger.error('Failed to send telemetry:', error.message);
      return { ok: false, error: error.message };
    }
  }

  // ── QoE ──────────────────────────────────────────────────

  /**
   * POST /qoe-score
   * Push QoE score (used when local calculation is done)
   */
  async sendQoEScore(payload: { sessionId: string; qoe: number; ts?: number; details?: Record<string, unknown> }): Promise<ApiResponse> {
    try {
      const res = await this.getClient().post('/qoe-score', {
        ...payload,
        ts: payload.ts ?? Date.now(),
      });
      return { ok: true, data: res.data };
    } catch (error: any) {
      logger.error('Failed to send QoE score:', error.message);
      return { ok: false, error: error.message };
    }
  }

  // ── Adaptation ───────────────────────────────────────────

  /**
   * GET /adaptation/decision/:sessionId
   * Poll for adaptation decisions from the backend agent
   */
  async getAdaptationDecision(sessionId: string): Promise<ApiResponse<AdaptationDecision>> {
    try {
      const res = await this.getClient().get<AdaptationDecision>(
        `/adaptation/decision/${sessionId}`
      );
      return { ok: true, data: res.data };
    } catch (error: any) {
      // 404 means no decision yet — not an error
      if (error.response?.status === 404) {
        return { ok: true, data: undefined };
      }
      logger.warn('Failed to poll adaptation:', error.message);
      return { ok: false, error: error.message };
    }
  }

  /**
   * POST /adaptation/feedback
   * Send feedback about how an adaptation decision affected QoE
   */
  async sendAdaptationFeedback(feedback: AdaptationFeedback): Promise<ApiResponse> {
    try {
      const res = await this.getClient().post('/adaptation/feedback', feedback);
      return { ok: true, data: res.data };
    } catch (error: any) {
      logger.error('Failed to send adaptation feedback:', error.message);
      return { ok: false, error: error.message };
    }
  }

  // ── Context (Objective 3 — future) ──────────────────────

  /**
   * POST /context-event
   * Send device/network/battery context for context-aware adaptation
   */
  async sendContextEvent(payload: Record<string, unknown>): Promise<ApiResponse> {
    try {
      const res = await this.getClient().post('/context-event', payload);
      return { ok: true, data: res.data };
    } catch (error: any) {
      // Endpoint may not exist yet — degrade gracefully
      logger.debug('Context endpoint not available:', error.message);
      return { ok: false, error: error.message };
    }
  }

  // ── Health ───────────────────────────────────────────────

  /**
   * GET /health
   * Check if Producer API is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.getClient().get('/health');
      return res.data?.ok === true;
    } catch {
      return false;
    }
  }

  // ── Federated Learning ───────────────────────────────────

  async submitFederatedUpdate(payload: FederatedUpdate): Promise<ApiResponse> {
    try {
      const res = await this.getClient().post('/federated/update', payload);
      return { ok: true, data: res.data };
    } catch (error: any) {
      logger.warn('Failed to submit federated update:', error.message);
      return { ok: false, error: error.message };
    }
  }

  async getFederatedModel(): Promise<ApiResponse<FederatedModel>> {
    try {
      const res = await this.getClient().get<FederatedModel>('/federated/model');
      return { ok: true, data: res.data };
    } catch (error: any) {
      logger.warn('Failed to fetch federated model:', error.message);
      return { ok: false, error: error.message };
    }
  }
}

/** Singleton API service */
export const apiService = new ApiService();
