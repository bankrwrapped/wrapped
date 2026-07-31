import { wrappedService } from "../services/wrappedService";

export async function getWrappedController(req: Request, handle: string): Promise<Response> {
  if (!handle || handle.trim().length === 0) {
    return Response.json({ error: "handle is required" }, { status: 400 });
  }
  const row = await wrappedService.getWrapped(handle.trim());
  if (!row) {
    return Response.json({ error: "handle not found on Bankr" }, { status: 404 });
  }
  return Response.json(row);
}

export async function getLeaderboardController(): Promise<Response> {
  const entries = await wrappedService.getLeaderboard(20);
  return Response.json({ entries });
}
