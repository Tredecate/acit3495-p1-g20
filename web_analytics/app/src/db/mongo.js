const { MongoClient } = require("mongodb");
const { mongo } = require("../config/env");

const uri = `mongodb://${encodeURIComponent(mongo.user)}:${encodeURIComponent(mongo.password)}@${mongo.host}:${mongo.port}/${mongo.database}?authSource=admin`;

let mongoClient;

async function getMongoClient() {
  if (!mongoClient) {
    mongoClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000
    });
    await mongoClient.connect();
  }

  return mongoClient;
}

async function getSnapshotsCollection() {
  const client = await getMongoClient();
  return client.db(mongo.database).collection("analytics_snapshots");
}

async function getLatestSnapshot() {
  const collection = await getSnapshotsCollection();
  return collection.find({}).sort({ calculated_at: -1 }).limit(1).next();
}

async function getTimelineSnapshots() {
  const collection = await getSnapshotsCollection();
  return collection
    .aggregate([
      {
        $project: {
          _id: 0,
          calculated_at: 1,
          group_count: {
            $size: {
              $ifNull: ["$groups", []]
            }
          }
        }
      },
      {
        $match: {
          calculated_at: {
            $ne: null
          }
        }
      },
      {
        $sort: {
          calculated_at: 1
        }
      }
    ])
    .toArray();
}

async function getSnapshotsInRange(start, end) {
  const collection = await getSnapshotsCollection();
  return collection
    .find({
      calculated_at: {
        $gte: start,
        $lte: end
      }
    })
    .sort({ calculated_at: 1 })
    .toArray();
}

async function pingDb() {
  const client = await getMongoClient();
  await client.db(mongo.database).command({ ping: 1 });
}

module.exports = {
  getLatestSnapshot,
  getTimelineSnapshots,
  getSnapshotsInRange,
  pingDb
};
