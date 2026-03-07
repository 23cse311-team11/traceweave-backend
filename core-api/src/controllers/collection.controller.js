import httpStatus from 'http-status';
import { CollectionService } from '../services/collection.service.js';
import { workspaceService } from '../services/workspace.service.js';


const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const createCollection = catchAsync(async (req, res) => {
  const { name, parentId } = req.body;
  const { workspaceId } = req.params;
  // Removed userId from here because the Service doesn't take it
  const collection = await CollectionService.createCollection({
    workspaceId,
    name,
    parentId,
  });

  res.status(httpStatus.CREATED).send(collection);
});

export const getCollectionsByWorkspace = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  // Removed userId parameter to match the Service signature
  const collections = await CollectionService.getCollectionsByWorkspace(workspaceId);
  res.status(httpStatus.OK).send(collections);
});

export const deleteCollection = catchAsync(async (req, res) => {
  const { collectionId } = req.params;
  // Removed userId
  const result = await CollectionService.softDeleteCollection(collectionId);
  res.status(httpStatus.OK).send(result);
});

export const updateCollection = catchAsync(async (req, res) => {
  const { collectionId } = req.params;
  const { name } = req.body;
  // Removed userId
  const collection = await CollectionService.updateCollection(
    collectionId, 
    { name }
  );

  res.status(httpStatus.OK).send(collection);
});

export const duplicateCollection = catchAsync(async (req, res) => {
  const { collectionId } = req.params;
  const result = await CollectionService.duplicateCollection(collectionId);
  res.status(httpStatus.CREATED).send(result);
});