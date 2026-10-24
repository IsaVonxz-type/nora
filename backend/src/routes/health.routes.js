import { Router } from "express";
import { readiness } from "../controllers/healthController.js";

const router = Router();

router.get("/health", readiness);

export default router;
