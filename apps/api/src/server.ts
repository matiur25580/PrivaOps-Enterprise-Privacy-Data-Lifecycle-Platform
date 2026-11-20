import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env } from './env.js';

const app = createApp();
let server: ReturnType<typeof app.listen> | undefined;

async function start() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  server = app.listen(env.API_PORT, () => {
    console.info(`PrivaOps API listening on port ${env.API_PORT}`);
  });
}

async function shutdown(signal: string) {
  console.info(`${signal} received; shutting down gracefully.`);
  server?.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch(async (error: unknown) => {
  console.error('Failed to start PrivaOps API:', error);
  await mongoose.disconnect();
  process.exit(1);
});