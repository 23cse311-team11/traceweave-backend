import httpStatus from 'http-status';
import { CollectionService } from '../services/collection.service.js';
import { workspaceService } from '../services/workspace.service.js';


const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const createCollection = catchAsync(async (req, res) => {
  const { name, parentId } = req.body;
  const { workspaceId } = req.params;
  const userId = req.user.id;
  console.log('userId:', req.user.id);
 console.log('workspaceId:', workspaceId);

  // Validate workspace ownership / access
  await workspaceService.getWorkspaceById(workspaceId, userId);

  const collection = await CollectionService.createCollection({
    workspaceId,
    name,
    parentId,
  });

  res.status(httpStatus.CREATED).send(collection);
});

export const getCollectionsByWorkspace = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;

  const collections =
    await CollectionService.getCollectionsByWorkspace(workspaceId);

  res.status(httpStatus.OK).send(collections);
});

export const deleteCollection = catchAsync(async (req, res) => {
  const { collectionId } = req.params;

  const result =
    await CollectionService.softDeleteCollection(collectionId);

  res.status(httpStatus.OK).send(result);
});
