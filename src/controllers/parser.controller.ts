import type { Request, Response } from "express";
import * as parserService from "../services/parser.service.js";

export async function ingest(req: Request, res: Response): Promise<void> {
  const result = await parserService.ingestParserEvent(req.user!.id, req.body);
  res.status(201).json({
    success: true,
    message: result.needsManualEntry
      ? "Parsed with low confidence — manual confirmation needed"
      : "Parsed successfully",
    data: result,
  });
}

export async function listCandidates(req: Request, res: Response): Promise<void> {
  const items = await parserService.listParserCandidates(
    req.user!.id,
    req.query as never
  );
  res.json({
    success: true,
    data: { items },
  });
}

export async function getEvent(req: Request, res: Response): Promise<void> {
  const event = await parserService.getParserEvent(
    req.user!.id,
    String(req.params.id)
  );
  res.json({
    success: true,
    data: { event },
  });
}

export async function confirm(req: Request, res: Response): Promise<void> {
  const result = await parserService.confirmParserEvent(
    req.user!.id,
    String(req.params.id),
    req.body
  );
  res.json({
    success: true,
    message: "Subscription created from parser candidate",
    data: result,
  });
}

export async function reject(req: Request, res: Response): Promise<void> {
  const event = await parserService.rejectParserEvent(
    req.user!.id,
    String(req.params.id)
  );
  res.json({
    success: true,
    message: "Parser candidate rejected",
    data: { event },
  });
}
