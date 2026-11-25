import { AdminError, auditCsv, auditEvent, auditRange, readAuditLog } from '@/lib/admin/accounts';
import { getAuthState } from '@/lib/supabase/auth-state';
import { createClient } from '@/lib/supabase/server';

// The audit log as a CSV file, for the period and event chosen on /admin/audit. Administrators only;
// the database checks again, masks emails, caps the file at 5,000 rows and records the download.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { status, user } = await getAuthState(supabase);
  if (status !== 'aal2' || user?.app_metadata?.role !== 'admin') return new Response('Not found', { status: 404 });

  const params = new URL(request.url).searchParams;
  const { from, to } = auditRange(params.get('from'), params.get('to'));
  const event = auditEvent(params.get('event'));
  try {
    const rows = await readAuditLog(supabase, from, to, event, 5000);
    return new Response(auditCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-log-${from}-to-${to}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof AdminError ? error.message : 'Sorry, something went wrong.';
    return new Response(message, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
