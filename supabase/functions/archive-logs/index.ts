import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

type LogRow = {
  id: string;
  created_at: string;
  [key: string]: unknown;
};

const requiredSecret = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

const getServiceRoleKey = () => {
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (legacyKey) return legacyKey;

  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }

  throw new Error('Supabase service role/secret key is unavailable.');
};

const monthStart = (value: string | Date) => {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

const addMonths = (value: Date, months: number) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));

const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const monthKey = (value: Date) => value.toISOString().slice(0, 7);

const sha256 = async (value: Uint8Array) => {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const gzip = async (value: string) => {
  const source = new Blob([value]).stream();
  const compressed = source.pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
};

const fetchAll = async (
  supabase: ReturnType<typeof createClient>,
  table: 'activity_logs' | 'login_logs',
  start: string,
  end: string
) => {
  const rows: LogRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const columns = table === 'activity_logs'
      ? 'id, application_id, actor_id, action, details, created_at'
      : 'id, user_id, email, role, success, ip_address, user_agent, created_at';
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    rows.push(...((data || []) as LogRow[]));
    if (!data || data.length < pageSize) break;
  }

  return rows;
};

const oldestCandidate = async (
  supabase: ReturnType<typeof createClient>,
  table: 'activity_logs' | 'login_logs',
  cutoff: string
) => {
  const { data, error } = await supabase
    .from(table)
    .select('created_at')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.created_at as string | undefined;
};

Deno.serve(async (request) => {
  try {
    if (request.method !== 'POST') {
      return Response.json({ error: 'POST required.' }, { status: 405 });
    }

    const cronSecret = requiredSecret('ARCHIVE_CRON_SECRET');
    if (request.headers.get('x-archive-secret') !== cronSecret) {
      return Response.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const supabaseUrl = requiredSecret('SUPABASE_URL');
    const bucket = requiredSecret('R2_BUCKET');
    const accountId = requiredSecret('R2_ACCOUNT_ID');
    const supabase = createClient(supabaseUrl, getServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const r2 = new AwsClient({
      accessKeyId: requiredSecret('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredSecret('R2_SECRET_ACCESS_KEY'),
      region: 'auto',
      service: 's3'
    });

    // Keep the current calendar month and the previous calendar month in Supabase.
    const cutoffDate = addMonths(monthStart(new Date()), -1);
    const cutoff = cutoffDate.toISOString();
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const archives: unknown[] = [];

    for (let batch = 0; batch < 24; batch += 1) {
      const [oldestActivity, oldestLogin] = await Promise.all([
        oldestCandidate(supabase, 'activity_logs', cutoff),
        oldestCandidate(supabase, 'login_logs', cutoff)
      ]);
      const candidates = [oldestActivity, oldestLogin].filter(Boolean) as string[];
      if (!candidates.length) break;

      const targetMonth = monthStart(candidates.sort()[0]);
      const nextMonth = addMonths(targetMonth, 1);
      const [activityLogs, loginLogs] = await Promise.all([
        fetchAll(supabase, 'activity_logs', targetMonth.toISOString(), nextMonth.toISOString()),
        fetchAll(supabase, 'login_logs', targetMonth.toISOString(), nextMonth.toISOString())
      ]);

      const generatedAt = new Date().toISOString();
      const payload = {
        format: 'rfg-log-archive-v1',
        archive_month: monthKey(targetMonth),
        generated_at: generatedAt,
        retention_cutoff: isoDate(cutoffDate),
        activity_logs: activityLogs,
        login_logs: loginLogs
      };
      const compressed = await gzip(JSON.stringify(payload));
      const checksum = await sha256(compressed);
      const stamp = generatedAt.replace(/[-:.TZ]/g, '').slice(0, 14);
      const [year, month] = monthKey(targetMonth).split('-');
      const objectKey = `rfg-logs/${year}/${month}/logs-${year}-${month}-${stamp}.json.gz`;
      const objectUrl = `${endpoint}/${encodeURIComponent(bucket)}/${objectKey}`;

      const upload = await r2.fetch(objectUrl, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'x-amz-meta-sha256': checksum
        },
        body: compressed
      });
      if (!upload.ok) {
        throw new Error(`R2 upload failed (${upload.status}): ${await upload.text()}`);
      }

      const verification = await r2.fetch(objectUrl, { method: 'HEAD' });
      if (!verification.ok) {
        throw new Error(`R2 verification failed (${verification.status}).`);
      }
      const storedSize = Number(verification.headers.get('content-length') || 0);
      const storedChecksum = verification.headers.get('x-amz-meta-sha256');
      if (storedSize > 0 && storedSize !== compressed.byteLength) {
        throw new Error('R2 verification returned a different object size.');
      }
      if (storedChecksum && storedChecksum !== checksum) {
        throw new Error('R2 verification returned a different checksum.');
      }

      const { data: finalized, error: finalizeError } = await supabase.rpc('finalize_log_archive', {
        p_archive_month: isoDate(targetMonth),
        p_object_key: objectKey,
        p_bucket_name: bucket,
        p_checksum_sha256: checksum,
        p_size_bytes: compressed.byteLength,
        p_activity_ids: activityLogs.map((row) => row.id),
        p_login_ids: loginLogs.map((row) => row.id)
      });
      if (finalizeError) throw finalizeError;
      archives.push(finalized);
    }

    return Response.json({
      ok: true,
      message: archives.length ? 'Eligible log months were archived.' : 'No logs are old enough to archive.',
      retention_cutoff: isoDate(cutoffDate),
      archives
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Log archive failed.';
    console.error(message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
