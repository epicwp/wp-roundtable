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
