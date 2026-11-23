import { createActionHandler } from '../../vercel-dispatch.js';
import { ACTIVATION_ACTIONS } from '../../api-routes.js';

export default createActionHandler('/api/activation', ACTIVATION_ACTIONS);
