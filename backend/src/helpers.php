<?php
declare(strict_types=1);

namespace Finio;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as MailException;

// ── JSON response helpers ─────────────────────────────────────────────────────

function json_ok(mixed $data = null, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data ?? ['success' => true]);
    exit;
}

function json_error(string $message, int $status = 400): never
{
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

/** Parse the raw JSON request body and return it as an array. */
function request_body(): array
{
    $raw = file_get_contents('php://input');
    if (empty($raw)) {
        return [];
    }
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        json_error('Invalid JSON body.', 400);
    }
    return $data;
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

function jwt_create(int $userId, string $email, string $name): string
{
    $secret  = Config::get('jwt')['secret'];
    $expiry  = Config::get('jwt')['access_expiry'];

    $payload = [
        'iss'   => Config::get('app_url'),
        'sub'   => $userId,
        'email' => $email,
        'name'  => $name,
        'iat'   => time(),
        'exp'   => time() + $expiry,
    ];

    return JWT::encode($payload, $secret, 'HS256');
}

/**
 * Decode a JWT from the Authorization header.
 * Returns the decoded payload as an object, or null on failure.
 */
function jwt_decode(): ?object
{
    $header = $_SERVER['HTTP_AUTHORIZATION']
           ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
           ?? '';

    if (!str_starts_with($header, 'Bearer ')) {
        return null;
    }

    $token  = substr($header, 7);
    $secret = Config::get('jwt')['secret'];

    try {
        return JWT::decode($token, new Key($secret, 'HS256'));
    } catch (\Exception) {
        return null;
    }
}

// ── Secure random token ───────────────────────────────────────────────────────

function generate_token(int $bytes = 32): string
{
    return bin2hex(random_bytes($bytes));
}

// ── Email sender ──────────────────────────────────────────────────────────────

function send_mail(string $toEmail, string $toName, string $subject, string $htmlBody): bool
{
    $cfg = Config::get('mail');

    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = $cfg['host'];
        $mail->SMTPAuth   = true;
        $mail->Username   = $cfg['username'];
        $mail->Password   = $cfg['password'];
        $mail->SMTPSecure = $cfg['encryption'];      // 'ssl' or 'tls'
        $mail->Port       = (int)$cfg['port'];

        $mail->setFrom($cfg['username'], $cfg['from_name']);
        $mail->addAddress($toEmail, $toName);

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $htmlBody;
        $mail->AltBody = strip_tags($htmlBody);

        $mail->send();
        return true;
    } catch (MailException) {
        return false;
    }
}
