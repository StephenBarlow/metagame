const emailValidator = require('email-validator');
const { assertDirective } = require('graphql');

const PG_UNIQUE_VIOLATION = '23505';
const GQL_UNKNOWN_ERROR = 'ERR_UNKNOWN'
const GQL_UNIQUE_VIOLATION = 'ERR_DUPLICATE';
const GQL_INVALID_INPUT = 'ERR_INVALID_INPUT'
const BYE = -1;
const BYE_LIMIT = 4;

const resolvers = {
  Query: {
    async user(parent, { email }, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getUserByEmail(email.toLowerCase());
        return result;
      } catch (err) {
        console.log(err.stack);
      }
    },
    async league(parent, { leagueID }, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getLeagueById(leagueID);
        return leagueFromRow(result);
      } catch (err) {
        console.log(err.stack);
      }
    },
    async leagues(parent, { userID }, { dataSources }, info) {
      try {
        let result;
        if (userID) {
          result = await dataSources.pg.getLeaguesForUser(userID);
        } else {
          result = await dataSources.pg.getAllLeagues();
        }
        return result.map(function(row) {
          return leagueFromRow(row);
        });
      } catch (err) {
        console.log(err.stack);
      }
    },
    async sportsTeams(parent, args, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getTeams();
        return result.map(function(row) {
          return teamFromRow(row);
        });
      } catch (err) {
        console.log(err.stack);
      }
    },
    async sportsGames(parent, args, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getSportsGames();
        return result.map(function(row) {
          return gameFromRow(row);
        });
      } catch (err) {
        console.log(err.stack);
      }
    },
    async currentPick(parent, {leagueID, userID}, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getCurrentPick(leagueID, userID, parseInt(process.env.CURRENT_WEEK));
        return result.map(function(row) {
          return pickFromRow(row);
        });
      } catch (err) {
        console.log(err.stack);
      }
    }
  },
  Mutation: {
    async createFantasyLeague(parent, args, context, info) {
      const client = await connectionPool.connect();
      try {
        await client.query('BEGIN');

        const { ownerID, name, gameMode } = args.request;
        const leagueResponse = await client.query('INSERT INTO "fantasy_leagues"(owner_id, name, game_mode) VALUES ($1, $2, $3) returning *', [ownerID, name, gameMode]);

        const createdLeague = leagueResponse.rows[0];

        const membershipResponse = await client.query('INSERT INTO memberships (user_id, league_id) VALUES ($1, $2) returning *', [ownerID, createdLeague.id]);

        await client.query('COMMIT');

        return {
          league: {
            id: createdLeague.id,
            name: createdLeague.name,
            owner: createdLeague.owner_id,
            members: [],
            gameMode: createdLeague.game_mode
          }
        };
      } catch(error) {
        console.log('uh ohhhh');
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
    },

    async createUser(parent, { request }, { db }, info) {
      const { email } = request;

      if (!emailValidator.validate(email)) {
        return {
          errors: [{
            code: GQL_INVALID_INPUT,
            message: 'Please provide a valid email address.'
          }]
        };
      }

      try {

        const res = await db.query('INSERT INTO "users"(email) VALUES ($1) returning *', [email]);

        const createdUser = res.rows[0];

        return {
          user: {
            id: createdUser.id,
            email: createdUser.email
          }
        };
      } catch (error) {
        let gqlError = {
          code: GQL_UNKNOWN_ERROR,
          message: 'An unknown error occurred'
        }

        const errorCode = error.code;

        if (errorCode == PG_UNIQUE_VIOLATION) {
          gqlError.code = GQL_UNIQUE_VIOLATION;
          gqlError.message = 'A user with that email address already exists.'
        }

        return {
          errors: [gqlError]
        };

      }
    },

    async addUserToFantasyLeague(parent, args, context, info) {
      const client = await connectionPool.connect();
      try {
        const { userID, leagueID } = args.request;

        const res = await client.query('INSERT INTO memberships(user_id, league_id) VALUES ($1, $2) returning *', [userID, leagueID]);

        const createdUser = res.rows[0];

        return {
          league: null
        };
      } catch (error) {
        let gqlError = {
          code: GQL_UNKNOWN_ERROR,
          message: 'An unknown error occurred'
        }

        const errorCode = error.code;

        // This currently can't happen because there is no uniqueness constraint
        // on this table included in existing migrations.
        if (errorCode == PG_UNIQUE_VIOLATION) {
          gqlError.code = GQL_UNIQUE_VIOLATION;
          gqlError.message = 'That user is already a member of the specified league.'
        }

        return {
          errors: [gqlError]
        };
      } finally {
        client.release();
      }
    },

    async submitPick(parent, { request }, context, info) {
      const dataSources = context.dataSources;
      const validPick = await validatePick(request, dataSources.pg, context);
      if (validPick) {
        const picks = await registerPick(request, dataSources.pg);
        if (!picks) {
          return {
            pick: null,
            errors: [{
              code: GQL_UNKNOWN_ERROR,
              message: 'Storing the pick failed. Please retry.'
            }]
          };
        } else { // Success!
          return {
            pick: picks
          };
        }
      } else {
        return {
          pick: null,
          errors: [{
            code: GQL_INVALID_INPUT,
            message: context.errorMessage
          }]
        };
      }
    }
  },
  SportsGame: {
    async awayTeam(game, args, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getTeam(game.awayTeamShortName, game.sportsLeague);
        return teamFromRow(result);
      } catch (err) {
        console.log(err.stack);
      }
    },
    async homeTeam(game, args, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getTeam(game.homeTeamShortName, game.sportsLeague);
        return teamFromRow(result);
      } catch (err) {
        console.log(err.stack);
      }
    },
    async result(game, args) {
      if (game.awayTeamScore === null || game.homeTeamScore === null) {
        return {
          complete: false
        };
      }
      return {
        complete: true,
        awayTeamScore: game.awayTeamScore,
        homeTeamScore: game.homeTeamScore
      };
    }
  },
  FantasyLeague: {
    async owner(league, args, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getLeagueOwner(league.id, league.ownerID);
        return userFromRow(result);
      } catch (err) {
        console.log(err.stack);
      }
    },
    async users(league, args, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getLeagueMembers(league.id);
        return result.map(function(row) {
          return userFromRow(row);
        });
      } catch (err) {
        console.log(err.stack);
      }
    },
    async picks(league, args, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getPicksForLeague(league.id, parseInt(process.env.REVEALED_WEEK));
        return result.map(function(row) {
          return pickFromRow(row);
        });
      } catch (err) {
        console.log(err.stack);
      }
    }
  },
  Pick: {
    async user(pick, args, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getUserById(pick.userID);
        return result;
      } catch (err) {
        console.log(err.stack);
      }
    },
    async league(pick, args, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getLeagueById(pick.leagueID);
        return leagueFromRow(result);
      } catch (err) {
        console.log(err.stack);
      }
    },
    async team(pick, args, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getTeamById(pick.teamID);
        return teamFromRow(result);
      } catch (err) {
        console.log(err.stack);
      }
    },
  },
  User: {
    async fantasyLeagues(user, args, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getLeaguesForUser(user.id);
        return result.map(function(row) {
          return leagueFromRow(row);
        });
      } catch (err) {
        console.log(err.stack);
      }
    },

    async displayName(user, { leagueID }, { dataSources }, info) {
      try {
        const result = await dataSources.pg.getUserDisplayNameForLeague(user.id, leagueID);
        return result.display_name;
      } catch (err) {
        console.log(err.stack);
      }
    },
  }
};

async function registerPick(pickRequest, pg) {
  const { leagueID } = pickRequest;

  try {
    const result = await pg.getLeagueById(leagueID);
    if (!result) {
      // Fantasy league not found
      return false;
    } else if (result.game_mode === 'PICK_TWO') {
      return registerPickTwoPick(pickRequest, pg);
    } else {

      // Unrecognized game mode
      return false;
    }
  } catch (err) {
    console.log(err.stack);
    return false;
  }
}

async function registerPickTwoPick(pickRequest, pg) {
  const { userID, leagueID, teamIDs, week } = pickRequest;

  try {
    const result = await pg.submitPicks(userID, leagueID, teamIDs, week);
    return result.map(function(row) {
      return pickFromRow(row);
    });
  } catch (err) {
    console.log(err.stack);
  }
}

async function validatePick(pickRequest, pg, context) {
  const { leagueID } = pickRequest;

  try {
    const result = await pg.getLeagueById(leagueID);
    if (!result) {
      return false;
    } else if (result.game_mode === 'PICK_TWO') {
      return await validatePickTwoPick(pickRequest, pg, context);
    } else {
      return false;
    }
  } catch (err) {
    console.log(err.stack);
    return false;
  }
}

async function validatePickTwoPick(pickRequest, pg, context) {
  const { userID, leagueID, teamIDs, week } = pickRequest;

  // Need exactly two teams
  if (teamIDs.length !== 2) {
    context.errorMessage = 'Must select exactly two teams';
    return false;
  }
  
  // Can't double-pick a team (unless BYE)
  if (teamIDs[0] === teamIDs[1] && teamIDs[0] !== BYE) {
    context.errorMessage = 'Must select two different teams (unless BYE)';
    return false;
  }

  // Can't pick BYE plus an actual team
  if (teamIDs[0] !== teamIDs[1] && teamIDs.includes(BYE)) {
    context.errorMessage = "Can't select one team and BYE";
    return false;
  }

  // Get all games for this week
  const weekGames = await pg.getSportsGamesForWeek(process.env.CURRENT_SEASON, week);
  const allTeams = await pg.getTeams();

  // Make sure both picked teams have games this week
  let pickedGames = [];
  for (const teamID of teamIDs) {
    if (teamID === BYE) break;
    const currentTeam = allTeams.find(team => team.id === parseInt(teamID));
    const hasGame = weekGames.find(game => (game.away_team_short_name === currentTeam.short_name || game.home_team_short_name === currentTeam.short_name));
    if (hasGame) {
      pickedGames.push(hasGame);
    } else {
      context.errorMessage = `Team ${currentTeam.short_name} does not appear to have a game this week! If this is incorrect, please email Stephen to make your pick.`
      return false;
    }
  }

  // Make sure neither game has already started
  const now = new Date();
  for (const game of pickedGames) {
    const gameDate = new Date(game.start_time);
    if (gameDate < now) {
      context.errorMessage = 'At least one selected game appears to have already started! If this is incorrect, please email Stephen to make your pick.'
      return false;
    }
  }

  const pastPicks = await pg.getPicksForMember(userID, leagueID, week);
  
  // Check if any picked team has been picked before
  let bye_count = 0;
  for (const pick of pastPicks) {
    if (teamIDs.includes(pick.team_id)) {
      // Check if BYE limit is already reached
      if (teamIDs.includes(BYE)){
        bye_count += 1;
        if (bye_count === BYE_LIMIT) {
          context.errorMessage = 'You have already used all byes this season!'
          return false;
        }
      } else {
        // At least one of these teams has already been picked by this player
        context.errorMessage = 'You have already picked at least one of these teams! If this is incorrect, please email Stephen to make your pick.'
        return false;
      }
    }
  }

  // Looks like a valid pick
  return true;
}

function pickFromRow(row) {
  return {
    id: row.id,
    week: row.week,
    isInvalidated: !(row.invalidated_at === null),

    // Not schema fields, but used by subresolvers
    userID: row.user_id,
    leagueID: row.league_id,
    teamID: row.team_id
  }
}

function userFromRow(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
  }
}

function leagueFromRow(row) {
  return {
    // Sometimes the row is a MEMBERSHIP JOIN,
    // not a LEAGUE
    id: (row.league_id ? row.league_id : row.id),
    name: row.name,
    gameMode: row.game_mode,
    season: row.season,
    currentWeek: parseInt(process.env.CURRENT_WEEK) || 1,
    revealedWeek: parseInt(process.env.REVEALED_WEEK) || 0,

    // Not schema fields, but used by subresolvers
    ownerID: row.owner_id
  };
}

function teamFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    sportsLeague: row.sports_league
  };
}

function gameFromRow(row) {
  return {
    id: row.id,
    sportsLeague: row.sports_league,
    startsAt: row.start_time,
    week: row.week,

    // Not schema fields, but used by subresolvers
    awayTeamShortName: row.away_team_short_name,
    homeTeamShortName: row.home_team_short_name,
    awayTeamScore: row.away_team_score,
    homeTeamScore: row.home_team_score
  };
}

exports.resolvers = resolvers;
