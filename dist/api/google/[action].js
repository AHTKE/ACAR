import { createActionHandler } from '../../vercel-dispatch.js';
import { GOOGLE_ACTIONS } from '../../api-routes.js';

export default createActionHandler('/api/google', GOOGLE_ACTIONS);
