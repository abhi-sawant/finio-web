<?php
declare(strict_types=1);

namespace Finio\Middleware;

use Finio\RateLimiter;

/**
 * Generic rate-limit middleware. The route registration supplies the bucket
 * name, limit, window and whether to key on IP or the authenticated user via
 * $options — see public/index.php.
 *
 * 'by' => 'user' reads $params['auth_user_id'], so on a protected route this
 * middleware must be listed AFTER AuthMiddleware::class.
 */
class RateLimitMiddleware
{
    public static function handle(array $params, array $options = []): array
    {
        $bucket = $options['bucket'] ?? 'default';
        $max    = $options['max']    ?? 60;
        $window = $options['window'] ?? 60;
        $by     = $options['by']     ?? 'ip';

        $clientKey = $by === 'user' && isset($params['auth_user_id'])
            ? 'user:' . $params['auth_user_id']
            : 'ip:' . RateLimiter::clientIp();

        RateLimiter::enforce($bucket, $clientKey, $max, $window);

        return $params;
    }
}
