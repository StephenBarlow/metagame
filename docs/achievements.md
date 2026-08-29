# Achievements

## Current ideas

Achievements are league-scoped milestones. A player can earn a given
achievement once in each league, but never more than once in the same league.

| Name | Description |
| --- | --- |
| Cat Person | Pick two teams with cat mascots in the same week. |
| For the Birds | Pick two teams with bird mascots in the same week. |
| 7-10 Split | Split with two teams whose games finish with margins of seven and ten points. (Repeatable) |
| Yarrr | Pick the Bucs and Raiders in the same week. |
| Empire State of Mind | Pick any two of the Bills, Giants, and Jets in the same week. |
| There Go That Horse | Pick the Broncos and Colts in the same week. |
| Ohio Bowl | Pick the Browns and Bengals in the same week. |
| What is this, Soccer?! | Pick a tie. (Repeatable) |
| Florida Man (or Woman!) | Pick two Florida teams in the same week. |
| Buffalo Wings | Pick the Bills and a bird team in the same week. |
| Big Bust | Split when one of your teams would have earned you 30 or more. |
| Blue Collar | Pick the Packers and Steelers in the same week. |
| Get the Horns | Pick the Rams and Vikings in the same week. |
| Don't Mess | Pick the Cowboys and Texans in the same week. |
| Thanks I Guess | Score 5 points or fewer with a double-win. (Repeatable) |
| Larry Legend | Achieve a total score of exactly 33 points. |
| Presidential Pick | Pick the Commanders and Chiefs in the same week. |
| Damn Fine Pick | Score 60 points or more in a single week. (Repeatable) |
| Bye Bye | Take a bye two weeks in a row. |
| Deep Purple | Pick the Ravens and Vikings in the same week. |
| Gold Rush | Pick the 49ers and Saints in the same week. |
| Heated Rivalry | Pick two teams from the same division in the same week. |
| The Cheese Stands Alone | Be the only player to pick the Packers in a given week. |
| Pickmas | Pick two teams from games on December 24th and/or 25th. |
| Picksgiving | Pick two teams from games on Thanksgiving. |
| Go Wide | In a single week, pick teams from both a Thursday game and a Monday game. |
| Slow Start | Open the season with a bye. |
| Leader of the Pack | End any week alone in first place. |
| Slow Finish | End the season with a bye. |
| Twinsies | End any week after week 3 with the same total nonzero score as another player. |
| True Nonconformist | In a single week, pick teams from two games that no other player picks from (week 15 or earlier). |
| Barely Would've Mattered | Split with your teams winning or losing by a combined margin of 5 or less. (Repeatable) |
| Road Warriors | Achieve a double win with two away teams. (Repeatable) |
| Homewrecked | Achieve a double loss with two home teams. (Repeatable) |
| Silver Lining | Achieve a double-loss with your favorite team. |
| Best Week Ever | Achieve a double-win with your favorite team. |
| Worst of All Worlds | Split when picking your favorite team because they lost. |
| Bittersweet Split | Split when picking your favorite team because they won. |
| Absolute Drubbing | Score with one of your picked games ending in a shutout. (Repeatable) |
| World Traveler | Twice this season, pick a team from a game that's played outside the United States. |
| Mirror Image | Pick two teams whose games finish with the exact same final score. (Repeatable) |
| Indecisive | Submit at least three unique non-BYE picks for a single week. |
| The Long Game | Submit a pick at least four weeks in advance and don't replace it. |
| Buzzer Beater | Submit a pick within 5 minutes of one of your teams starting their game. |
| Slim Pickings | Submit a pick when fewer than five games remain available to pick from. |
| Sheep | Submit the exact same non-BYE picks as at least five other players. |
| Opposition Research | Pick the opponent of any single team at least five times. |
| Brady Bunch | Pick the Patriots and Bucs in the same week. |
| Six Sevennn! | Pick a double-win with one team winning by six and the other by seven. (Repeatable) |
| Brown Bear | Pick the Browns and Bears in the same week. |
| Bird Brain | For the second time in a season, pick two teams with bird mascots. |
| Toxoplasmosis | For the second time in a season, pick two teams with cat mascots. |
| Country and Western | Pick the Titans and Cowboys in the same week. |
| California Love | Pick any two of the 49ers, Rams, and Chargers in a single week. |
| Local Maximum | Score the highest possible number of points in a given week. |
| Fee-fi-fo-fum | Pick the Giants and Titans in the same week. |
| Family Manning | In a single week, pick any two of the Colts, Giants, and Saints. |
| Good and Evil | Pick the Saints and Raiders in the same week. |
| Desperado | Pick the Cowboys and Eagles in the same week. |
| Vatican City | Pick the Cardinals and Saints in the same week. |
| High Altitude | Pick the Broncos and Jets in the same week. |
| Hot Streak | Score points for eight consecutive weeks (ignoring byes). |
| Cold Streak | Split for eight consecutive weeks (ignoring byes). |

The descriptions are deliberately player-facing. The evaluator should use a
stable key and structured condition data rather than parsing the description.

## Proposed data model

### `achievements`

One row per definition, independent of any league:

- `id`
- stable unique `key` (for example, `CAT_PERSON`)
- `name`
- `description`
- `icon_id` (an Iconify ID such as `tabler:number-33-small`)
- `condition_config` (`jsonb`)
- `evaluator`
- `evaluation_phase` (`pick_locked`, `week_finalized`, or `season_finalized`)
- `scope` (for example, `player_week` or `league_week`)
- `repeatable` (boolean, default `false`)
- `active`, `created_at`, and `updated_at`

`evaluator` should be a small registry implemented in application code,
not arbitrary code stored in the database. Example configurations include:

```json
{ "tag": "cat", "picked_team_count": 2 }
{ "team_short_names": ["TB", "LV"] }
{ "margins": [7, 10] }
{ "tag": "bird", "required_team_short_name": "BUF" }
```

### Team metadata

The current `teams` table has names and abbreviations but no mascot or
geographic metadata. A separate table such as `sports_team_tags(team_id,
tag)` is a better fit than adding one column per concept: a team can have
multiple tags (`bird`, `Florida`, and so on). Tags used by conditions should
be stable identifiers, not display text.

### `league_achievements`

This associates definitions with leagues and makes applicability explicit:

- `league_id`
- `achievement_id`
- optional copied `condition_config`/version if a league needs a frozen
  definition
- `enabled_at`

Add a unique constraint on `(league_id, achievement_id)`. League creation can
enable the default set, while an admin can choose which achievements apply to
an individual league.

### `achievement_awards`

One immutable award per player, achievement, and league:

- `id`
- `league_id`
- `achievement_id`
- `user_id`
- `week`
- `awarded_at`
- `award_key`, using one season-wide key for non-repeatable achievements and a
  week-specific key for repeatable achievements
- `evidence` (`jsonb`), containing the pick IDs, team IDs, game IDs, and final
  scores/margins used by the evaluator

Add a unique constraint on `(league_id, achievement_id, user_id, award_key)`.
The database constraint is the final protection against awarding an
achievement twice, including if an award job is retried. For a
non-repeatable achievement, the award processor uses the same season-wide
`award_key` for every attempt; for a repeatable achievement, it uses a
week-specific key.

## Awarding and week gating

Do not evaluate achievements in `submitPick`. A pick can be replaced before
its deadline, and result-based achievements cannot be known until games finish.

Introduce a per-league/week lifecycle record, for example
`league_week_status`:

- `league_id`, `week` (unique together)
- `picks_locked_at`
- `results_finalized_at`
- `achievements_awarded_at`

The normal flow would be:

1. Picks remain editable under the existing game-start rules.
2. At the league’s pick deadline, mark the week’s picks locked. This can be
   automatic from schedule data or an explicit admin action.
3. Once every relevant game has a final score, mark results finalized. A
   manual admin action is acceptable initially because scores are currently
   entered through the admin page.
4. In one transaction, select the non-invalidated picks for that league/week,
   evaluate each enabled achievement, insert matching `achievement_awards`
   with `ON CONFLICT DO NOTHING`, and mark `achievements_awarded_at`.
5. Store the evidence snapshot on each award. Later edits to team metadata,
   schedules, scores, or picks should not change what an already-awarded
   achievement meant.

The finalization operation must be idempotent. A retry should not create a
second award, and a partially failed run should be safe to run again. If a
commissioner needs to correct an official result, the safest model is an
explicit administrative re-finalization/reconciliation operation rather than
silently recalculating historical awards.

## Evaluator shape

Use a registry such as:

```js
const achievementEvaluators = {
  sameWeekTeamTags: evaluateSameWeekTeamTags,
  exactTeams: evaluateExactTeams,
  scoreMargins: evaluateScoreMargins,
  tiedGame: evaluateTiedGame
};
```

Each evaluator receives the frozen week context (final picks, games, teams,
and tags) and returns either no match or an evidence object. It should not
write directly to the database. A separate awarding step handles uniqueness,
transactions, and auditability.

This keeps the initial achievement set straightforward while leaving room for
future conditions such as streaks or season totals without turning the schema
into a collection of achievement-specific columns.

## Suggested first implementation slice

1. Add the tables and team tags through migrations.
2. Seed the definitions and default league associations.
3. Add a deliberately explicit admin action to finalize a league/week and run
   awards; automate it only after the rules and schedule behavior are proven.
4. Add read-only GraphQL fields for league achievements and a user’s awards.
5. Add tests for every condition, duplicate-award retries, changed-before-close
   picks, invalidated picks, and incomplete weeks.

## One-off evaluation job

Achievement evaluation runs from the same build artifact as the API:

```sh
bun run achievements:evaluate -- pick-locked --league-id 42
bun run achievements:evaluate -- week-finalized --league-id 42
```

The job has two modes:

- `pick-locked` evaluates `pick_locked` achievements. With no explicit
  `--week`, it evaluates the league's effective revealed week.
- `week-finalized` reconciles both `pick_locked` and `week_finalized`
  achievements. With no explicit `--week`, it evaluates the week immediately
  before the league's effective current week. When that is the final scheduled
  week, it also evaluates `season_finalized` achievements.

Both modes accept `--week N` and `--dry-run`. A run processes one league,
skips concluded leagues, and rejects weeks that have not reached the requested
lifecycle phase. Finalized-week runs also reject weeks with incomplete game
scores.

The evaluator functions return evidence but do not write to the database.
The job inserts awards afterward with `ON CONFLICT DO NOTHING`. Non-repeatable
achievements use a season-wide award key; repeatable achievements use a
week-specific award key. Consequently, retrying the same one-off job is safe.

If a league has explicit rows in `league_achievements`, only active associated
definitions are evaluated. Until associations are configured for a league,
all globally active definitions are treated as enabled.

When a league's week settings are changed in the admin panel, advancing its
revealed week starts a `pick-locked` one-off job. Advancing its current week
starts a `week-finalized` reconciliation job for the prior week. Configure the
API service with `RENDER_API_KEY` and `RENDER_BASE_SERVICE_ID` to enable those
job launches; `RENDER_ONE_OFF_JOB_PLAN_ID` is optional.
