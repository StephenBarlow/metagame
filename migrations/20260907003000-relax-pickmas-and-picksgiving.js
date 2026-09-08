'use strict';

var dbm;
var type;
var seed;

/**
  * We receive the dbmigrate dependency from dbmigrate initially.
  * This enables us to not have to rely on NODE_PATH.
  */
exports.setup = function(options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
};

exports.up = function(db) {
  return db.runSql(`UPDATE achievements
    SET description = CASE key
          WHEN 'PICKMAS' THEN 'Pick at least one team from a game on December 24th and/or 25th.'
          WHEN 'PICKSGIVING' THEN 'Pick at least one team from a game on Thanksgiving.'
        END,
        condition_config = CASE key
          WHEN 'PICKMAS' THEN '{"tag":"christmas","picked_team_count":1}'::jsonb
          WHEN 'PICKSGIVING' THEN '{"tag":"thanksgiving","picked_team_count":1}'::jsonb
        END
    WHERE key IN ('PICKMAS', 'PICKSGIVING')`);
};

exports.down = function(db) {
  return db.runSql(`UPDATE achievements
    SET description = CASE key
          WHEN 'PICKMAS' THEN 'Pick two teams from games on December 24th and/or 25th.'
          WHEN 'PICKSGIVING' THEN 'Pick two teams from games on Thanksgiving.'
        END,
        condition_config = CASE key
          WHEN 'PICKMAS' THEN '{"tag":"christmas","picked_team_count":2}'::jsonb
          WHEN 'PICKSGIVING' THEN '{"tag":"thanksgiving","picked_team_count":2}'::jsonb
        END
    WHERE key IN ('PICKMAS', 'PICKSGIVING')`);
};

exports._meta = {
  "version": 1
};
