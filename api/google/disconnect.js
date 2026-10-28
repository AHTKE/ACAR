/* مسار Vercel: /api/google/disconnect — يشغّل نفس worker.js */
import run from '../../vercel-run.js';

export default function handler(req, res) {
  return run(req, res, "/api/google/disconnect");
}
