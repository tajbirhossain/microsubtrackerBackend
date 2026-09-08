import type { Request, Response } from "express";
import * as currencyService from "../services/currency.service.js";

export async function getRates(req: Request, res: Response): Promise<void> {
  const base = String(req.query.base ?? "USD").toUpperCase();
  const bundle = await currencyService.getRatesBundle(base);

  res.json({
    success: true,
    data: {
      base: bundle.base,
      rates: bundle.rates,
      fetchedAt: bundle.fetchedAt,
      source: bundle.source,
      stale: bundle.stale,
      fallback: bundle.fallback,
    },
  });
}

export async function convert(req: Request, res: Response): Promise<void> {
  const result = await currencyService.convertCurrency({
    amount: Number(req.query.amount),
    from: String(req.query.from),
    to: String(req.query.to),
  });

  res.json({
    success: true,
    data: result,
  });
}

export async function getSupported(
  _req: Request,
  res: Response
): Promise<void> {
  res.json({
    success: true,
    data: {
      currencies: currencyService.listSupportedCurrencies(),
    },
  });
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  const base = String(req.query.base ?? "USD").toUpperCase();
  const status = await currencyService.getCurrencyStatus(base);
  res.json({
    success: true,
    data: status,
  });
}
