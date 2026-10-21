export type FulfillmentStage =
  | 'NEW'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'COMPLETED'
  | 'REQUIRES_REVIEW';
export interface Membership {
  tenantId: string;
  role: 'OWNER' | 'STAFF';
  canManageAvailability: boolean;
  tenant: { name: string; isActive: boolean };
}
export interface DashboardOrder {
  id: string;
  orderNumber: string;
  tenantName: string;
  status: string;
  fulfillmentStatus: FulfillmentStage | null;
  fulfillmentVersion: number;
  totalAmount: number;
  subtotal: number;
  placedAt: string;
  confirmedAt: string | null;
  pickupSlot: { startsAt: string; endsAt: string };
  payment: { status: string; provider: string; paidAt: string | null } | null;
  customer: { displayName: string | null };
  items: {
    nameSnapshot: string;
    quantity: number;
    unitPrice: number;
    lineSubtotal: number;
  }[];
  fulfillmentHistory?: {
    fromStatus: string;
    toStatus: string;
    actorUserId: string;
    createdAt: string;
    reason: string | null;
  }[];
  notifications?: { kind: string; state: string; createdAt: string }[];
}
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Overview {
  paidToday: number;
  awaitingAcceptance: number;
  accepted: number;
  preparing: number;
  ready: number;
  requiresReview: number;
  completedToday: number;
  paidGross?: number;
  providers: string[];
  recent: DashboardOrder[];
  asOf: string;
  timezone: string;
}
export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}
export interface CatalogItem {
  id: string;
  name: string;
  categoryId: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  sortOrder: number;
  updatedAt: string;
}
export interface MenuResult extends PageResult<CatalogItem> {
  categories: Category[];
}
export interface OperatingHour {
  id: string;
  dayOfWeek: number;
  opensAt: number;
  closesAt: number;
  isClosed: boolean;
  updatedAt: string;
}
export interface ManagedSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  isAvailable: boolean;
  confirmed: number;
  held: number;
  remaining: number;
  updatedAt: string;
}
export interface PickupResult extends PageResult<ManagedSlot> {
  hours: OperatingHour[];
  timezone: string;
}
export interface TenantSettings {
  name: string;
  description: string | null;
  logoUrl: string | null;
  updatedAt: string;
  timezone: string;
}
