export type ServiceStatus = 'ok' | 'degraded' | 'unavailable';

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}