import { classifyByLlm } from "../src/core/classify";
import * as dotenv from "dotenv";

dotenv.config();

async function runLiveTriage() {
  console.log("\n=======================================================");
  console.log("🔥 TESTING LIVE GEMINI LLM CLASSIFIER ON RAZORPAY FAILURE");
  console.log("=======================================================\n");

  // An ambiguous failure: reason is null, but bank and step are present
  const failurePayload = {
    paymentId: "pay_live_test_9876",
    reason: null,
    source: "bank",
    step: "payment_authorization",
    method: "netbanking",
    bank: "HDFC",
    description: "Transaction timed out while awaiting authorization from issuer node",
  };

  console.log("Input Payment Failure Envelope:", JSON.stringify(failurePayload, null, 2));
  console.log("\nCalling Gemini LLM via Vercel AI SDK...");

  const result = await classifyByLlm(failurePayload as any);

  console.log("\n>>> LIVE LLM CLASSIFICATION RESULT:");
  console.log("• Diagnosed Reason:", result.reason);
  console.log("• Recoverability Bucket:", result.bucket);
  console.log("• AI Rationale:", result.rationale);
  console.log("• Source:", result.source);
  if (result.fellBackBecause) {
    console.log("• Fallback Reason:", result.fellBackBecause);
  }
  console.log("=======================================================\n");
}

runLiveTriage();
