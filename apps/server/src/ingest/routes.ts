import type { Hono } from "hono";

import { registerIngestAttachmentRoutes } from "./attachment-routes";
import { registerIngestExecutionRoutes } from "./execution-routes";

export function registerIngestRoutes(app: Hono): void {
	registerIngestExecutionRoutes(app);
	registerIngestAttachmentRoutes(app);
}
