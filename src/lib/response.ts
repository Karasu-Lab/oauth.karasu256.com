export function reject(status: number, error: string) {
  return Response.json({ error }, { status });
}

export function redirect(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}
