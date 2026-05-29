<?php
declare(strict_types=1);

namespace Finio\Controllers;

use Finio\Config;
use Finio\Database;
use function Finio\json_ok;
use function Finio\json_error;
use function Finio\request_body;
use function Finio\jwt_create;

class UserController
{
    // ── GET /user/me ──────────────────────────────────────────────────────────
    public function me(array $params): void
    {
        $userId = $params['auth_user_id'];
        $pdo    = Database::connect();

        $stmt = $pdo->prepare('SELECT id, name, email, created_at FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user) {
            json_error('User not found.', 404);
        }

        json_ok(['user' => $user]);
    }

    // ── PUT /user/me ──────────────────────────────────────────────────────────
    /**
     * Update name and/or password.
     * To change password the client must also send current_password.
     */
    public function update(array $params): void
    {
        $userId = $params['auth_user_id'];
        $body   = request_body();
        $pdo    = Database::connect();

        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user) {
            json_error('User not found.', 404);
        }

        $updates = [];
        $bindings = [];

        // Update name
        $newName = trim($body['name'] ?? '');
        if ($newName !== '' && $newName !== $user['name']) {
            $updates[]  = 'name = ?';
            $bindings[] = $newName;
        }

        // Update password
        if (!empty($body['new_password'])) {
            $currentPass = $body['current_password'] ?? '';
            if (!password_verify($currentPass, $user['password_hash'])) {
                json_error('Current password is incorrect.', 403);
            }
            if (strlen($body['new_password']) < 8) {
                json_error('New password must be at least 8 characters.');
            }
            $updates[]  = 'password_hash = ?';
            $bindings[] = password_hash($body['new_password'], PASSWORD_BCRYPT, ['cost' => 12]);
        }

        if (empty($updates)) {
            json_error('No changes provided.');
        }

        $bindings[] = $userId;
        $pdo->prepare(
            'UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ?'
        )->execute($bindings);

        // Fetch updated user to return a fresh JWT
        $stmt = $pdo->prepare('SELECT id, name, email FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $updated = $stmt->fetch();

        $token = jwt_create((int)$updated['id'], $updated['email'], $updated['name']);

        json_ok([
            'message' => 'Profile updated.',
            'token'   => $token,    // Client should store the new token (name may have changed)
            'user'    => $updated,
        ]);
    }

    // ── DELETE /user/me ───────────────────────────────────────────────────────
    /**
     * Permanently deletes the account and ALL backup files.
     * Requires password confirmation.
     */
    public function delete(array $params): void
    {
        $userId = $params['auth_user_id'];
        $body   = request_body();
        $pdo    = Database::connect();

        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user) {
            json_error('User not found.', 404);
        }

        $pass = $body['password'] ?? '';
        if (!password_verify($pass, $user['password_hash'])) {
            json_error('Incorrect password.', 403);
        }

        // Delete backup files from disk
        $backupDir = rtrim(Config::get('backup_dir'), '/') . '/' . $userId;
        if (is_dir($backupDir)) {
            $this->deleteDirRecursive($backupDir);
        }

        // Delete DB row (backups cascade-deleted via FK)
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);

        json_ok(['message' => 'Account and all data permanently deleted.']);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function deleteDirRecursive(string $path): void
    {
        foreach (scandir($path) as $item) {
            if ($item === '.' || $item === '..') continue;
            $full = $path . '/' . $item;
            is_dir($full) ? $this->deleteDirRecursive($full) : unlink($full);
        }
        rmdir($path);
    }
}
