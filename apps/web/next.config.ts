import type { NextConfig } from "next";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";

// Next.js bloquea por defecto los recursos de desarrollo (JS y CSS de
// `/_next/static/chunks`, `/_next/hmr`) cuando la petición llega con un
// `Origin` que no reconoce. El HTML sí se sirve, pero sin JS no hay
// hidratación y sin CSS no hay estilos: la página aparece completamente en
// blanco. Es el síntoma de abrir la app por una IP de red (p. ej. Tailscale)
// en lugar de por `localhost`.
//
// Se declara por entorno y no con una IP fija en el repositorio: cada
// entorno declara sus propios orígenes y, sin la variable, el comportamiento
// por defecto de Next se mantiene intacto.
const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${API_BASE_URL}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
