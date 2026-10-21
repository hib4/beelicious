import { OrderDetailScreen } from '@/components/dashboard/orders';
import { notFound } from 'next/navigation';
export default async function Detail({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  return <OrderDetailScreen id={orderId} />;
}
