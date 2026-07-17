# wp-roundtable

**The Roundtable WordPress SDK.** A drop-in that adds a community **discussions** admin screen to
any WordPress plugin and talks to the [Roundtable hub](https://github.com/epicwp/roundtable-hub)
endpoints. The consuming plugin wires in its own user validation (e.g. a licence check) via a
callback; the SDK handles the UI, the endpoint client, and rendering every chat state.

Open-source when ready.

## Related repositories

| Repo | What it is |
|------|-----------|
| **[epicwp/roundtable](https://github.com/epicwp/roundtable)** | Umbrella — specs, the **API contract** this SDK consumes, engineering standards |
| **[epicwp/roundtable-hub](https://github.com/epicwp/roundtable-hub)** | The hub — the backend this SDK talks to |
| **[epicwp/polylang-automatic-ai-translation](https://github.com/epicwp/polylang-automatic-ai-translation)** | PLLAT — the first plugin to embed this SDK |

## Standards

PHP 8.1+ · PHPCS (Oblak) · PHPStan level 6 — identical to PLLAT. See
[engineering standards](https://github.com/epicwp/roundtable/blob/main/docs/standards.md).

```bash
composer install
composer cs        # phpcs
composer cs:fix    # phpcbf
composer stan      # phpstan
composer test      # phpunit
```

## Consuming this SDK

A consuming plugin pulls it in with Composer:

```bash
composer require epicwp/wp-roundtable
```

While this repo is **private**, add a VCS `repositories` entry (with auth) in the plugin's
`composer.json`; once it goes public, install straight from Packagist.

**Design principles that keep it safe to bundle into a distributed plugin:**

- **No runtime dependencies.** The SDK leans on WordPress core (HTTP via `wp_remote_*`, i18n,
  options) rather than pulling libraries like Guzzle — so there is virtually nothing to collide
  with another plugin's bundled `vendor/`.
- **Scoping is the consumer's job.** Isolating the SDK's namespace to avoid "class already
  declared" across plugins (e.g. via Mozart / jetpack-autoloader) happens in the **consuming
  plugin's build** — PLLAT already has that pipeline. This SDK stays a plain library.

## Bootstrapping (consumer)

```php
use EpicWP\Roundtable\Roundtable;
use EpicWP\Roundtable\Config;

Roundtable::mount(
    new Config(
        projectApiKey: 'pk_...',   // your project key
        consumer:      $myConsumer, // implements EpicWP\Roundtable\Consumer
        agentName:     'Roundtable', // default; set to your own assistant's name
        projectName:   '',           // default; set to your product's display name
    ),
    'my-plugin-discussions',        // your admin page slug
);
```

The SDK's REST gate only requires the `read` capability (any logged-in user); `$myConsumer->isUserAllowed()` is the real authorization boundary, so gate any role/capability restriction (e.g. admins-only) there.

