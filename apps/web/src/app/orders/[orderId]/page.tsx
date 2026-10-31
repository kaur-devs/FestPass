import type { Metadata } from 'next';
import { OrderDetails } from './order-details';

export const metadata: Metadata = { title: 'Your order' };

export default async function OrderPage({ params }: PageProps<'/orders/[orderId]'>) {
  const { orderId } = await params;
  return <OrderDetails orderId={orderId} />;
}
