<?php

// Copy this file to config.php on Hostinger, place it outside public_html,
// and replace every placeholder. Never commit or expose the real config.php.
return [
    'supabase_url' => 'https://kizjrvzctilzugbjlfwl.supabase.co',
    'supabase_service_role_key' => 'YOUR_SUPABASE_SERVICE_ROLE_KEY',

    // Use an absolute private directory outside public_html.
    'archive_dir' => '/home/YOUR_HOSTINGER_USER/private/rfg-log-archives',
    'storage_name' => 'hostinger-private-storage',

    // Prevent overlapping cron executions.
    'lock_file' => '/home/YOUR_HOSTINGER_USER/private/rfg-log-archive.lock',

    // Maximum old calendar months processed in one cron run.
    'max_months_per_run' => 24,
];
