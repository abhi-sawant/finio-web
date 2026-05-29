<?php
declare(strict_types=1);

namespace Finio;

/**
 * Minimal front-controller router.
 *
 * Supports:
 *   - HTTP verbs: GET, POST, PUT, DELETE
 *   - Named path params:  /backup/{date}  → $params['date']
 *   - Middleware classes that must expose a static handle() method
 */
class Router
{
    /** @var array<int, array{method:string, pattern:string, handler:array, middleware:array}> */
    private array $routes = [];

    // ── Route registration helpers ────────────────────────────────────────────

    public function get(string $path, array $handler, array $middleware = []): void
    {
        $this->addRoute('GET', $path, $handler, $middleware);
    }

    public function post(string $path, array $handler, array $middleware = []): void
    {
        $this->addRoute('POST', $path, $handler, $middleware);
    }

    public function put(string $path, array $handler, array $middleware = []): void
    {
        $this->addRoute('PUT', $path, $handler, $middleware);
    }

    public function delete(string $path, array $handler, array $middleware = []): void
    {
        $this->addRoute('DELETE', $path, $handler, $middleware);
    }

    private function addRoute(string $method, string $path, array $handler, array $middleware): void
    {
        $this->routes[] = [
            'method'     => $method,
            'pattern'    => $this->buildPattern($path),
            'handler'    => $handler,
            'middleware' => $middleware,
        ];
    }

    // ── Dispatch ─────────────────────────────────────────────────────────────

    public function dispatch(): void
    {
        $method = $_SERVER['REQUEST_METHOD'];
        $uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        $uri    = '/' . trim($uri, '/');

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }

            if (!preg_match($route['pattern'], $uri, $matches)) {
                continue;
            }

            // Named captures become $params
            $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);

            // Run middleware (e.g. AuthMiddleware::handle($params))
            foreach ($route['middleware'] as $mwClass) {
                $params = $mwClass::handle($params);
            }

            // Call the controller
            [$controllerClass, $action] = $route['handler'];
            (new $controllerClass())->$action($params);
            return;
        }

        // Nothing matched
        http_response_code(404);
        echo json_encode(['error' => 'Route not found.']);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Convert /backup/{date} to a named-capture regex. */
    private function buildPattern(string $path): string
    {
        $pattern = preg_replace('/\{(\w+)\}/', '(?P<$1>[^/]+)', $path);
        return '#^' . $pattern . '$#';
    }
}
