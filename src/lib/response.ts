export function redirect(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}
