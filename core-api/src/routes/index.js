import express from 'express';
import authRoute from './auth.routes.js';
import uploadRoute from './upload.routes.js';
import collectionRoute from './collection.route.js';
import workspaceRoute from './workspace.routes.js';
const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/upload',
    route: uploadRoute,
  },
  {
    path: '/collections',
    route: collectionRoute,
  },
  {
    path: '/workspaces',
    route: workspaceRoute,
  },

];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;