<?php
declare(strict_types=1);

namespace Finio;

/**
 * Loads and caches the config file that lives OUTSIDE public_html.
 *
 * The config file is expected at:
 *   /home/CPANEL_USER/finio-config/config.php
 *
 * We find it by walking up from the project root at runtime.
 */
class Config
{
    private static array $data = [];

    public static function get(string $key, mixed $default = null): mixed
    {
        if (empty(self::$data)) {
            self::load();
        }
        return self::$data[$key] ?? $default;
    }

    private static function load(): void
    {
        // Use the HOME environment variable — always set correctly on Linux shared hosting.
        // Falls back to walking up the directory tree if HOME is unavailable.
        $homeDir = $_SERVER['HOME'] ?? getenv('HOME');

        if (empty($homeDir)) {
            // Fallback: walk up from src/ → project root → home dir
            // __DIR__  = ~/api.finio.slowatcoding.com/src
            // dirname once  = ~/api.finio.slowatcoding.com
            // dirname twice = ~/ (home dir)
            $homeDir = dirname(dirname(__DIR__));
        }

        $configPath = rtrim($homeDir, '/') . '/finio-config/config.php';

        if (!file_exists($configPath)) {
            http_response_code(500);
            echo json_encode(['error' => 'Server configuration file not found. Check setup guide.']);
            exit;
        }

        self::$data = require $configPath;
    }
}
