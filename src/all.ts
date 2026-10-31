/** API + worker in one process, for single-instance free hosting (e.g. Render free tier). */
import { startApi } from "./server";
import { startWorker } from "./worker";

startApi();
startWorker();
