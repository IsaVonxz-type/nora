import { Router } from "express";
import { resolveOrganization } from "../controllers/organizationController.js";

const router = Router();

router.get("/", resolveOrganization);

export default router;
