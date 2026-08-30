const GQL_UNKNOWN_ERROR = 'ERR_UNKNOWN';
const GQL_INVALID_INPUT = 'ERR_INVALID_INPUT';

const MESSAGE_VALUE_TYPES = {
  CATALOG_VALUE: 'catalog_value',
  ADJECTIVE: 'adjective',
  LEAGUE_MEMBER: 'league_member',
  TEAM: 'team'
};
const MESSAGE_VALUE_TYPES_BY_DB_VALUE = Object.fromEntries(
  Object.entries(MESSAGE_VALUE_TYPES).map(([graphqlValue, databaseValue]) => [databaseValue, graphqlValue])
);

async function messageTemplates(parent, args, { dataSources }) {
  try {
    const rows = await dataSources.pg.getMessageTemplates();
    return messageTemplatesFromRows(rows);
  } catch (err) {
    console.log(err.stack);
    return [];
  }
}

async function messageValues(parent, { kind }, { dataSources }) {
  try {
    const rows = await dataSources.pg.getMessageValues(kind && MESSAGE_VALUE_TYPES[kind]);
    return rows.map(messageValueFromRow);
  } catch (err) {
    console.log(err.stack);
    return [];
  }
}

async function submitMessage(parent, { request }, { dataSources }) {
  const userID = positiveInteger(request.userID);
  const leagueID = positiveInteger(request.leagueID);
  const templateID = positiveInteger(request.templateID);
  const week = Number(request.week);
  if (!userID || !leagueID || !templateID || !Number.isInteger(week) || week < 1) {
    return messageError('User, league, template, and week must be valid positive integers.');
  }
  if (!Array.isArray(request.selections) || request.selections.length === 0) {
    return messageError('A value must be submitted for every message slot.');
  }

  try {
    const [league, authorMembership, author, templateRows] = await Promise.all([
      dataSources.pg.getLeagueById(leagueID),
      dataSources.pg.getMembership(userID, leagueID),
      dataSources.pg.getUserById(userID),
      dataSources.pg.getMessageTemplateById(templateID)
    ]);
    if (!league) return messageError('Fantasy league not found.');
    if (isLeagueConcluded(league)) return messageError('Messages cannot be submitted to a concluded league.');
    if (!authorMembership || !author) return messageError('User is not an active member of this league.');

    const currentWeek = effectiveLeagueWeek(league, 'current_week', 'CURRENT_WEEK', 1);
    if (week !== currentWeek) {
      return messageError(`Messages may only be submitted for the current week (${currentWeek}).`);
    }

    const template = messageTemplatesFromRows(templateRows)[0];
    if (!template) return messageError('Message template not found or inactive.');
    if (request.selections.length !== template.slots.length) {
      return messageError('A value must be submitted for every message slot.');
    }

    const seenSlotIDs = new Set();
    const storedSelections = [];
    const responseSelections = [];
    const renderedValues = new Map();
    for (const requestedSelection of request.selections) {
      const slotID = positiveInteger(requestedSelection.slotID);
      const valueID = positiveInteger(requestedSelection.valueID);
      const valueType = requestedSelection.valueType;
      if (!slotID || !valueID || !MESSAGE_VALUE_TYPES[valueType]) {
        return messageError('Each message selection must contain a valid slot, type, and value.');
      }
      if (seenSlotIDs.has(slotID)) return messageError('Each message slot may be selected only once.');
      seenSlotIDs.add(slotID);

      const slot = template.slots.find(candidate => Number(candidate.id) === slotID);
      if (!slot) return messageError('A submitted slot does not belong to the selected template.');
      if (!slot.valueTypes.includes(valueType)) {
        return messageError(`The selected value type is not allowed for the ${slot.prompt || slot.key} slot.`);
      }

      const resolved = await resolveSubmittedMessageValue(
        dataSources.pg,
        league,
        leagueID,
        valueType,
        valueID
      );
      if (resolved.error) return messageError(resolved.error);

      storedSelections.push({
        templateSlotID: slotID,
        messageValueID: resolved.messageValueID,
        leagueMembershipID: resolved.leagueMembershipID,
        teamID: resolved.teamID
      });
      responseSelections.push({ slot, value: resolved.value });
      renderedValues.set(slot.key, resolved.text);
    }

    const renderedText = renderMessage(template, renderedValues);
    if (!renderedText) return messageError('The selected template is not configured correctly.');
    const inserted = await dataSources.pg.submitMessage({
      leagueID,
      week,
      authorMembershipID: authorMembership.id,
      templateID,
      renderedText
    }, storedSelections);

    return {
      message: {
        id: inserted.id,
        week: inserted.week,
        createdAt: new Date(inserted.created_at).toISOString(),
        author: messageUser(author, authorMembership),
        template,
        selections: responseSelections
      },
      errors: []
    };
  } catch (err) {
    console.log(err.stack);
    return {
      message: null,
      errors: [{ code: GQL_UNKNOWN_ERROR, message: 'Failed to submit message. Please retry.' }]
    };
  }
}

async function leagueMessages(league, { week }, { dataSources }) {
  try {
    const rows = await dataSources.pg.getLeagueMessages(league.id, week);
    if (!rows.length) return [];
    const messageIDs = rows.map(row => row.message_id);
    const templateIDs = [...new Set(rows.map(row => row.template_id))];
    const [selectionRows, templateRows] = await Promise.all([
      dataSources.pg.getMessageSelections(messageIDs),
      dataSources.pg.getMessageTemplatesByIds(templateIDs)
    ]);
    return leagueMessagesFromRows(rows, selectionRows, templateRows);
  } catch (err) {
    console.log(err.stack);
    return [];
  }
}

function resolveMessageSelectionValueType(value) {
  return value.__typename || null;
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function messageError(message) {
  return {
    message: null,
    errors: [{ code: GQL_INVALID_INPUT, message }]
  };
}

function isLeagueConcluded(league) {
  return String(league.season) !== String(process.env.CURRENT_SEASON);
}

function effectiveLeagueWeek(league, column, environmentVariable, fallback) {
  if (league?.[column] === null || league?.[column] === undefined || league?.[column] === '') {
    const environmentWeek = Number(process.env[environmentVariable]);
    return Number.isInteger(environmentWeek) ? environmentWeek : fallback;
  }
  const leagueWeek = Number(league?.[column]);
  if (Number.isInteger(leagueWeek)) return leagueWeek;
  const environmentWeek = Number(process.env[environmentVariable]);
  return Number.isInteger(environmentWeek) ? environmentWeek : fallback;
}

function messageValueFromRow(row) {
  return {
    __typename: 'MessageValue',
    id: row.id,
    key: row.key,
    text: row.text,
    kind: MESSAGE_VALUE_TYPES_BY_DB_VALUE[row.kind]
  };
}

function messageTemplatesFromRows(rows) {
  const templates = new Map();
  const slots = new Map();

  for (const row of rows) {
    let template = templates.get(String(row.template_id));
    if (!template) {
      template = {
        id: row.template_id,
        key: row.template_key,
        format: row.template_format,
        slots: []
      };
      templates.set(String(row.template_id), template);
    }

    if (row.slot_id === null || row.slot_id === undefined) continue;
    let slot = slots.get(String(row.slot_id));
    if (!slot) {
      slot = {
        id: row.slot_id,
        key: row.slot_key,
        position: row.slot_position,
        prompt: row.slot_prompt,
        valueTypes: []
      };
      slots.set(String(row.slot_id), slot);
      template.slots.push(slot);
    }

    const valueType = MESSAGE_VALUE_TYPES_BY_DB_VALUE[row.slot_value_type];
    if (valueType && !slot.valueTypes.includes(valueType)) slot.valueTypes.push(valueType);
  }

  for (const template of templates.values()) {
    template.slots.sort((left, right) => left.position - right.position);
  }
  return [...templates.values()];
}

function messageUser(user, membership) {
  return {
    __typename: 'User',
    id: user.id ?? membership.user_id,
    email: user.email,
    limited: Boolean(user.limited),
    displayName: membership.display_name,
    favoriteTeamID: membership.favorite_team_id,
    membershipLeagueID: membership.league_id
  };
}

async function resolveSubmittedMessageValue(pg, league, leagueID, valueType, valueID) {
  if (valueType === 'CATALOG_VALUE' || valueType === 'ADJECTIVE') {
    const value = await pg.getMessageValueById(valueID);
    if (!value || value.kind !== MESSAGE_VALUE_TYPES[valueType]) {
      return { error: `The selected ${valueType === 'ADJECTIVE' ? 'adjective' : 'catalog value'} is not available.` };
    }
    return {
      text: value.text,
      messageValueID: value.id,
      value: messageValueFromRow(value)
    };
  }

  if (valueType === 'TEAM') {
    const team = await pg.getTeamById(valueID);
    if (!team || team.sports_league !== league.sports_league) {
      return { error: 'The selected team is not available for this league.' };
    }
    return {
      text: team.name,
      teamID: team.id,
      value: {
        __typename: 'SportsTeam',
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        sportsLeague: team.sports_league
      }
    };
  }

  const [membership, user] = await Promise.all([
    pg.getMembership(valueID, leagueID),
    pg.getUserById(valueID)
  ]);
  if (!membership || !user) return { error: 'The selected player is not an active member of this league.' };
  if (user.limited) return { error: 'The selected player is not available as a message value.' };
  return {
    text: membership.display_name,
    leagueMembershipID: membership.id,
    value: messageUser(user, membership)
  };
}

function renderMessage(template, renderedValues) {
  let valid = true;
  const usedKeys = new Set();
  const text = template.format.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, key) => {
    if (!renderedValues.has(key)) {
      valid = false;
      return placeholder;
    }
    usedKeys.add(key);
    return renderedValues.get(key);
  });
  if (usedKeys.size !== renderedValues.size) valid = false;
  return valid ? text : null;
}

function leagueMessagesFromRows(messageRows, selectionRows, templateRows) {
  const templates = new Map(messageTemplatesFromRows(templateRows)
    .map(template => [String(template.id), template]));
  const messagesByID = new Map(messageRows.map(message => [String(message.message_id), message]));
  const selectionsByMessage = new Map();

  for (const row of selectionRows) {
    const messageRow = messagesByID.get(String(row.message_id));
    const template = messageRow && templates.get(String(messageRow.template_id));
    const slot = template?.slots.find(candidate => String(candidate.id) === String(row.template_slot_id));
    if (!slot) continue;

    let value;
    if (row.message_value_id !== null && row.message_value_id !== undefined) {
      value = messageValueFromRow({
        id: row.message_value_id,
        key: row.message_value_key,
        kind: row.message_value_kind,
        text: row.message_value_text
      });
    } else if (row.league_membership_id !== null && row.league_membership_id !== undefined) {
      value = {
        __typename: 'User',
        id: row.selected_user_id,
        email: row.selected_user_email,
        displayName: row.selected_user_display_name,
        membershipLeagueID: row.selected_user_league_id
      };
    } else {
      value = {
        __typename: 'SportsTeam',
        id: row.team_id,
        name: row.team_name,
        shortName: row.team_short_name,
        sportsLeague: row.team_sports_league
      };
    }

    const selections = selectionsByMessage.get(String(row.message_id)) || [];
    selections.push({ slot, value });
    selectionsByMessage.set(String(row.message_id), selections);
  }

  return messageRows.map(row => ({
    id: row.message_id,
    week: row.week,
    createdAt: new Date(row.created_at).toISOString(),
    author: {
      __typename: 'User',
      id: row.author_user_id,
      email: row.author_email,
      limited: Boolean(row.author_limited),
      displayName: row.author_display_name,
      membershipLeagueID: row.league_id
    },
    template: templates.get(String(row.template_id)),
    selections: selectionsByMessage.get(String(row.message_id)) || []
  }));
}

exports.messageTemplates = messageTemplates;
exports.messageValues = messageValues;
exports.submitMessage = submitMessage;
exports.leagueMessages = leagueMessages;
exports.resolveMessageSelectionValueType = resolveMessageSelectionValueType;
