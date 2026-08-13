<?php
declare(strict_types=1);

namespace Finio;

/**
 * File-based fixed-window rate limiter.
 *
 * Shared cPanel hosting has no guaranteed Redis/APCu, so each (bucket, client)
 * pair gets one small JSON counter file under Config::get('rate_limit_dir') —
 * the same storage pattern as backups. flock() serializes the
 * read-increment-write so concurrent requests from the same client can't
 * race past the limit.
 */
class RateLimiter
{
    /**
     * Ends the request with a 429 (via json_error, which exits) once the
     * client has made more than $max requests inside the trailing
     * $windowSeconds. Storage failures fail OPEN — a full disk must not take
     * the whole API down.
     */
    public static function enforce(string $bucket, string $clientKey, int $max, int $windowSeconds): void
    {
        $dir = rtrim((string)Config::get('rate_limit_dir', sys_get_temp_dir() . '/finio-ratelimit'), '/');

        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
            return;
        }

        $safeName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $bucket . '_' . hash('sha256', $clientKey));
        $path     = $dir . '/' . $safeName . '.json';

        $fh = @fopen($path, 'c+');
        if ($fh === false) {
            return;
        }

        if (!flock($fh, LOCK_EX)) {
            fclose($fh);
            return;
        }

        $raw   = stream_get_contents($fh);
        $state = $raw !== false && $raw !== '' ? json_decode($raw, true) : null;
        $now   = time();

        if (!is_array($state) || !isset($state['windowStart'], $state['count']) || $now - $state['windowStart'] >= $windowSeconds) {
            $state = ['windowStart' => $now, 'count' => 0];
        }

        $state['count']++;

        $exceeded   = $state['count'] > $max;
        $retryAfter = $state['windowStart'] + $windowSeconds - $now;

        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($state));
        fflush($fh);
        flock($fh, LOCK_UN);
        fclose($fh);

        // Occasionally sweep old counter files so the directory doesn't grow
        // forever when many distinct IPs hit the API (e.g. scanners/bots).
        if (random_int(1, 200) === 1) {
            self::cleanup($dir);
        }

        if ($exceeded) {
            header('Retry-After: ' . max(1, $retryAfter));
            json_error('Too many requests. Please try again later.', 429);
        }
    }

    /** Best-effort client identifier. No reverse proxy in front of shared hosting, so REMOTE_ADDR is trustworthy. */
    public static function clientIp(): string
    {
        return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }

    private static function cleanup(string $dir): void
    {
        $cutoff = time() - 86400;
        foreach (glob($dir . '/*.json') ?: [] as $file) {
            if (@filemtime($file) < $cutoff) {
                @unlink($file);
            }
        }
    }
}
