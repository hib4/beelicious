import {
  Prisma,
  type PrismaClient,
  type PickupReservation,
} from '@beelicious/database';
import { DomainError } from '../catalog/validation.js';
import type { CheckoutConfig } from './config.js';
export type Tx = Prisma.TransactionClient;
export function localParts(date: Date, timezone: string) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(p.find((v) => v.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}
/** Reject DST gaps/folds rather than guessing a different local pickup time. */
export function localInstant(
  year: number,
  month: number,
  day: number,
  minute: number,
  timezone: string,
): Date {
  const wall = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minute / 60),
    minute % 60,
  );
  const offsets = new Set<number>();
  for (const delta of [-36, 0, 36]) {
    const probe = new Date(wall + delta * 3600000);
    const p = localParts(probe, timezone);
    offsets.add(
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - probe.getTime(),
    );
  }
  const candidates = [...offsets]
    .map((o) => new Date(wall - o))
    .filter((d) => {
      const p = localParts(d, timezone);
      return (
        p.year === year &&
        p.month === month &&
        p.day === day &&
        p.hour * 60 + p.minute === minute
      );
    });
  if (candidates.length !== 1) throw new DomainError('invalid_input');
  return candidates[0]!;
}
export function pickupLabel(date: Date, timezone = 'Asia/Jakarta') {
  return (
    new Intl.DateTimeFormat('id-ID', {
      timeZone: timezone,
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date) + (timezone === 'Asia/Jakarta' ? ' WIB' : ` ${timezone}`)
  );
}
export class PickupSlotService {
  constructor(
    private db: PrismaClient | Tx,
    private config: CheckoutConfig,
    private now = () => new Date(),
    private transactionBound = false,
  ) {}
  getOperatingHours(tenantId: string) {
    return this.db.tenantOperatingHour.findMany({
      where: { tenantId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }
  async generateSlots(tenantId: string): Promise<void> {
    if (!this.transactionBound && '$transaction' in this.db) {
      await this.db.$transaction((tx) =>
        new PickupSlotService(tx, this.config, this.now, true).generateSlots(
          tenantId,
        ),
      );
      return;
    }
    const db = this.db as Tx;
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`schedule:${tenantId}`},0))`;

    const tenant = await db.tenant.findFirst({
      where: { id: tenantId, isActive: true },
    });
    if (!tenant) throw new DomainError('not_found');
    const hours = await this.getOperatingHours(tenantId);
    const now = this.now();
    const generated: Array<{
      tenantId: string;
      startsAt: Date;
      endsAt: Date;
      capacity: number;
    }> = [];
    for (let day = 0; day < this.config.bookingDays; day++) {
      const today = localParts(now, this.config.timezone);
      const localDay = new Date(
        Date.UTC(today.year, today.month - 1, today.day + day),
      );
      const h = hours.find((h) => h.dayOfWeek === localDay.getUTCDay());
      if (!h || h.isClosed) continue;
      for (
        let minute = h.opensAt;
        minute + this.config.slotMinutes <= h.closesAt;
        minute += this.config.slotMinutes
      ) {
        const startsAt = localInstant(
          localDay.getUTCFullYear(),
          localDay.getUTCMonth() + 1,
          localDay.getUTCDate(),
          minute,
          h.timezone,
        );
        const endMinute = minute + this.config.slotMinutes;
        const endsAt =
          endMinute === 1440
            ? new Date(
                localInstant(
                  localDay.getUTCFullYear(),
                  localDay.getUTCMonth() + 1,
                  localDay.getUTCDate(),
                  0,
                  h.timezone,
                ).getTime() + 86400000,
              )
            : localInstant(
                localDay.getUTCFullYear(),
                localDay.getUTCMonth() + 1,
                localDay.getUTCDate(),
                endMinute,
                h.timezone,
              );
        if (
          startsAt.getTime() <
          now.getTime() + this.config.leadMinutes * 60000
        )
          continue;
        generated.push({
          tenantId,
          startsAt,
          endsAt,
          capacity: this.config.capacity,
        });
      }
    }
    const existing = await db.pickupSlot.findMany({
      where: { tenantId, isAvailable: true, endsAt: { gt: now } },
      select: { startsAt: true, endsAt: true },
    });
    await db.pickupSlot.createMany({
      data: generated.filter(
        (candidate) =>
          !existing.some(
            (slot) =>
              candidate.startsAt < slot.endsAt &&
              candidate.endsAt > slot.startsAt,
          ),
      ),
      skipDuplicates: true,
    });
  }

  async validateSlot(tx: Tx, tenantId: string, slotId: string, lock = false) {
    if (lock)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`schedule:${tenantId}`},0))`;
    if (lock)
      await tx.$queryRaw`SELECT "id" FROM "PickupSlot" WHERE "id" = ${slotId}::uuid AND "tenantId" = ${tenantId}::uuid FOR UPDATE`;
    const s = await tx.pickupSlot.findFirst({
      where: {
        id: slotId,
        tenantId,
        isAvailable: true,
        tenant: { isActive: true },
      },
      include: {
        _count: {
          select: {
            reservations: { where: { status: { in: ['HELD', 'CONFIRMED'] } } },
          },
        },
      },
    });
    if (
      !s ||
      s.startsAt.getTime() <
        this.now().getTime() + this.config.leadMinutes * 60000 ||
      s._count.reservations >= s.capacity
    )
      throw new DomainError('conflict');
    const p = localParts(s.startsAt, this.config.timezone);
    const e = localParts(s.endsAt, this.config.timezone);
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    if (lock)
      await tx.$queryRaw`SELECT "id" FROM "TenantOperatingHour" WHERE "tenantId" = ${tenantId}::uuid AND "dayOfWeek" = ${weekday} FOR SHARE`;
    const h = await tx.tenantOperatingHour.findUnique({
      where: { tenantId_dayOfWeek: { tenantId, dayOfWeek: weekday } },
    });
    if (
      !h ||
      h.isClosed ||
      h.timezone !== this.config.timezone ||
      p.day !== e.day ||
      p.hour * 60 + p.minute < h.opensAt ||
      e.hour * 60 + e.minute > h.closesAt
    )
      throw new DomainError('conflict');
    return s;
  }
  async listAvailable(tenantId: string) {
    await this.generateSlots(tenantId);
    const slots = await this.db.pickupSlot.findMany({
      where: {
        tenantId,
        isAvailable: true,
        tenant: { isActive: true },
        startsAt: {
          gte: new Date(this.now().getTime() + this.config.leadMinutes * 60000),
          lt: new Date(
            this.now().getTime() + this.config.bookingDays * 86400000,
          ),
        },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    const valid = [];
    for (const s of slots) {
      try {
        valid.push(await this.validateSlot(this.db as Tx, tenantId, s.id));
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
      }
    }
    return valid;
  }
  async reserve(
    tx: Tx,
    orderId: string,
    tenantId: string,
    slotId: string,
    expiresAt: Date,
  ): Promise<PickupReservation> {
    await this.validateSlot(tx, tenantId, slotId, true);
    return tx.pickupReservation.create({
      data: { orderId, tenantId, pickupSlotId: slotId, expiresAt },
    });
  }
  async confirmReservation(
    tx: Tx,
    orderId: string,
  ): Promise<PickupReservation> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { payment: true, reservation: true, pickupSlot: true },
    });
    if (
      !order ||
      order.payment?.status !== 'SUCCEEDED' ||
      order.pickupSlot.startsAt <= this.now()
    )
      throw new DomainError('conflict');
    await tx.$queryRaw`SELECT "id" FROM "PickupSlot" WHERE "id" = ${order.pickupSlotId}::uuid FOR UPDATE`;
    if (order.reservation?.status === 'RELEASED')
      throw new DomainError('conflict');
    return tx.pickupReservation.update({
      where: { orderId },
      data: { status: 'CONFIRMED' },
    });
  }
  async releaseReservation(tx: Tx, orderId: string) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });
    if (
      !order?.payment ||
      !['FAILED', 'CANCELLED', 'EXPIRED'].includes(order.payment.status)
    )
      throw new DomainError('conflict');
    await tx.$queryRaw`SELECT "id" FROM "PickupSlot" WHERE "id" = ${order.pickupSlotId}::uuid FOR UPDATE`;
    return tx.pickupReservation.updateMany({
      where: { orderId, status: 'HELD' },
      data: { status: 'RELEASED' },
    });
  }
  async handleExpiredHolds() {
    // Expiration schedules provider reconciliation; it never changes capacity itself.
    return this.db.payment.updateMany({
      where: {
        status: { in: ['INITIATING', 'PENDING'] },
        order: {
          reservation: { status: 'HELD', expiresAt: { lte: this.now() } },
        },
      },
      data: { availableAt: this.now() },
    });
  }
}
