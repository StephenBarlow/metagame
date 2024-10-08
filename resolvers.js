const emailValidator = require('email-validator');
const { assertDirective } = require('graphql');

const PG_UNIQUE_VIOLATION = '23505';
const GQL_UNKNOWN_ERROR = 'ERR_UNKNOWN'
const GQL_UNIQUE_VIOLATION = 'ERR_DUPLICATE';
const GQL_INVALID_INPUT = 'ERR_INVALID_INPUT'
const BYE = '-1';
const BYE_LIMIT = 4;
const FINAL_WEEK = 18;

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
    async league(parent, { leagueID }, context, info) {
      let [league, users, teams] = await Promise.all([
        context.dataSources.pg.getLeagueById(leagueID),
        context.dataSources.pg.getLeagueMembers(leagueID),
        context.dataSources.pg.getTeams()
      ]);
      let picks;
      if (league.season === process.env.CURRENT_SEASON) {
        picks = await context.dataSources.pg.getPicksForLeague(leagueID);
      } else {
        picks = await context.dataSources.pg.getPicksForLeague(leagueID, true);
      }
      context.picks = picks;
      context.users = users;
      context.teams = teams;
      return leagueFromRow(league);
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
    async sportsGames(parent, { season }, { dataSources }, info) {
      try {
        let [result, allTeams] = await Promise.all([
          dataSources.pg.getSportsGames(season ? season : process.env.CURRENT_SEASON),
          dataSources.pg.getTeams()
        ]);
        return gamesFromRows(result, allTeams);
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
    },
    async currentSeason(parent, {league}) {
      return process.env.CURRENT_SEASON;
    }
  },
  Mutation: {
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
    async users(league, args, context, info) {
      if (context.users) {
        return context.users.map(function(row) {
          return userFromRow(row);
        });
      } else {
        throw new Error('User list not found');
      }

    },
    async picks(league, args, context, info) {
      if (context.picks) {
        return context.picks.map(function(row) {
          return pickFromRow(row);
        });
      } else {
        throw new Error('Pick list not found');
      }

    }
  },
  Pick: {
    async user(pick, args, context, info) {
      if (context.users) {
        return userFromRow(context.users.find(user => user.user_id === pick.userID));
      } else {
        try {
          const result = await context.dataSources.pg.getLeagueMembers(pick.leagueID);
          return userFromRow(result.find(user => user.id === pick.userID));
        } catch (err) {
          console.log(err.stack);
        }
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
    async team(pick, args, context, info) {
      if (pick.teamID === -1) {
        return {
          id: 'bye',
          name: 'BYE',
          shortName: 'BYE',
          sportsLeague: 'NFL'
        };
      }
      if (context.teams) {
        return teamFromRow(context.teams.find(row => row.id === pick.teamID));
      } else {
        try {
          const result = await context.dataSources.pg.getTeams();
          return teamFromRow(result.find(row => row.id === pick.teamID));
        } catch (err) {
          console.log(err.stack);
        }
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

      // Don't bother with db query if we already have the data
      if (user.displayName) {
        return user.displayName;
      }

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

  // Make sure the teams aren't playing each other (unless week 18)
  if (pickedGames.length) {
    if (pickedGames[0].id === pickedGames[1].id && week < FINAL_WEEK) {
      context.errorMessage = `Can't select two teams playing each other (except in week ${FINAL_WEEK}).`
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

  const pastPicks = await pg.getPicksForMember(userID, leagueID);

  // Check if any picked team has been picked before
  let bye_count = 0;
  for (const pick of pastPicks) {
    if (teamIDs.includes(pick.team_id.toString()) && pick.week !== week) {
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

  // Check if this player previously picked a team
  // this week that already started their game
  const thisWeekPicks = pastPicks.filter(pick => (pick.week === week));
  if (thisWeekPicks) {
    let pickedTeams = [];
    for (const pick of thisWeekPicks) {
      pickedTeams.push(allTeams.find(team => team.id === pick.team_id));
    }

    // Get the two games for the two teams from this
    // player's previous submission
    for (const pickedTeam of pickedTeams) {

      // This player's previous pick was to take a bye
      if (!pickedTeam) {
        break;
      }

      const pickedGame = weekGames.find(game => (game.away_team_short_name === pickedTeam.short_name || game.home_team_short_name === pickedTeam.short_name));
      if (pickedGame) {
        const gameDate = new Date(pickedGame.start_time);
        if (gameDate < now) {
          context.errorMessage = 'At least one team from your PREVIOUS submission has already started their game. If this is incorrect, please email Stephen to make your pick.'
          return false;
        }
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
    id: row.user_id,
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

function gamesFromRows(rows, allTeams) {
  let games = [];

  for (const row of rows) {
    const awayTeam = allTeams.find(team => row.away_team_short_name === team.short_name);
    const homeTeam = allTeams.find(team => row.home_team_short_name === team.short_name);

    games.push({
      id: row.id,
      sportsLeague: row.sports_league,
      startsAt: row.start_time,
      week: row.week,
      awayTeam: teamFromRow(awayTeam),
      homeTeam: teamFromRow(homeTeam),

      // Not schema fields, but used by subresolvers
      awayTeamScore: row.away_team_score,
      homeTeamScore: row.home_team_score
    });
  }

  return games;
}

exports.resolvers = resolvers;
