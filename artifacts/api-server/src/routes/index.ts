import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clipioRouter from "./clipio";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/clipio", clipioRouter);

export default router;
