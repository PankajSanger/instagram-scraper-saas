const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'db', 'local.json');

const defaultData = {
  users: [],
  jobs: [],
  subscriptions: [],
  usage: [],
  payments: []
};

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2));
  }
}

function readDb() {
  ensureDb();
  const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

  // Lightweight migrations for old local DB files.
  if (!Array.isArray(parsed.users)) parsed.users = [];
  if (!Array.isArray(parsed.jobs)) parsed.jobs = [];
  if (!Array.isArray(parsed.subscriptions)) parsed.subscriptions = [];
  if (!Array.isArray(parsed.usage)) parsed.usage = [];
  if (!Array.isArray(parsed.payments)) parsed.payments = [];

  return parsed;
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function withDb(mutator) {
  const data = readDb();
  const result = mutator(data);
  writeDb(data);
  return result;
}

module.exports = { readDb, writeDb, withDb };
