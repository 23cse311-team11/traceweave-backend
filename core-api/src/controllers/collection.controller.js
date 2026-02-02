import httpStatus from 'http-status';
import { CollectionService } from '../services/collection.service.js';

const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const createCollection = catchAsync(async (req, res) => {
  const { workspaceId, name, parentId } = req.body;

  const collection = await CollectionService.createCollection({
    workspaceId,
    name,
    parentId
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

  await CollectionService.softDeleteCollection(collectionId);

  res.status(httpStatus.NO_CONTENT).send();
});
