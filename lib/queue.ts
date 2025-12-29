import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL is not configured");
}

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const transcriptionQueue = new Queue("transcriptions", {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

export const transcriptionQueueEvents = new QueueEvents("transcriptions", {
  connection,
});
