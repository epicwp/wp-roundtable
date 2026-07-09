<?php
declare(strict_types=1);

// Minimal test-only doubles of WordPress's WP_REST_Request/WP_REST_Response.
//
// wordpress-stubs (php-stubs/wordpress-stubs) provide these classes for PHPStan's static
// analysis only — they are never actually loaded at PHPUnit runtime, since no real
// WordPress is booted. MessageController type-hints both classes, so without a stand-in
// here the plain PHPUnit run would fatal on "Class WP_REST_Request not found". The real
// classes ship with WordPress itself in a live install.

if (! class_exists('WP_REST_Request')) {
    final class WP_REST_Request
    {
        /** @var array<string, string> */
        private array $headers = [];

        /** @var array<string, mixed> */
        private array $params = [];

        public function set_header(string $name, string $value): void
        {
            $this->headers[strtolower($name)] = $value;
        }

        public function get_header(string $name): ?string
        {
            return $this->headers[strtolower($name)] ?? null;
        }

        public function set_param(string $name, mixed $value): void
        {
            $this->params[$name] = $value;
        }

        public function get_param(string $name): mixed
        {
            return $this->params[$name] ?? null;
        }
    }
}

if (! class_exists('WP_REST_Response')) {
    final class WP_REST_Response
    {
        public function __construct(
            private mixed $data = null,
            private int $status = 200,
        ) {
        }

        public function get_data(): mixed
        {
            return $this->data;
        }

        public function get_status(): int
        {
            return $this->status;
        }
    }
}
