<?php
declare(strict_types=1);

namespace Finio\Controllers;

use Finio\Config;
use Finio\Database;
use function Finio\json_ok;
use function Finio\json_error;

class BackupController
{
    // ── POST /backup/upload ───────────────────────────────────────────────────
    /**
     * Accepts the full Zustand store JSON as the request body.
     * Writes it as YYYY-MM-DD.json in the user's backup directory.
     * Enforces a rolling retention window (default 30 days).
     */
    public function upload(array $params): void
    {
        $userId = $params['auth_user_id'];
        $today  = date('Y-m-d');

        // Raw body — could be large; avoid decoding/re-encoding to preserve fidelity
        $raw = file_get_contents('php://input');
        if (empty($raw)) {
            json_error('Request body is empty.');
        }

        // Quick sanity-check that it is valid JSON
        json_decode($raw);
        if (json_last_error() !== JSON_ERROR_NONE) {
            json_error('Request body is not valid JSON.');
        }

        $dir = $this->ensureUserDir($userId);
        $file = $dir . '/' . $today . '.json';

        if (file_put_contents($file, $raw) === false) {
            json_error('Failed to write backup file. Check server permissions.', 500);
        }

        $fileSize = strlen($raw);

        // Upsert the record in the DB (update file_size if same date already exists)
        $pdo = Database::connect();
        $pdo->prepare(
            'INSERT INTO backups (user_id, backup_date, file_size)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE file_size = VALUES(file_size), created_at = NOW()'
        )->execute([$userId, $today, $fileSize]);

        // Purge old backups beyond the retention window
        $this->purgeOldBackups($userId, $dir, $pdo);

        json_ok([
            'message'     => 'Backup uploaded successfully.',
            'backup_date' => $today,
            'file_size'   => $fileSize,
        ]);
    }

    // ── GET /backup/latest ────────────────────────────────────────────────────
    public function latest(array $params): void
    {
        $userId = $params['auth_user_id'];
        $pdo    = Database::connect();

        $stmt = $pdo->prepare(
            'SELECT backup_date, file_size FROM backups
             WHERE user_id = ?
             ORDER BY backup_date DESC
             LIMIT 1'
        );
        $stmt->execute([$userId]);
        $record = $stmt->fetch();

        if (!$record) {
            json_error('No backups found.', 404);
        }

        $file = $this->userDir($userId) . '/' . $record['backup_date'] . '.json';
        if (!file_exists($file)) {
            json_error('Backup file not found on server.', 404);
        }

        // Stream the raw JSON directly — no re-encoding
        header('Content-Type: application/json; charset=utf-8');
        readfile($file);
        exit;
    }

    // ── GET /backup/list ──────────────────────────────────────────────────────
    public function list(array $params): void
    {
        $userId = $params['auth_user_id'];
        $pdo    = Database::connect();

        $stmt = $pdo->prepare(
            'SELECT backup_date, file_size, created_at FROM backups
             WHERE user_id = ?
             ORDER BY backup_date DESC'
        );
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll();

        json_ok(['backups' => $rows]);
    }

    // ── GET /backup/{date} ────────────────────────────────────────────────────
    public function download(array $params): void
    {
        $userId = $params['auth_user_id'];
        $date   = $params['date'] ?? '';

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            json_error('Invalid date format. Use YYYY-MM-DD.');
        }

        $file = $this->userDir($userId) . '/' . $date . '.json';
        if (!file_exists($file)) {
            json_error('Backup not found for that date.', 404);
        }

        header('Content-Type: application/json; charset=utf-8');
        readfile($file);
        exit;
    }

    // ── DELETE /backup/{date} ─────────────────────────────────────────────────
    public function delete(array $params): void
    {
        $userId = $params['auth_user_id'];
        $date   = $params['date'] ?? '';

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            json_error('Invalid date format. Use YYYY-MM-DD.');
        }

        $pdo  = Database::connect();
        $stmt = $pdo->prepare(
            'DELETE FROM backups WHERE user_id = ? AND backup_date = ?'
        );
        $stmt->execute([$userId, $date]);

        if ($stmt->rowCount() === 0) {
            json_error('Backup not found for that date.', 404);
        }

        $file = $this->userDir($userId) . '/' . $date . '.json';
        if (file_exists($file)) {
            unlink($file);
        }

        json_ok(['message' => "Backup for {$date} deleted."]);
    }

    // ── Filesystem helpers ────────────────────────────────────────────────────

    private function userDir(int $userId): string
    {
        return rtrim(Config::get('backup_dir'), '/') . '/' . $userId;
    }

    private function ensureUserDir(int $userId): string
    {
        $dir = $this->userDir($userId);
        if (!is_dir($dir)) {
            mkdir($dir, 0750, true);
        }
        return $dir;
    }

    private function purgeOldBackups(int $userId, string $dir, \PDO $pdo): void
    {
        $retentionDays = (int)Config::get('backup_retention_days', 30);

        // Find backups older than the retention window
        $stmt = $pdo->prepare(
            'SELECT backup_date FROM backups
             WHERE user_id = ?
               AND backup_date < DATE_SUB(CURDATE(), INTERVAL ? DAY)
             ORDER BY backup_date ASC'
        );
        $stmt->execute([$userId, $retentionDays]);
        $old = $stmt->fetchAll();

        foreach ($old as $row) {
            $file = $dir . '/' . $row['backup_date'] . '.json';
            if (file_exists($file)) {
                unlink($file);
            }
            $pdo->prepare(
                'DELETE FROM backups WHERE user_id = ? AND backup_date = ?'
            )->execute([$userId, $row['backup_date']]);
        }
    }
}
