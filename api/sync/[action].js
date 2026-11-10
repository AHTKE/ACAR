import { createActionHandler } from '../../vercel-dispatch.js';
import { SYNC_ACTIONS } from '../../api-routes.js';

export default createActionHandler('/api/sync', SYNC_ACTIONS);
