# Metagame: A GraphQL backend for picking games

Currently supports a single custom ruleset called "Pick 2".

Uses the `db-migrate` library for db migrations:

```
bun install
bunx --bun --no-install db-migrate -e prod up
```

The service runs with Bun and uses `bun.lock` for reproducible dependency
installs. Bun 1.3.9 or newer is expected.

## Admin site

The service exposes an administrative interface at `/admin` on the same host as
the GraphQL API. It uses HTTP Basic Authentication and is disabled unless
`ADMIN_PASSWORD` is set. The username defaults to `admin` and can be changed
with `ADMIN_USERNAME`.

```sh
ADMIN_USERNAME=admin
ADMIN_PASSWORD='use-a-long-random-password'
```

Only use the admin site over HTTPS. Render terminates HTTPS for deployed web
services. Admin responses are not cacheable, cross-origin form submissions are
rejected, and there are no delete actions. Existing games and picks can only be
modified one at a time. CSV schedule imports preview the parsed games first and
only add games that are not already present; they never overwrite or delete an
existing game.

The admin interface supports:

- adding games and editing one game's schedule or score;
- previewing and importing NFL schedule CSV in
  `week,start_time,away_team_short_name,home_team_short_name` format;
- viewing all picks, including invalidated picks, by league and week;
- invalidating one pick or creating one pick for a league member;
- creating leagues and managing active-league memberships;
- creating users.

No database migration is required for the admin site.
