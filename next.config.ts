import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Garantiza que el motor de Prisma (binario .node) entre en el
  // paquete standalone: su ruta se resuelve en tiempo de ejecución
  // y el tracer por defecto no la detecta.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/client/**/*"],
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
