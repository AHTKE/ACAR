/* مسار Vercel: /api/google/status — يشغّل نفس worker.js */
import run from '../../vercel-run.js';

export default function handler(req, res) {
  return run(req, res, "/api/google/status");
}
