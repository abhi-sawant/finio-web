<?php
// ============================================================
//  COPY THIS FILE to /home/YOUR_CPANEL_USERNAME/finio-config/config.php
//  (one level ABOVE public_html — never inside it)
//  Then fill in every value below.
// ============================================================
return [

    // ── Database ────────────────────────────────────────────
    // Find these in cPanel > MySQL Databases.
    // cPanel always prefixes DB name and user with your cPanel username + underscore.
    // Example cPanel username = "johndoe"  →  DB name = "johndoe_finio"
    'db' => [
        'host'     => 'localhost',
        'name'     => 'CPANEL_USER_finio',       // e.g. johndoe_finio
        'user'     => 'CPANEL_USER_finiouser',   // e.g. johndoe_finiouser
        'password' => 'YOUR_DB_PASSWORD',
    ],

    // ── JWT ─────────────────────────────────────────────────
    // secret: generate a long random string (at least 32 chars).
    // You can use: https://www.random.org/strings/ or run:
    //   openssl rand -hex 32
    // in the cPanel Terminal.
    'jwt' => [
        'secret'         => 'CHANGE_THIS_TO_A_VERY_LONG_RANDOM_STRING',
        'access_expiry'  => 30 * 24 * 60 * 60,   // 30 days in seconds
        'refresh_expiry' => 90 * 24 * 60 * 60,   // 90 days in seconds (not used yet)
    ],

    // ── Email (PHPMailer via your domain SMTP) ───────────────
    // In cPanel > Email Accounts, create:  noreply@yourdomain.com
    // Then fill in the details below.
    'mail' => [
        'host'      => 'mail.yourdomain.com',   // usually mail.yourdomain.com
        'port'      => 465,                      // 465 for SSL, 587 for TLS
        'username'  => 'noreply@yourdomain.com',
        'password'  => 'YOUR_EMAIL_PASSWORD',
        'from_name' => 'Finio',
        'encryption'=> 'ssl',                    // 'ssl' for port 465, 'tls' for 587
    ],

    // ── Paths ────────────────────────────────────────────────
    // Absolute path to where backups will be stored.
    // This folder must be OUTSIDE public_html.
    // Replace CPANEL_USER with your actual cPanel username.
    'backup_dir' => '/home/CPANEL_USER/finio-backups',

    // The public URL of your API subdomain (no trailing slash).
    'app_url'    => 'https://api.yourdomain.com',

    // Origins allowed to call the API from a browser (CORS).
    // Can be a single string or an array. No trailing slashes.
    // Include localhost entries only while developing; remove them in production.
    'allowed_origins' => [
        'https://finio.yourdomain.com',   // production frontend
        'http://localhost:5173',           // Vite dev server
        'http://localhost:4173',           // Vite preview
    ],

    // How many daily backup files to keep per user before deleting oldest.
    'backup_retention_days' => 30,
];
