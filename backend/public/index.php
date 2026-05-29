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

// ── Router ───────────────────────────────────────────────────────────────────
$router = new Router();

// Public auth routes (no JWT required)
$router->post('/auth/register',        [AuthController::class, 'register']);
$router->post('/auth/verify-otp',      [AuthController::class, 'verifyOtp']);
$router->post('/auth/resend-otp',      [AuthController::class, 'resendOtp']);
$router->post('/auth/login',           [AuthController::class, 'login']);
$router->post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);
$router->post('/auth/reset-password',  [AuthController::class, 'resetPassword']);

// Protected backup routes (JWT required)
$router->post  ('/backup/upload',        [BackupController::class, 'upload'],   [AuthMiddleware::class]);
$router->get   ('/backup/latest',        [BackupController::class, 'latest'],   [AuthMiddleware::class]);
$router->get   ('/backup/list',          [BackupController::class, 'list'],     [AuthMiddleware::class]);
$router->get   ('/backup/{date}',        [BackupController::class, 'download'], [AuthMiddleware::class]);
$router->delete('/backup/{date}',        [BackupController::class, 'delete'],   [AuthMiddleware::class]);

// Protected user routes (JWT required)
$router->get   ('/user/me', [UserController::class, 'me'],     [AuthMiddleware::class]);
$router->put   ('/user/me', [UserController::class, 'update'], [AuthMiddleware::class]);
$router->delete('/user/me', [UserController::class, 'delete'], [AuthMiddleware::class]);

// Dispatch
$router->dispatch();
