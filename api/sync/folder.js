/* مسار Vercel: /api/sync/folder — يشغّل نفس worker.js */
import run from '../../vercel-run.js';

export default function handler(req, res) {
  return run(req, res, "/api/sync/folder");
}
