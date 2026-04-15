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
  ZKProofRecord,
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
        const status = error.response?.status;
        const requestUrl = error.config?.url ?? '';
        const baseUrl = error.config?.baseURL ?? this.baseUrl;
        const code = error.code ?? 'UNKNOWN';
        if (status === 404 && requestUrl.includes('/adaptation/decision/')) {
          logger.debug(`← 404 ${requestUrl} (no adaptation decision yet)`);
          return Promise.reject(error);
        }
        logger.warn(`← Error ${status ?? 'NETWORK'} ${code}: ${baseUrl}${requestUrl}`);
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
      logger.error(`Failed to send telemetry: ${error.message} (${error.config?.baseURL ?? this.baseUrl}/telemetry-service)`);
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
      logger.warn(`Failed to poll adaptation: ${error.message} (${error.config?.baseURL ?? this.baseUrl}/adaptation/decision/${sessionId})`);
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

  // ── ZK Proofs ─────────────────────────────────────────────

  async generateZKProof(payload: {
    session_id: string;
    qoe_start?: number;
    qoe_minimum?: number;
    qoe_recovery?: number;
    stall_count?: number;
    session_duration?: number;
    sla_threshold?: number;
    max_stalls?: number;
    metadata?: Record<string, unknown>;
  }): Promise<ApiResponse<ZKProofRecord>> {
    try {
      const res = await this.getClient().post<{ success: boolean; proof: ZKProofRecord }>('/zk/generate-proof', payload);
      return { ok: true, data: res.data.proof };
    } catch (error: any) {
      logger.error('Failed to generate ZK proof:', error.message);
      return { ok: false, error: error.message };
    }
  }

  async verifyZKProof(sessionId: string): Promise<ApiResponse<{ proof: ZKProofRecord; verification: { verified: boolean } }>> {
    try {
      const res = await this.getClient().post<{ success: boolean; proof: ZKProofRecord; verification: { verified: boolean } }>(
        '/zk/verify-proof',
        { session_id: sessionId }
      );
      return { ok: true, data: { proof: res.data.proof, verification: res.data.verification } };
    } catch (error: any) {
      logger.error('Failed to verify ZK proof:', error.message);
      return { ok: false, error: error.message };
    }
  }

  async getZKProof(sessionId: string): Promise<ApiResponse<ZKProofRecord>> {
    try {
      const res = await this.getClient().get<{ success: boolean; proof: ZKProofRecord }>(`/zk/session/${sessionId}`);
      return { ok: true, data: res.data.proof };
    } catch (error: any) {
      logger.debug('ZK proof not available yet:', error.message);
      return { ok: false, error: error.message };
    }
  }
}

/** Singleton API service */
export const apiService = new ApiService();
