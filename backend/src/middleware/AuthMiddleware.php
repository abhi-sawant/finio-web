<?php
declare(strict_types=1);

namespace Finio\Middleware;

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

        $params['auth_user_id'] = (int)$payload->sub;
        $params['auth_email']   = $payload->email;
        $params['auth_name']    = $payload->name;

        return $params;
    }
}
