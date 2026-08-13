<?php
declare(strict_types=1);

// ── Bootstrap ────────────────────────────────────────────────────────────────
// One level up from public/ is the backend root where vendor/ lives.
require_once __DIR__ . '/../vendor/autoload.php';

use Finio\Config;
use Finio\Router;
use Finio\Controllers\AuthController;
use Finio\Controllers\BackupController;
use Finio\Controllers\UserController;
use Finio\Middleware\AuthMiddleware;
use Finio\Middleware\RateLimitMiddleware;

// ── CORS headers ─────────────────────────────────────────────────────────────
// Only allow requests from origins listed in 'allowed_origins'.
// The value can be a string (single origin) or an array of origins.
$configuredOrigins = Config::get('allowed_origins', Config::get('app_url', ''));
$allowedOrigins    = is_array($configuredOrigins) ? $configuredOrigins : [$configuredOrigins];
$requestOrigin     = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($requestOrigin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Vary: Origin');
}

header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
header('Content-Type: application/json; charset=utf-8');

// Respond immediately to preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Rate limiting ────────────────────────────────────────────────────────────
// Shorthand for a [RateLimitMiddleware, options] tuple. $by 'ip' limits per
// client IP (used on public routes); 'user' limits per authenticated user id
// and must come after AuthMiddleware::class in that route's middleware list.
$rl = static fn(string $bucket, int $max, int $window, string $by = 'ip'): array => [
    RateLimitMiddleware::class,
    ['bucket' => $bucket, 'max' => $max, 'window' => $window, 'by' => $by],
];

// ── Router ───────────────────────────────────────────────────────────────────
$router = new Router();

// Public auth routes (no JWT required). Limits are per client IP and sized to
// the sensitivity of each action: OTP/password endpoints send email or allow
// guessing, so they're tighter than plain reads.
$router->post('/auth/register',        [AuthController::class, 'register'],       [$rl('auth_register', 5, 3600)]);
$router->post('/auth/verify-otp',      [AuthController::class, 'verifyOtp'],      [$rl('auth_verify_otp', 10, 900)]);
$router->post('/auth/resend-otp',      [AuthController::class, 'resendOtp'],      [$rl('auth_resend_otp', 3, 900)]);
$router->post('/auth/login',           [AuthController::class, 'login'],          [$rl('auth_login', 10, 900)]);
$router->post('/auth/forgot-password', [AuthController::class, 'forgotPassword'], [$rl('auth_forgot_password', 5, 3600)]);
$router->post('/auth/reset-password',  [AuthController::class, 'resetPassword'],  [$rl('auth_reset_password', 10, 900)]);

// Protected backup routes (JWT required, then rate-limited per user)
$router->post  ('/backup/upload', [BackupController::class, 'upload'],   [AuthMiddleware::class, $rl('backup_upload', 30, 60, 'user')]);
$router->get   ('/backup/latest', [BackupController::class, 'latest'],   [AuthMiddleware::class, $rl('backup_read', 60, 60, 'user')]);
$router->get   ('/backup/list',   [BackupController::class, 'list'],     [AuthMiddleware::class, $rl('backup_read', 60, 60, 'user')]);
$router->get   ('/backup/{date}', [BackupController::class, 'download'], [AuthMiddleware::class, $rl('backup_read', 60, 60, 'user')]);
$router->delete('/backup/{date}', [BackupController::class, 'delete'],   [AuthMiddleware::class, $rl('backup_delete', 30, 60, 'user')]);

// Protected user routes (JWT required, then rate-limited per user)
$router->get   ('/user/me', [UserController::class, 'me'],     [AuthMiddleware::class, $rl('user_read', 60, 60, 'user')]);
$router->put   ('/user/me', [UserController::class, 'update'], [AuthMiddleware::class, $rl('user_update', 10, 60, 'user')]);
$router->delete('/user/me', [UserController::class, 'delete'], [AuthMiddleware::class, $rl('user_delete', 5, 60, 'user')]);

// Dispatch
$router->dispatch();
