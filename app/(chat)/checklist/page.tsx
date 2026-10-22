import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAal2 } from '@/lib/supabase/server';
import { TripChecklist } from './trip-checklist';

export const metadata: Metadata = { title: 'Pre-travel checklist · KQ Policy Assistant' };

// Overview §7.10. Passengers only.
export default async function ChecklistPage() {
  const { role } = await requireAal2();
  if (role !== 'customer') redirect('/');
  return <TripChecklist />;
}
