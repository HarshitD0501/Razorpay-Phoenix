/**
 * W1/W2/W3 in one route: given a case, what does the core do in each window?
 * The dashboard's What-If form and the ladder demo both POST here.
 *
 * Same decide() as W0 and the eval. There is no second engine.
 */
import { NextResponse } from "next/server";
import { classifyByLlm } from "@/core/classify";
import { decide } from "@/core/decide";
import { readJson } from "@/core/req";
import { DEFAULTS } from "@/eval/arms";
import { WINDOWS, type Window } from "@/core/types";
import type { FailureEnvelope } from "@/core/types";

export async function POST(req: Request) {
  const body = await readJson<{
    envelope: FailureEnvelope;
    invoiceRupees?: number;
    mandateAmountRupees?: number;
    istHour?: number;
    priorContacts?: number;
    consentWhatsapp?: boolean;
    retriesUsed?: number;
    discountCeilingRupees?: number;
  }>(req);
  if (body instanceof Response) return body;
  if (!body.envelope || typeof body.envelope !== "object") {
    return NextResponse.json({ error: "envelope is required" }, { status: 400 });
  }

  const cls = await classifyByLlm(body.envelope);
  const invoice = body.invoiceRupees ?? 499;

  const perWindow = WINDOWS.map((window: Window) => {
    const d = decide({
      bucket: cls.bucket,
      invoiceRupees: invoice,
      ctx: {
        window,
        istHour: body.istHour ?? 11,
        priorContacts: body.priorContacts ?? 0,
        contactCapPerWeek: DEFAULTS.contactCapPerWeek,
        consentWhatsapp: body.consentWhatsapp ?? false,
        retriesUsed: body.retriesUsed ?? 0,
        retryCap: DEFAULTS.retryCap,
        mandateAmountRupees: body.mandateAmountRupees ?? invoice,
        upiAutopayCeilingRupees: DEFAULTS.upiAutopayCeilingRupees,
        discountRupees: Math.round(invoice * 0.2),
        discountCeilingRupees: body.discountCeilingRupees ?? DEFAULTS.discountCeilingRupees,
        railDegraded: false,
      },
    });
    return {
      window,
      chosen: d.chosen,
      vetoes: d.vetoes,
      // Full priced candidate set — this is what the audit viewer renders.
      candidates: d.candidates.map((c) => ({
        action: c.action,
        p: c.p.toFixed(3),
        gain: c.gain.toFixed(0),
        cost: c.cost.toFixed(0),
        ev: c.ev.toFixed(0),
        vetoes: c.gateVetoes,
      })),
    };
  });

  return NextResponse.json({
    classification: cls,
    perWindow,
    tier: "B",
  });
}
