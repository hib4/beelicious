export type HealthResponse = { status: 'ok'; service: 'beelicious-api' };
export type ReadinessResponse = {
  status: 'ready' | 'unavailable';
  service: 'beelicious-api';
};
export type {
  FulfillmentStage,
  Membership,
  DashboardOrder,
  PageResult,
  Overview,
  Category,
  CatalogItem,
  MenuResult,
  OperatingHour,
  ManagedSlot,
  PickupResult,
  TenantSettings,
} from './dashboard.js';
