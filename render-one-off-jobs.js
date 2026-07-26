'use strict';

function achievementEvaluationCommand(mode, leagueId, week) {
  if (!['pick-locked', 'week-finalized'].includes(mode)) {
    throw new Error(`Unsupported achievement evaluation mode: ${mode}`);
  }
  if (!Number.isInteger(leagueId) || leagueId < 1 || !Number.isInteger(week) || week < 1) {
    throw new Error('Achievement job league ID and week must be positive integers.');
  }
  return `bun run achievements:evaluate -- ${mode} --league-id ${leagueId} --week ${week}`;
}

async function createRenderOneOffJob(startCommand, options = {}) {
  const apiKey = options.apiKey ?? process.env.RENDER_API_KEY;
  const serviceId = options.serviceId ?? process.env.RENDER_BASE_SERVICE_ID ?? process.env.RENDER_SERVICE_ID;
  const fetchImpl = options.fetch ?? global.fetch;
  if (!apiKey || !serviceId) return null;

  const body = { startCommand };
  const planId = options.planId ?? process.env.RENDER_ONE_OFF_JOB_PLAN_ID;
  if (planId) body.planId = planId;

  const response = await fetchImpl(`https://api.render.com/v1/services/${serviceId}/jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Render one-off job request failed (${response.status}): ${details}`);
  }
  return response.json();
}

async function startAchievementEvaluationJob(mode, leagueId, week, options = {}) {
  const startCommand = achievementEvaluationCommand(mode, leagueId, week);
  return createRenderOneOffJob(startCommand, options);
}

module.exports = {
  achievementEvaluationCommand,
  createRenderOneOffJob,
  startAchievementEvaluationJob
};
