const { parse } = require('graphql');
const fs = require('fs');

const schema = fs.readFileSync('./schema.graphql',
  {encoding:'utf8', flag:'r'});

exports.typeDefs = parse(schema);
