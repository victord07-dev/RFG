<?php

declare(strict_types=1);

const PAGE_SIZE = 1000;

function fail(string $message, int $code = 1): never
{
    fwrite(STDERR, '[' . gmdate('c') . '] ERROR: ' . $message . PHP_EOL);
    exit($code);
}

function logMessage(string $message): void
{
    fwrite(STDOUT, '[' . gmdate('c') . '] ' . $message . PHP_EOL);
}

function requestJson(
    array $config,
    string $method,
    string $path,
    ?array $body = null
): array {
    $url = rtrim($config['supabase_url'], '/') . $path;
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('Could not initialize HTTP request.');
    }

    $headers = [
        'apikey: ' . $config['supabase_service_role_key'],
        'Accept: application/json',
        'Content-Type: application/json',
    ];
    if (!str_starts_with($config['supabase_service_role_key'], 'sb_secret_')) {
        $headers[] = 'Authorization: Bearer ' . $config['supabase_service_role_key'];
    }

    curl_setopt_array($handle, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_TIMEOUT => 120,
    ]);

    if ($body !== null) {
        $encoded = json_encode($body, JSON_UNESCAPED_SLASHES);
        if ($encoded === false) {
            throw new RuntimeException('Could not encode request body.');
        }
        curl_setopt($handle, CURLOPT_POSTFIELDS, $encoded);
    }

    $response = curl_exec($handle);
    if ($response === false) {
        $error = curl_error($handle);
        curl_close($handle);
        throw new RuntimeException('Supabase request failed: ' . $error);
    }

    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);

    $decoded = $response === '' ? [] : json_decode($response, true);
    if ($status < 200 || $status >= 300) {
        $message = is_array($decoded)
            ? ($decoded['message'] ?? $decoded['error_description'] ?? $decoded['error'] ?? $response)
            : $response;
        throw new RuntimeException("Supabase returned HTTP {$status}: {$message}");
    }

    if (!is_array($decoded)) {
        throw new RuntimeException('Supabase returned an invalid JSON response.');
    }

    return $decoded;
}

function oldestTimestamp(array $config, string $table, string $cutoff): ?string
{
    $query = http_build_query([
        'select' => 'created_at',
        'created_at' => 'lt.' . $cutoff,
        'order' => 'created_at.asc',
        'limit' => '1',
    ], '', '&', PHP_QUERY_RFC3986);
    $rows = requestJson($config, 'GET', "/rest/v1/{$table}?{$query}");
    return isset($rows[0]['created_at']) ? (string) $rows[0]['created_at'] : null;
}

function fetchAll(
    array $config,
    string $table,
    string $columns,
    string $start,
    string $end
): array {
    $rows = [];

    for ($offset = 0; ; $offset += PAGE_SIZE) {
        $query = 'select=' . rawurlencode($columns)
            . '&created_at=gte.' . rawurlencode($start)
            . '&created_at=lt.' . rawurlencode($end)
            . '&order=created_at.asc'
            . '&limit=' . PAGE_SIZE
            . '&offset=' . $offset;

        $page = requestJson($config, 'GET', "/rest/v1/{$table}?{$query}");
        array_push($rows, ...$page);
        if (count($page) < PAGE_SIZE) {
            break;
        }
    }

    return $rows;
}

function monthStart(string $timestamp): DateTimeImmutable
{
    return (new DateTimeImmutable($timestamp, new DateTimeZone('UTC')))
        ->modify('first day of this month')
        ->setTime(0, 0);
}

function validateConfig(array $config): void
{
    $required = [
        'supabase_url',
        'supabase_service_role_key',
        'archive_dir',
        'storage_name',
        'lock_file',
    ];
    foreach ($required as $key) {
        if (!isset($config[$key]) || trim((string) $config[$key]) === '') {
            fail("Missing configuration value: {$key}");
        }
    }
    if (str_contains($config['supabase_service_role_key'], 'YOUR_')) {
        fail('Replace the placeholder Supabase service role key.');
    }
    if (str_contains($config['archive_dir'], 'public_html')) {
        fail('archive_dir must be outside public_html.');
    }
}

$configPath = $argv[1] ?? (__DIR__ . '/config.php');
if (!is_file($configPath)) {
    fail("Config file not found: {$configPath}");
}

$config = require $configPath;
if (!is_array($config)) {
    fail('Config file must return an array.');
}
validateConfig($config);

$lockDirectory = dirname($config['lock_file']);
if (!is_dir($lockDirectory) && !mkdir($lockDirectory, 0700, true) && !is_dir($lockDirectory)) {
    fail('Could not create private lock directory.');
}

$lockHandle = fopen($config['lock_file'], 'c');
if ($lockHandle === false || !flock($lockHandle, LOCK_EX | LOCK_NB)) {
    fail('Another archive run is already active.', 0);
}

try {
    if (!is_dir($config['archive_dir'])
        && !mkdir($config['archive_dir'], 0700, true)
        && !is_dir($config['archive_dir'])) {
        throw new RuntimeException('Could not create private archive directory.');
    }

    // Keep the current calendar month and previous calendar month in Supabase.
    $currentMonth = (new DateTimeImmutable('first day of this month', new DateTimeZone('UTC')))
        ->setTime(0, 0);
    $cutoff = $currentMonth->modify('-1 month');
    $maxMonths = max(1, min(24, (int) ($config['max_months_per_run'] ?? 24)));
    $archived = 0;

    for ($batch = 0; $batch < $maxMonths; $batch++) {
        $activityOldest = oldestTimestamp($config, 'activity_logs', $cutoff->format(DATE_ATOM));
        $loginOldest = oldestTimestamp($config, 'login_logs', $cutoff->format(DATE_ATOM));
        $candidates = array_values(array_filter([$activityOldest, $loginOldest]));
        if ($candidates === []) {
            break;
        }

        sort($candidates, SORT_STRING);
        $targetMonth = monthStart($candidates[0]);
        $nextMonth = $targetMonth->modify('+1 month');
        $start = $targetMonth->format(DATE_ATOM);
        $end = $nextMonth->format(DATE_ATOM);

        $activityRows = fetchAll(
            $config,
            'activity_logs',
            'id,application_id,actor_id,action,details,created_at',
            $start,
            $end
        );
        $loginRows = fetchAll(
            $config,
            'login_logs',
            'id,user_id,email,role,success,ip_address,user_agent,created_at',
            $start,
            $end
        );

        $month = $targetMonth->format('Y-m');
        $payload = [
            'format' => 'rfg-log-archive-v1',
            'archive_month' => $month,
            'generated_at' => gmdate('c'),
            'retention_cutoff' => $cutoff->format('Y-m-d'),
            'activity_logs' => $activityRows,
            'login_logs' => $loginRows,
        ];
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException("Could not encode archive month {$month}.");
        }
        $compressed = gzencode($json, 9);
        if ($compressed === false) {
            throw new RuntimeException("Could not compress archive month {$month}.");
        }

        $directory = rtrim($config['archive_dir'], DIRECTORY_SEPARATOR)
            . DIRECTORY_SEPARATOR . $targetMonth->format('Y')
            . DIRECTORY_SEPARATOR . $targetMonth->format('m');
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException("Could not create archive directory for {$month}.");
        }

        $fileName = 'logs-' . $month . '-' . gmdate('YmdHis') . '.json.gz';
        $absolutePath = $directory . DIRECTORY_SEPARATOR . $fileName;
        $temporaryPath = $absolutePath . '.tmp';
        $written = file_put_contents($temporaryPath, $compressed, LOCK_EX);
        if ($written === false || $written !== strlen($compressed)) {
            @unlink($temporaryPath);
            throw new RuntimeException("Could not write the complete archive for {$month}.");
        }
        chmod($temporaryPath, 0600);

        $checksum = hash_file('sha256', $temporaryPath);
        if ($checksum === false || filesize($temporaryPath) !== strlen($compressed)) {
            @unlink($temporaryPath);
            throw new RuntimeException("Archive verification failed for {$month}.");
        }
        if (!rename($temporaryPath, $absolutePath)) {
            @unlink($temporaryPath);
            throw new RuntimeException("Could not finalize archive file for {$month}.");
        }

        $relativePath = $targetMonth->format('Y/m') . '/' . $fileName;
        try {
            requestJson($config, 'POST', '/rest/v1/rpc/finalize_log_archive', [
                'p_archive_month' => $targetMonth->format('Y-m-d'),
                'p_object_key' => $relativePath,
                'p_bucket_name' => $config['storage_name'],
                'p_checksum_sha256' => $checksum,
                'p_size_bytes' => filesize($absolutePath),
                'p_activity_ids' => array_column($activityRows, 'id'),
                'p_login_ids' => array_column($loginRows, 'id'),
            ]);
        } catch (Throwable $error) {
            // Keep the verified file for investigation, but never delete database
            // rows unless the protected finalization transaction succeeds.
            throw new RuntimeException(
                "Archive file was written for {$month}, but database finalization failed: "
                . $error->getMessage()
            );
        }

        $archived++;
        logMessage(
            "Archived {$month}: "
            . count($activityRows) . ' activity logs, '
            . count($loginRows) . ' login logs, '
            . filesize($absolutePath) . ' bytes.'
        );
    }

    logMessage(
        $archived > 0
            ? "Archive complete. {$archived} month(s) processed."
            : 'No logs are old enough to archive.'
    );
} catch (Throwable $error) {
    fail($error->getMessage());
} finally {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
}
