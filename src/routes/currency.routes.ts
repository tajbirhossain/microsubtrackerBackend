import { Router } from "express";
import * as currencyController from "../controllers/currency.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRequest } from "../middleware/validate.js";
import {
  convertQuerySchema,
  ratesQuerySchema,
} from "../schemas/currency.schemas.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(asyncHandler(requireAuth));

router.get(
  "/rates",
  validateRequest(ratesQuerySchema, "query"),
  asyncHandler(currencyController.getRates)
);

router.get(
  "/convert",
  validateRequest(convertQuerySchema, "query"),
  asyncHandler(currencyController.convert)
);

router.get("/supported", asyncHandler(currencyController.getSupported));

router.get(
  "/status",
  validateRequest(ratesQuerySchema, "query"),
  asyncHandler(currencyController.getStatus)
);

export default router;
