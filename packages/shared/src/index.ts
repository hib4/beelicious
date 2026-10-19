export type HealthResponse = { status: 'ok'; service: 'beelicious-api' };
export type ReadinessResponse = {
  status: 'ready' | 'unavailable';
  service: 'beelicious-api';
};
