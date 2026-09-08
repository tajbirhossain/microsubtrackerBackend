import { Router } from "express";
import * as parserController from "../controllers/parser.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRequest } from "../middleware/validate.js";
import {
  confirmParserSchema,
  ingestParserSchema,
  listParserQuerySchema,
  parserEventIdParamsSchema,
} from "../schemas/parser.schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.post(
  "/ingest",
  validateRequest(ingestParserSchema),
  asyncHandler(parserController.ingest)
);

router.get(
  "/candidates",
  validateRequest(listParserQuerySchema, "query"),
  asyncHandler(parserController.listCandidates)
);

router.get(
  "/:id",
  validateRequest(parserEventIdParamsSchema, "params"),
  asyncHandler(parserController.getEvent)
);

router.post(
  "/:id/confirm",
  validateRequest(parserEventIdParamsSchema, "params"),
  validateRequest(confirmParserSchema),
  asyncHandler(parserController.confirm)
);

router.post(
  "/:id/reject",
  validateRequest(parserEventIdParamsSchema, "params"),
  asyncHandler(parserController.reject)
);

export default router;
