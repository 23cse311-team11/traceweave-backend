import express from 'express';
import authRoute from './auth.routes.js';
import uploadRoute from './upload.routes.js';
import collectionRoute from './collection.route.js';
import workspaceRoute from './workspace.routes.js';
import requestRoute from './request.route.js';
import workflowRoute from './workflow.routes.js';
import environmentRoute from './environment.routes.js';
import executionRoute from './execution.route.js';
import notificationRoute from './notification.routes.js';
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
  {
    path: '/requests',
    route: requestRoute,
  },
  {
    path: '/workflows',
    route: workflowRoute,
  },
  {
    path: '/environments',
    route: environmentRoute,
  },
  {
    path: '/executions',
    route: executionRoute,
  },
  {
    path: '/notifications',
    route: notificationRoute,
  }
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;