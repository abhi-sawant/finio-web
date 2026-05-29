<?php
declare(strict_types=1);

namespace Finio\Controllers;

use Finio\Config;
use Finio\Database;
use function Finio\json_ok;
use function Finio\json_error;
use function Finio\request_body;
use function Finio\jwt_create;
use function Finio\generate_token;
use function Finio\send_mail;

class AuthController
{
    // ── POST /auth/register ───────────────────────────────────────────────────
    public function register(array $params): void
    {
        $body  = request_body();
        $name  = trim($body['name']  ?? '');
        $email = strtolower(trim($body['email'] ?? ''));
        $pass  = $body['password'] ?? '';

        if (empty($name)) {
            json_error('Name is required.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_error('A valid email address is required.');
        }
        if (strlen($pass) < 8) {
            json_error('Password must be at least 8 characters.');
        }

        $pdo = Database::connect();

        $stmt = $pdo->prepare('SELECT id, is_verified FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $existing = $stmt->fetch();

        if ($existing && $existing['is_verified']) {
            json_error('An account with this email already exists.', 409);
        }

        $otp     = $this->generateOtp();
        $otpHash = hash('sha256', $otp);
        $expires = date('Y-m-d H:i:s', time() + 900); // 15 minutes

        if ($existing && !$existing['is_verified']) {
            // Re-register: update OTP for existing unverified account
            $hash = password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12]);
            $pdo->prepare(
                'UPDATE users SET name = ?, password_hash = ?, otp_hash = ?, otp_expires = ? WHERE id = ?'
            )->execute([$name, $hash, $otpHash, $expires, $existing['id']]);
        } else {
            $hash = password_hash($pass, PASSWORD_BCRYPT, ['cost' => 12]);
            $pdo->prepare(
                'INSERT INTO users (name, email, password_hash, is_verified, otp_hash, otp_expires)
                 VALUES (?, ?, ?, 0, ?, ?)'
            )->execute([$name, $email, $hash, $otpHash, $expires]);
        }

        $this->sendOtpEmail($email, $name, $otp, 'verify');

        json_ok([
            'message' => 'Account created. Enter the 6-digit OTP sent to your email.',
            'email'   => $email,
        ], 201);
    }

    // ── POST /auth/verify-otp ─────────────────────────────────────────────────
    public function verifyOtp(array $params): void
    {
        $body  = request_body();
        $email = strtolower(trim($body['email'] ?? ''));
        $otp   = trim($body['otp'] ?? '');

        if (empty($email) || empty($otp)) {
            json_error('Email and OTP are required.');
        }

        $pdo  = Database::connect();
        $stmt = $pdo->prepare(
            'SELECT id, name, email, otp_hash, otp_expires, is_verified FROM users WHERE email = ?'
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            json_error('No account found with this email.', 404);
        }
        if ($user['is_verified']) {
            json_error('This account is already verified. Please log in.');
        }
        if (empty($user['otp_hash']) || strtotime($user['otp_expires']) < time()) {
            json_error('OTP has expired. Please request a new one.', 410);
        }
        if (!hash_equals($user['otp_hash'], hash('sha256', $otp))) {
            json_error('Invalid OTP.', 401);
        }

        $pdo->prepare(
            'UPDATE users SET is_verified = 1, otp_hash = NULL, otp_expires = NULL WHERE id = ?'
        )->execute([$user['id']]);

        $token = jwt_create((int)$user['id'], $user['email'], $user['name']);

        json_ok([
            'message' => 'Email verified successfully.',
            'token'   => $token,
            'user'    => [
                'id'    => (int)$user['id'],
                'name'  => $user['name'],
                'email' => $user['email'],
            ],
        ]);
    }

    // ── POST /auth/resend-otp ─────────────────────────────────────────────────
    public function resendOtp(array $params): void
    {
        $body  = request_body();
        $email = strtolower(trim($body['email'] ?? ''));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_error('A valid email address is required.');
        }

        $pdo  = Database::connect();
        $stmt = $pdo->prepare('SELECT id, name, is_verified FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            json_error('No account found with this email.', 404);
        }
        if ($user['is_verified']) {
            json_error('This account is already verified. Please log in.');
        }

        $otp     = $this->generateOtp();
        $otpHash = hash('sha256', $otp);
        $expires = date('Y-m-d H:i:s', time() + 900);

        $pdo->prepare(
            'UPDATE users SET otp_hash = ?, otp_expires = ? WHERE id = ?'
        )->execute([$otpHash, $expires, $user['id']]);

        $this->sendOtpEmail($email, $user['name'], $otp, 'verify');

        json_ok(['message' => 'A new OTP has been sent to your email.']);
    }

    // ── POST /auth/login ──────────────────────────────────────────────────────
    public function login(array $params): void
    {
        $body  = request_body();
        $email = strtolower(trim($body['email'] ?? ''));
        $pass  = $body['password'] ?? '';

        if (empty($email) || empty($pass)) {
            json_error('Email and password are required.');
        }

        $pdo  = Database::connect();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        $dummyHash = '$2y$12$invalidsaltXXXXXXXXXXXuInvalidHashPaddingXXXXXXXXXXXX';
        $hash      = $user ? $user['password_hash'] : $dummyHash;

        if (!password_verify($pass, $hash) || !$user) {
            json_error('Invalid email or password.', 401);
        }
        if (!$user['is_verified']) {
            json_error('Please verify your email before logging in. Check your inbox for the OTP.', 403);
        }

        $token = jwt_create((int)$user['id'], $user['email'], $user['name']);

        json_ok([
            'token' => $token,
            'user'  => [
                'id'    => (int)$user['id'],
                'name'  => $user['name'],
                'email' => $user['email'],
            ],
        ]);
    }

    // ── POST /auth/forgot-password ────────────────────────────────────────────
    public function forgotPassword(array $params): void
    {
        $body  = request_body();
        $email = strtolower(trim($body['email'] ?? ''));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_error('A valid email address is required.');
        }

        $pdo  = Database::connect();
        $stmt = $pdo->prepare('SELECT id, name FROM users WHERE email = ? AND is_verified = 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user) {
            $otp     = $this->generateOtp();
            $otpHash = hash('sha256', $otp);
            $expires = date('Y-m-d H:i:s', time() + 900); // 15 minutes

            $pdo->prepare(
                'UPDATE users SET reset_token_hash = ?, reset_token_expires = ? WHERE id = ?'
            )->execute([$otpHash, $expires, $user['id']]);

            $this->sendOtpEmail($email, $user['name'], $otp, 'reset');
        }

        // Always return success to prevent email enumeration
        json_ok(['message' => 'If an account with that email exists, a 6-digit OTP has been sent.']);
    }

    // ── POST /auth/reset-password ─────────────────────────────────────────────
    public function resetPassword(array $params): void
    {
        $body    = request_body();
        $email   = strtolower(trim($body['email']    ?? ''));
        $otp     = trim($body['otp']      ?? '');
        $newPass = $body['password'] ?? '';

        if (empty($email) || empty($otp)) {
            json_error('Email and OTP are required.');
        }
        if (strlen($newPass) < 8) {
            json_error('Password must be at least 8 characters.');
        }

        $otpHash = hash('sha256', $otp);
        $pdo     = Database::connect();

        $stmt = $pdo->prepare(
            'SELECT id, reset_token_hash, reset_token_expires FROM users
             WHERE email = ?'
        );
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || empty($user['reset_token_hash'])) {
            json_error('Invalid or expired OTP.', 404);
        }
        if (strtotime($user['reset_token_expires']) < time()) {
            json_error('OTP has expired. Please request a new one.', 410);
        }
        if (!hash_equals($user['reset_token_hash'], $otpHash)) {
            json_error('Invalid OTP.', 401);
        }

        $newHash = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);

        $pdo->prepare(
            'UPDATE users
             SET password_hash = ?, reset_token_hash = NULL, reset_token_expires = NULL
             WHERE id = ?'
        )->execute([$newHash, $user['id']]);

        json_ok(['message' => 'Password has been reset. You can now log in.']);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function generateOtp(): string
    {
        return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    private function sendOtpEmail(string $email, string $name, string $otp, string $type): void
    {
        if ($type === 'reset') {
            $subject = 'Reset your Finio password';
            $heading = 'Password Reset OTP';
            $body    = 'Enter this OTP in the app to reset your Finio password.';
            $note    = 'This OTP expires in <strong>15 minutes</strong>. If you didn\'t request a reset, ignore this email.';
        } else {
            $subject = 'Verify your Finio account';
            $heading = 'Email Verification OTP';
            $body    = 'Enter this OTP in the app to verify your Finio account.';
            $note    = 'This OTP expires in <strong>15 minutes</strong>.';
        }

        $html = <<<HTML
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;color:#111">{$heading}</h2>
          <p style="color:#555;margin:0 0 32px">{$body}</p>
          <div style="background:#f4f4f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px">
            <span style="font-size:42px;font-weight:700;letter-spacing:12px;color:#6366f1;font-family:monospace">
              {$otp}
            </span>
          </div>
          <p style="color:#888;font-size:13px;margin:0">{$note}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="color:#aaa;font-size:12px;margin:0">Finio Personal Finance</p>
        </div>
        HTML;

        send_mail($email, $name, $subject, $html);
    }
}
