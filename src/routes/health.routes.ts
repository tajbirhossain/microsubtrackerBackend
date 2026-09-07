import { Router } from "express";
import { getHealth, getReady } from "../controllers/health.controller.js";

const router = Router();

router.get("/", getHealth);
router.get("/ready", getReady);

export default router;
