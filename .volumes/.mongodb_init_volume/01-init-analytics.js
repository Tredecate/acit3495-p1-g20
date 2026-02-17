const dbName = process.env.MONGO_INITDB_DATABASE || 'analytics';
db = db.getSiblingDB(dbName);

const hasCollection = db
  .getCollectionInfos({ name: 'analytics_snapshots' })
  .length > 0;

if (!hasCollection) {
  db.createCollection('analytics_snapshots');
}

db.analytics_snapshots.createIndex(
  { calculated_at: -1 },
  { name: 'idx_calculated_at_desc' }
);

db.analytics_snapshots.createIndex(
  { 'groups.metric_type': 1, 'groups.location': 1 },
  { name: 'idx_groups_metric_location' }
);
