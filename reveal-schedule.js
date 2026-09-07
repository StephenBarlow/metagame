'use strict';

const easternSlotFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function isSundayOnePmEastern(startTime) {
  const instant = new Date(startTime);
  if (Number.isNaN(instant.getTime())) return false;
  const parts = Object.fromEntries(
    easternSlotFormatter.formatToParts(instant)
      .filter(part => ['weekday', 'hour', 'minute'].includes(part.type))
      .map(part => [part.type, part.value])
  );
  return parts.weekday === 'Sun' && parts.hour === '13' && parts.minute === '00';
}

function sundayOnePmEasternRevealAt(games) {
  const matchingStartTimes = games
    .map(game => new Date(game.start_time))
    .filter(startTime => !Number.isNaN(startTime.getTime()) && isSundayOnePmEastern(startTime));
  if (!matchingStartTimes.length) return null;
  return new Date(Math.min(...matchingStartTimes.map(startTime => startTime.getTime())));
}

module.exports = {
  isSundayOnePmEastern,
  sundayOnePmEasternRevealAt
};
