/**
 * A JSON body arriving over the network is untrusted input, and an uncaught
 * `req.json()` throw becomes a 500 with a stack trace. 400 is the honest answer
 * to a malformed request, so every POST route parses through here rather than
 * repeating a try/catch four times.
 */
export async function readJson<T>(req: Request): Promise<T | Response> {
  try {
    const body: unknown = await req.json();
    // Arrays and bare scalars are valid JSON but never a valid body here.
    if (body && typeof body === "object" && !Array.isArray(body)) return body as T;
  } catch {
    /* falls through to the same 400 as a wrong-shaped body */
  }
  return Response.json({ error: "expected a JSON object body" }, { status: 400 });
}
