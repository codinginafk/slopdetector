/**
 * api/ping.js - minimal probe. Express-style (req, res) pattern,
 * same as the working api/siteverify.js on the main project.
 */

export default async function handler(req, res) {
  console.log("[ping] start");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ pong: true, method: req.method, time: Date.now() });
}
