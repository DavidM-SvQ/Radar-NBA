import express from 'express';

// Placeholder overwritten during `npm run build` by scripts/build-vercel-api.mjs
export const app = express();
app.use((_req, res) => {
  res.status(503).json({
    error: 'Servidor API pendiente de compilación (ejecuta npm run build).',
  });
});
export default app;
