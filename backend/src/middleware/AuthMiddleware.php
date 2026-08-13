<?php
declare(strict_types=1);

namespace Finio\Middleware;

use Finio\Database;
use function Finio\jwt_decode;
use function Finio\json_error;

/**
 * Validates the JWT from the Authorization header.
 * Injects 'auth_user_id', 'auth_email', 'auth_name' into the $params array
 * that is forwarded to the controller action.
 */
class AuthMiddleware
{
    public static function handle(array $params): array
    {
        $payload = jwt_decode();

        if ($payload === null) {
            json_error('Unauthorized. Please log in.', 401);
        }

        $userId = (int)$payload->sub;

        // Stateless JWTs can't be revoked on their own, so a token's 'tv' claim is checked
        // against the user's current token_version on every request. A password change/reset
        // bumps that column, which invalidates every token issued before it; a deleted user
        // has no row left to match, which invalidates it too.
        $stmt = Database::connect()->prepare('SELECT token_version FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();

        if ($row === false || (int)$row['token_version'] !== (int)($payload->tv ?? 0)) {
            json_error('Session expired. Please log in again.', 401);
        }

        $params['auth_user_id'] = $userId;
        $params['auth_email']   = $payload->email;
        $params['auth_name']    = $payload->name;

        return $params;
    }
}
